import { getDownloadURL, ref, uploadBytesResumable, UploadTask } from 'firebase/storage';
import { auth, storage } from '../lib/firebase';
import { AspectRatioType, MediaType } from '../types';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export class UploadCancelledError extends Error {
  readonly isCancelled = true;
  constructor(message = 'Upload was cancelled.') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

export type UploadPhase =
  | 'preparing'
  | 'uploading'
  | 'paused-offline'
  | 'retrying'
  | 'stalled'
  | 'verifying'
  | 'completed';

export interface UploadTelemetry {
  phase: UploadPhase;
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  elapsedMs: number;
  attempt: number;
}

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
  bytesTransferred: number;
  elapsedMs: number;
}

export interface PreparedMedia {
  uploadFile: File;
  previewUrl: string;
  thumbnailFile?: File;
  thumbnailPreviewUrl?: string;
  mediaType: MediaType;
  suggestedAspectRatio: AspectRatioType;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
  durationSeconds?: number;
  formatLabel: string;
  processingMs: number;
  wasCompressed: boolean;
  fingerprint: string;
}

export function inferMimeType(file: File): string {
  const raw = (file.type || '').toLowerCase().trim();
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw && (ALLOWED_IMAGE_TYPES.includes(raw) || ALLOWED_VIDEO_TYPES.includes(raw))) {
    return raw;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_MIME[ext] || raw;
}

export function validateMediaFile(
  file: File,
  maxSizeMB: number
): { valid: boolean; mediaType?: MediaType; mimeType?: string; error?: string } {
  const mimeType = inferMimeType(file);
  const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: 'Unsupported format. Please upload JPG, PNG, WebP, GIF, MP4, WebM, or MOV files.',
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'The selected file appears empty. Please choose another file.',
    };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File exceeds the ${maxSizeMB} MB upload limit. Please select a smaller file.`,
    };
  }

  return {
    valid: true,
    mediaType: isVideo ? 'video' : 'image',
    mimeType,
  };
}

let webpSupportPromise: Promise<boolean> | null = null;

export function supportsWebPEncoding(): Promise<boolean> {
  if (webpSupportPromise) return webpSupportPromise;
  webpSupportPromise = new Promise((resolve) => {
    try {
      if (typeof document === 'undefined') {
        resolve(false);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      if (!canvas.toBlob) {
        resolve(false);
        return;
      }
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          resolve(Boolean(blob && blob.type === 'image/webp'));
        },
        'image/webp',
        0.8
      );
    } catch {
      resolve(false);
    }
  });
  return webpSupportPromise;
}

export function suggestAspectRatio(
  width: number,
  height: number,
  mediaType: MediaType
): AspectRatioType {
  if (!width || !height) return mediaType === 'video' ? 'vertical' : 'landscape';
  const ratio = width / height;
  if (ratio <= 0.65) return 'vertical';
  if (ratio < 0.9) return 'portrait';
  if (ratio <= 1.15) return 'square';
  return 'landscape';
}

function buildFileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function replaceFileExtension(fileName: string, newExt: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'media';
  return `${base}.${newExt}`;
}

async function decodeImageSource(
  file: File
): Promise<{
  width: number;
  height: number;
  drawToCanvas: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawToCanvas: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        drawToCanvas: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image file.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!canvas.toBlob) {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function prepareImageForUpload(
  file: File,
  options: {
    maxDimension?: number;
    quality?: number;
    skipReencodeMaxBytes?: number;
  } = {}
): Promise<PreparedMedia> {
  const startedAt = performance.now();
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.82;
  const skipReencodeMaxBytes = options.skipReencodeMaxBytes ?? 100 * 1024;
  const mimeType = inferMimeType(file) || 'image/jpeg';
  const fingerprint = buildFileFingerprint(file);

  // Preserve animated GIFs without re-encoding
  if (mimeType === 'image/gif') {
    return {
      uploadFile: file,
      previewUrl: URL.createObjectURL(file),
      mediaType: 'image',
      suggestedAspectRatio: 'square',
      originalSize: file.size,
      optimizedSize: file.size,
      width: 0,
      height: 0,
      formatLabel: 'GIF',
      processingMs: Math.round(performance.now() - startedAt),
      wasCompressed: false,
      fingerprint,
    };
  }

  let source: Awaited<ReturnType<typeof decodeImageSource>> | null = null;
  try {
    source = await decodeImageSource(file);
    const { width, height } = source;
    const suggested = suggestAspectRatio(width, height, 'image');
    const needsResize = Math.max(width, height) > maxDimension;

    // Skip unnecessary re-encoding when already small and within dimensions
    if (!needsResize && file.size <= skipReencodeMaxBytes && (mimeType === 'image/webp' || mimeType === 'image/jpeg')) {
      return {
        uploadFile: file,
        previewUrl: URL.createObjectURL(file),
        mediaType: 'image',
        suggestedAspectRatio: suggested,
        originalSize: file.size,
        optimizedSize: file.size,
        width,
        height,
        formatLabel: mimeType === 'image/webp' ? 'WebP' : 'JPEG',
        processingMs: Math.round(performance.now() - startedAt),
        wasCompressed: false,
        fingerprint,
      };
    }

    const scale = needsResize ? maxDimension / Math.max(width, height) : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: mimeType === 'image/png' || mimeType === 'image/webp' });
    if (!ctx) {
      return {
        uploadFile: file,
        previewUrl: URL.createObjectURL(file),
        mediaType: 'image',
        suggestedAspectRatio: suggested,
        originalSize: file.size,
        optimizedSize: file.size,
        width,
        height,
        formatLabel: mimeType.replace('image/', '').toUpperCase(),
        processingMs: Math.round(performance.now() - startedAt),
        wasCompressed: false,
        fingerprint,
      };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    source.drawToCanvas(ctx, targetW, targetH);

    const canWebP = await supportsWebPEncoding();
    const targetMime = canWebP ? 'image/webp' : 'image/jpeg';
    const targetExt = canWebP ? 'webp' : 'jpg';

    const blob = await canvasToBlobAsync(canvas, targetMime, canWebP ? quality : Math.min(0.86, quality + 0.03));
    canvas.width = 0;
    canvas.height = 0;

    // Avoid inflating already-efficient files if no resize was needed
    if (!blob || (!needsResize && blob.size >= file.size)) {
      const normalizedOriginal =
        file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
      return {
        uploadFile: normalizedOriginal,
        previewUrl: URL.createObjectURL(normalizedOriginal),
        mediaType: 'image',
        suggestedAspectRatio: suggested,
        originalSize: file.size,
        optimizedSize: normalizedOriginal.size,
        width,
        height,
        formatLabel: mimeType.replace('image/', '').toUpperCase(),
        processingMs: Math.round(performance.now() - startedAt),
        wasCompressed: false,
        fingerprint,
      };
    }

    const optimizedFile = new File([blob], replaceFileExtension(file.name, targetExt), {
      type: targetMime,
      lastModified: Date.now(),
    });

    return {
      uploadFile: optimizedFile,
      previewUrl: URL.createObjectURL(optimizedFile),
      mediaType: 'image',
      suggestedAspectRatio: suggested,
      originalSize: file.size,
      optimizedSize: optimizedFile.size,
      width: targetW,
      height: targetH,
      formatLabel: canWebP ? 'WebP' : 'JPEG',
      processingMs: Math.round(performance.now() - startedAt),
      wasCompressed: true,
      fingerprint,
    };
  } finally {
    source?.cleanup();
  }
}

export async function prepareVideoForUpload(file: File): Promise<PreparedMedia> {
  const startedAt = performance.now();
  const mimeType = inferMimeType(file) || 'video/mp4';
  const normalizedFile =
    file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
  const previewUrl = URL.createObjectURL(normalizedFile);
  const fingerprint = buildFileFingerprint(file);

  const meta = await new Promise<{
    width: number;
    height: number;
    durationSeconds?: number;
    thumbnailFile?: File;
    thumbnailPreviewUrl?: string;
  }>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (result: {
      width: number;
      height: number;
      durationSeconds?: number;
      thumbnailFile?: File;
      thumbnailPreviewUrl?: string;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish({ width: 0, height: 0 });
    }, 4000);

    video.onerror = () => finish({ width: 0, height: 0 });

    video.onloadedmetadata = () => {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      if (!vw || !vh) {
        finish({ width: vw, height: vh, durationSeconds: duration });
        return;
      }
      const seekTarget = duration && duration > 0.6 ? Math.min(0.5, duration * 0.2) : 0.05;
      try {
        video.currentTime = seekTarget;
      } catch {
        finish({ width: vw, height: vh, durationSeconds: duration });
      }
    };

    video.onseeked = async () => {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      try {
        const maxThumbDim = 640;
        const scale = Math.max(vw, vh) > maxThumbDim ? maxThumbDim / Math.max(vw, vh) : 1;
        const tw = Math.max(1, Math.round(vw * scale));
        const th = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish({ width: vw, height: vh, durationSeconds: duration });
          return;
        }
        ctx.drawImage(video, 0, 0, tw, th);
        const canWebP = await supportsWebPEncoding();
        const thumbMime = canWebP ? 'image/webp' : 'image/jpeg';
        const thumbExt = canWebP ? 'webp' : 'jpg';
        const blob = await canvasToBlobAsync(canvas, thumbMime, 0.78);
        canvas.width = 0;
        canvas.height = 0;

        if (!blob) {
          finish({ width: vw, height: vh, durationSeconds: duration });
          return;
        }

        const thumbFile = new File([blob], replaceFileExtension(`thumb_${file.name}`, thumbExt), {
          type: thumbMime,
          lastModified: Date.now(),
        });
        finish({
          width: vw,
          height: vh,
          durationSeconds: duration,
          thumbnailFile: thumbFile,
          thumbnailPreviewUrl: URL.createObjectURL(thumbFile),
        });
      } catch {
        finish({ width: vw, height: vh, durationSeconds: duration });
      }
    };

    video.src = previewUrl;
  });

  const extLabel = (mimeType.split('/')[1] || 'MP4').replace('quicktime', 'MOV').toUpperCase();

  return {
    uploadFile: normalizedFile,
    previewUrl,
    thumbnailFile: meta.thumbnailFile,
    thumbnailPreviewUrl: meta.thumbnailPreviewUrl,
    mediaType: 'video',
    suggestedAspectRatio: suggestAspectRatio(meta.width, meta.height, 'video'),
    originalSize: file.size,
    optimizedSize: normalizedFile.size,
    width: meta.width,
    height: meta.height,
    durationSeconds: meta.durationSeconds,
    formatLabel: extLabel,
    processingMs: Math.round(performance.now() - startedAt),
    wasCompressed: false,
    fingerprint,
  };
}

export async function prepareMediaForUpload(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<PreparedMedia> {
  const mimeType = inferMimeType(file);
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {
    return prepareVideoForUpload(file);
  }
  return prepareImageForUpload(file, options);
}

function mapStorageError(error: unknown): { message: string; retryable: boolean } {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'storage/canceled') {
    return { message: 'Upload cancelled.', retryable: false };
  }
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return {
      message:
        'Firebase Storage denied this upload. Verify you are signed in with a verified email and that storage.rules are deployed.',
      retryable: false,
    };
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return {
      message:
        'Firebase Storage bucket was not found. Enable Firebase Storage in Firebase Console before uploading media.',
      retryable: false,
    };
  }
  if (code === 'storage/quota-exceeded') {
    return {
      message: 'Firebase Storage quota has been exceeded for this project.',
      retryable: false,
    };
  }
  if (code === 'storage/retry-limit-exceeded') {
    return {
      message:
        'Upload timed out while connecting to Firebase Storage. Check your connection or verify Firebase Storage & CORS configuration, then retry.',
      retryable: true,
    };
  }
  if (code === 'storage/unknown' || msg.toLowerCase().includes('network')) {
    return {
      message:
        'Network error interrupted the upload to Firebase Storage. Your caption and file are saved—tap Retry when ready.',
      retryable: true,
    };
  }

  return {
    message: msg || 'Media upload failed. Please try again.',
    retryable: true,
  };
}

export function startResumableUpload(options: {
  file: File;
  folder: 'posts' | 'avatars' | 'covers' | 'thumbnails';
  userId: string;
  onProgress?: (telemetry: UploadTelemetry) => void;
  maxAutoRetries?: number;
  stallTimeoutMs?: number;
}): { promise: Promise<UploadResult>; cancel: () => void } {
  const {
    file,
    folder,
    userId,
    onProgress,
    maxAutoRetries = 2,
    stallTimeoutMs = 20_000,
  } = options;

  let cancelled = false;
  let activeTask: UploadTask | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    cancelled = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (activeTask) {
      try {
        activeTask.cancel();
      } catch {
        // Ignore if task already finished
      }
    }
  };

  const promise = (async (): Promise<UploadResult> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('You appear to be offline. Reconnect to mobile data or Wi-Fi and tap Retry.');
    }

    if (!auth.currentUser) {
      throw new Error('Authentication session expired. Please sign in again.');
    }

    // Ensure auth token is fresh before opening Storage session
    await auth.currentUser.getIdToken();

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${folder}/${userId}/${uniqueId}_${safeName}`;
    const contentType = inferMimeType(file) || 'application/octet-stream';
    const overallStartedAt = performance.now();

    const runAttempt = (attempt: number): Promise<UploadResult> => {
      return new Promise((resolve, reject) => {
        if (cancelled) {
          reject(new UploadCancelledError());
          return;
        }

        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType,
          cacheControl: 'public,max-age=31536000',
        });
        activeTask = uploadTask;

        let lastTransferred = 0;
        let lastProgressAt = performance.now();
        const samples: { t: number; bytes: number }[] = [{ t: lastProgressAt, bytes: 0 }];

        const emit = (phase: UploadPhase, transferred: number, total: number) => {
          if (!onProgress) return;
          const now = performance.now();
          const safeTotal = Math.max(total, file.size, 1);
          const percent = Math.min(100, Math.max(0, Math.round((transferred / safeTotal) * 100)));

          // Rolling speed window (up to 3s)
          const windowCutoff = now - 3000;
          while (samples.length > 1 && samples[0].t < windowCutoff) {
            samples.shift();
          }
          const oldest = samples[0];
          const dtSec = Math.max(0.25, (now - oldest.t) / 1000);
          const dBytes = Math.max(0, transferred - oldest.bytes);
          const speedBytesPerSec = transferred > 0 ? Math.round(dBytes / dtSec) : 0;
          const remaining = Math.max(0, safeTotal - transferred);
          const etaSeconds =
            speedBytesPerSec > 256 && remaining > 0
              ? Math.max(1, Math.ceil(remaining / speedBytesPerSec))
              : null;

          onProgress({
            phase,
            bytesTransferred: transferred,
            totalBytes: safeTotal,
            percent,
            speedBytesPerSec,
            etaSeconds,
            elapsedMs: Math.round(now - overallStartedAt),
            attempt,
          });
        };

        emit(attempt > 1 ? 'retrying' : 'uploading', 0, file.size);

        const onOffline = () => {
          try {
            uploadTask.pause();
          } catch {
            // ignore
          }
          emit('paused-offline', lastTransferred, file.size);
        };

        const onOnline = () => {
          if (!cancelled) {
            try {
              uploadTask.resume();
            } catch {
              // ignore
            }
            lastProgressAt = performance.now();
            emit('uploading', lastTransferred, file.size);
          }
        };

        if (typeof window !== 'undefined') {
          window.addEventListener('offline', onOffline);
          window.addEventListener('online', onOnline);
        }

        const stallInterval = setInterval(() => {
          if (cancelled) return;
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;
          if (performance.now() - lastProgressAt >= stallTimeoutMs) {
            emit('stalled', lastTransferred, file.size);
          }
        }, 2000);

        const cleanupListeners = () => {
          clearInterval(stallInterval);
          if (typeof window !== 'undefined') {
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('online', onOnline);
          }
        };

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (cancelled) return;
            const now = performance.now();
            if (snapshot.bytesTransferred > lastTransferred) {
              lastTransferred = snapshot.bytesTransferred;
              lastProgressAt = now;
              samples.push({ t: now, bytes: snapshot.bytesTransferred });
            }
            const phase: UploadPhase =
              snapshot.state === 'paused' ? 'paused-offline' : 'uploading';
            emit(phase, snapshot.bytesTransferred, snapshot.totalBytes || file.size);
          },
          (error) => {
            cleanupListeners();
            activeTask = null;
            if (cancelled || (error as { code?: string })?.code === 'storage/canceled') {
              reject(new UploadCancelledError());
              return;
            }
            const mapped = mapStorageError(error);
            if (mapped.retryable && attempt <= maxAutoRetries) {
              const backoffMs = attempt * 1200;
              emit('retrying', lastTransferred, file.size);
              retryTimer = setTimeout(() => {
                runAttempt(attempt + 1).then(resolve, reject);
              }, backoffMs);
              return;
            }
            reject(new Error(mapped.message));
          },
          async () => {
            cleanupListeners();
            activeTask = null;
            if (cancelled) {
              reject(new UploadCancelledError());
              return;
            }
            emit('verifying', file.size, file.size);
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              emit('completed', file.size, file.size);
              resolve({
                downloadUrl,
                storagePath,
                bytesTransferred: uploadTask.snapshot.totalBytes || file.size,
                elapsedMs: Math.round(performance.now() - overallStartedAt),
              });
            } catch (err) {
              reject(err instanceof Error ? err : new Error('Failed to retrieve uploaded file URL.'));
            }
          }
        );
      });
    };

    return runAttempt(1);
  })();

  return { promise, cancel };
}

export async function uploadMediaFile(
  file: File,
  folder: 'posts' | 'avatars' | 'covers',
  userId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  let fileToUpload = file;
  const mimeType = inferMimeType(file);
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    const maxDim = folder === 'avatars' ? 512 : 1600;
    const prepared = await prepareImageForUpload(file, { maxDimension: maxDim, quality: 0.82 });
    URL.revokeObjectURL(prepared.previewUrl);
    fileToUpload = prepared.uploadFile;
  }

  const { promise } = startResumableUpload({
    file: fileToUpload,
    folder,
    userId,
    onProgress: (telemetry) => {
      onProgress?.(telemetry.percent);
    },
  });

  const result = await promise;
  return result.downloadUrl;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return 'Measuring...';
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `~${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `~${mins}m ${rem}s left`;
}
