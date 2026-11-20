import { getDownloadURL, ref, uploadBytesResumable, UploadTask } from 'firebase/storage';
import type { PutBlobResult } from '@vercel/blob';
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
  blob?: PutBlobResult;
}

export interface PreparedMedia {
  uploadFile: File;
  previewUrl: string;
  thumbnailFile?: File;
  thumbnailPreviewUrl?: string;
  directDataUrl?: string;
  mediaType: 'image' | 'video';
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
): { valid: boolean; mediaType?: 'image' | 'video'; mimeType?: string; error?: string } {
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not encode image for direct upload.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read compressed image data.'));
    reader.readAsDataURL(blob);
  });
}

type UploadFolder = 'posts' | 'avatars' | 'covers' | 'thumbnails';

function getInlineBudgetForFolder(folder: UploadFolder): {
  maxBytes: number;
  maxDimension: number;
  maxChars: number;
} {
  if (folder === 'avatars') return { maxBytes: 18 * 1024, maxDimension: 220, maxChars: 31_500 };
  if (folder === 'thumbnails') return { maxBytes: 55 * 1024, maxDimension: 480, maxChars: 95_000 };
  if (folder === 'covers') return { maxBytes: 140 * 1024, maxDimension: 1200, maxChars: 235_000 };
  return { maxBytes: 220 * 1024, maxDimension: 1280, maxChars: 460_000 };
}

async function encodeCanvasUnderBudget(
  sourceCanvas: HTMLCanvasElement,
  targetMime: string,
  initialQuality: number,
  maxBytes: number,
  initialBlob?: Blob | null
): Promise<Blob | null> {
  if (initialBlob && initialBlob.size <= maxBytes) {
    return initialBlob;
  }

  let workingCanvas = sourceCanvas;
  let bestBlob: Blob | null = initialBlob ?? null;

  const qualitySteps = [
    Math.min(0.74, initialQuality),
    0.62,
  ];

  for (let i = 0; i < qualitySteps.length; i++) {
    const q = qualitySteps[i];
    // Downscale by 0.72x on the second pass if still over budget — draws from already-resized canvas (very fast)
    if (i > 0 && Math.max(workingCanvas.width, workingCanvas.height) > 640) {
      const nextCanvas = document.createElement('canvas');
      nextCanvas.width = Math.max(1, Math.round(workingCanvas.width * 0.72));
      nextCanvas.height = Math.max(1, Math.round(workingCanvas.height * 0.72));
      const nextCtx = nextCanvas.getContext('2d');
      if (nextCtx) {
        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'medium';
        nextCtx.drawImage(workingCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
        if (workingCanvas !== sourceCanvas) {
          workingCanvas.width = 0;
          workingCanvas.height = 0;
        }
        workingCanvas = nextCanvas;
      }
    }

    const blob = await canvasToBlobAsync(workingCanvas, targetMime, q);
    if (blob) {
      bestBlob = blob;
      if (blob.size <= maxBytes) break;
    }
  }

  if (bestBlob && bestBlob.size > maxBytes && Math.max(workingCanvas.width, workingCanvas.height) > 480) {
    const finalCanvas = document.createElement('canvas');
    const scale = 480 / Math.max(workingCanvas.width, workingCanvas.height);
    finalCanvas.width = Math.max(1, Math.round(workingCanvas.width * scale));
    finalCanvas.height = Math.max(1, Math.round(workingCanvas.height * scale));
    const finalCtx = finalCanvas.getContext('2d');
    if (finalCtx) {
      finalCtx.drawImage(workingCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
      const smallBlob = await canvasToBlobAsync(finalCanvas, targetMime, 0.56);
      finalCanvas.width = 0;
      finalCanvas.height = 0;
      if (smallBlob) bestBlob = smallBlob;
    }
  }

  if (workingCanvas !== sourceCanvas) {
    workingCanvas.width = 0;
    workingCanvas.height = 0;
  }

  return bestBlob;
}

async function encodeImageUnderByteBudget(
  file: File,
  maxBytes: number,
  startMaxDimension: number
): Promise<{ file: File; dataUrl: string }> {
  const mimeType = inferMimeType(file) || 'image/jpeg';

  if (
    file.size <= maxBytes &&
    (mimeType === 'image/webp' || mimeType === 'image/jpeg' || mimeType === 'image/gif' || mimeType === 'image/png')
  ) {
    const dataUrl = await blobToDataUrl(file);
    if (dataUrl.length <= Math.ceil(maxBytes * 1.45)) {
      return { file, dataUrl };
    }
  }

  const [source, canWebP] = await Promise.all([
    decodeImageSource(file),
    supportsWebPEncoding(),
  ]);

  try {
    const targetMime = canWebP ? 'image/webp' : 'image/jpeg';
    const targetExt = canWebP ? 'webp' : 'jpg';
    const scale =
      Math.max(source.width, source.height) > startMaxDimension
        ? startMaxDimension / Math.max(source.width, source.height)
        : 1;
    const targetW = Math.max(1, Math.round(source.width * scale));
    const targetH = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image canvas.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    source.drawToCanvas(ctx, targetW, targetH);

    const firstBlob = await canvasToBlobAsync(canvas, targetMime, 0.78);
    const bestBlob = await encodeCanvasUnderBudget(canvas, targetMime, 0.78, maxBytes, firstBlob);
    canvas.width = 0;
    canvas.height = 0;

    if (!bestBlob) {
      throw new Error('Could not optimize this image for direct publishing.');
    }

    const optimizedFile = new File([bestBlob], replaceFileExtension(file.name, targetExt), {
      type: targetMime,
      lastModified: Date.now(),
    });
    const dataUrl = await blobToDataUrl(optimizedFile);
    return { file: optimizedFile, dataUrl };
  } finally {
    source.cleanup();
  }
}

export async function prepareImageForUpload(
  file: File,
  options: {
    maxDimension?: number;
    quality?: number;
    skipReencodeMaxBytes?: number;
    folder?: UploadFolder;
    precomputeDirectDataUrl?: boolean;
  } = {}
): Promise<PreparedMedia> {
  const startedAt = performance.now();
  const folder = options.folder ?? 'posts';
  const budget = getInlineBudgetForFolder(folder);
  const maxDimension = options.maxDimension ?? budget.maxDimension;
  const quality = options.quality ?? 0.78;
  const skipReencodeMaxBytes = options.skipReencodeMaxBytes ?? 90 * 1024;
  const mimeType = inferMimeType(file) || 'image/jpeg';
  const fingerprint = buildFileFingerprint(file);

  // Kick off cloud endpoint + bucket probes + WebP support check immediately in parallel with decoding
  const vercelBlobPromise = checkVercelBlobAvailable();
  const bucketPromise = checkStorageBucketAvailable();
  const webpPromise = supportsWebPEncoding();

  // Preserve animated GIFs without re-encoding when within budget
  if (mimeType === 'image/gif') {
    const [vercelBlobAvailable, bucketAvailable] = await Promise.all([
      vercelBlobPromise,
      bucketPromise,
    ]);
    const hasCloudTarget = vercelBlobAvailable || bucketAvailable;
    let directDataUrl: string | undefined;
    if ((!hasCloudTarget || options.precomputeDirectDataUrl) && file.size <= budget.maxBytes) {
      const candidateUrl = await blobToDataUrl(file);
      if (candidateUrl.length <= budget.maxChars) {
        directDataUrl = candidateUrl;
      }
    }
    if (hasCloudTarget || directDataUrl) {
      return {
        uploadFile: file,
        previewUrl: URL.createObjectURL(file),
        directDataUrl,
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
  }

  let source: Awaited<ReturnType<typeof decodeImageSource>> | null = null;
  try {
    const [decoded, canWebP, vercelBlobAvailable, bucketAvailable] = await Promise.all([
      decodeImageSource(file),
      webpPromise,
      vercelBlobPromise,
      bucketPromise,
    ]);
    source = decoded;
    const { width, height } = source;
    const suggested = suggestAspectRatio(width, height, 'image');
    const hasCloudTarget = vercelBlobAvailable || bucketAvailable;
    const needDirect = !hasCloudTarget || Boolean(options.precomputeDirectDataUrl);
    const effectiveMaxDimension =
      folder === 'avatars' && hasCloudTarget && !options.maxDimension
        ? 512
        : maxDimension;
    const needsResize = Math.max(width, height) > effectiveMaxDimension;

    // Fast path: already small WebP/JPEG within dimensions
    if (
      !needsResize &&
      file.size <= (needDirect ? Math.min(skipReencodeMaxBytes, budget.maxBytes) : skipReencodeMaxBytes) &&
      (mimeType === 'image/webp' || mimeType === 'image/jpeg')
    ) {
      let directDataUrl: string | undefined;
      if (needDirect) {
        const candidateUrl = await blobToDataUrl(file);
        if (candidateUrl.length <= budget.maxChars) {
          directDataUrl = candidateUrl;
        }
      }
      return {
        uploadFile: file,
        previewUrl: URL.createObjectURL(file),
        directDataUrl,
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

    const scale = needsResize ? effectiveMaxDimension / Math.max(width, height) : 1;
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
    ctx.imageSmoothingQuality = 'medium';
    source.drawToCanvas(ctx, targetW, targetH);

    const targetMime = canWebP ? 'image/webp' : 'image/jpeg';
    const targetExt = canWebP ? 'webp' : 'jpg';
    const initialQuality = canWebP ? quality : Math.min(0.84, quality + 0.03);

    const firstBlob = await canvasToBlobAsync(canvas, targetMime, initialQuality);
    let finalBlob = firstBlob;

    // Enforce direct budget in the same single pass when Storage is unavailable so Publish needs zero extra compression!
    if (needDirect && (!firstBlob || firstBlob.size > budget.maxBytes)) {
      finalBlob = await encodeCanvasUnderBudget(canvas, targetMime, initialQuality, budget.maxBytes, firstBlob);
    }

    canvas.width = 0;
    canvas.height = 0;

    if (!finalBlob || (!needsResize && !needDirect && finalBlob.size >= file.size)) {
      const normalizedOriginal =
        file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
      let directDataUrl: string | undefined;
      if (needDirect && normalizedOriginal.size <= budget.maxBytes) {
        const candidateUrl = await blobToDataUrl(normalizedOriginal);
        if (candidateUrl.length <= budget.maxChars) {
          directDataUrl = candidateUrl;
        }
      }
      return {
        uploadFile: normalizedOriginal,
        previewUrl: URL.createObjectURL(normalizedOriginal),
        directDataUrl,
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

    const optimizedFile = new File([finalBlob], replaceFileExtension(file.name, targetExt), {
      type: targetMime,
      lastModified: Date.now(),
    });

    let directDataUrl: string | undefined;
    if (needDirect && optimizedFile.size <= budget.maxBytes) {
      const candidateUrl = await blobToDataUrl(optimizedFile);
      if (candidateUrl.length <= budget.maxChars) {
        directDataUrl = candidateUrl;
      }
    }

    return {
      uploadFile: optimizedFile,
      previewUrl: URL.createObjectURL(optimizedFile),
      directDataUrl,
      mediaType: 'image',
      suggestedAspectRatio: suggested,
      originalSize: file.size,
      optimizedSize: optimizedFile.size,
      width: targetW,
      height: targetH,
      formatLabel: canWebP ? 'WebP' : 'JPEG',
      processingMs: Math.round(performance.now() - startedAt),
      wasCompressed: optimizedFile.size < file.size || mimeType !== targetMime,
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
  options: {
    maxDimension?: number;
    quality?: number;
    folder?: UploadFolder;
    precomputeDirectDataUrl?: boolean;
  } = {}
): Promise<PreparedMedia> {
  const mimeType = inferMimeType(file);
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {
    return prepareVideoForUpload(file);
  }
  return prepareImageForUpload(file, options);
}

const BUCKET_CACHE_KEY = 'hostelverse_storage_bucket_v1';
let cachedBucketCheck: { available: boolean; checkedAt: number } | null = null;
let inFlightBucketProbe: Promise<boolean> | null = null;

function readSessionBucketCache(): { available: boolean; checkedAt: number } | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(BUCKET_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { available?: boolean; checkedAt?: number };
    if (typeof parsed.available === 'boolean' && typeof parsed.checkedAt === 'number') {
      return { available: parsed.available, checkedAt: parsed.checkedAt };
    }
  } catch {
    // ignore storage access issues
  }
  return null;
}

function writeSessionBucketCache(available: boolean, checkedAt: number): void {
  cachedBucketCheck = { available, checkedAt };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(BUCKET_CACHE_KEY, JSON.stringify(cachedBucketCheck));
    }
  } catch {
    // ignore
  }
}

/**
 * Fast cached 1.0s probe to verify whether Firebase Cloud Storage bucket is initialized.
 * Deduplicated and cached in sessionStorage so repeat uploads start in 0ms.
 */
export async function checkStorageBucketAvailable(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  const cached = cachedBucketCheck || readSessionBucketCache();
  if (!forceRefresh && cached) {
    cachedBucketCheck = cached;
    const ttl = cached.available ? 15 * 60_000 : 10 * 60_000;
    if (now - cached.checkedAt < ttl) {
      return cached.available;
    }
  }

  if (inFlightBucketProbe && !forceRefresh) {
    return inFlightBucketProbe;
  }

  const bucket = storage.app.options.storageBucket;
  if (!bucket || typeof fetch !== 'function') {
    writeSessionBucketCache(false, now);
    return false;
  }

  inFlightBucketProbe = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`,
        { method: 'GET', signal: controller.signal }
      );
      const available = res.status !== 404;
      writeSessionBucketCache(available, Date.now());
      return available;
    } catch {
      return true;
    } finally {
      clearTimeout(timeout);
      inFlightBucketProbe = null;
    }
  })();

  return inFlightBucketProbe;
}

const VERCEL_BLOB_CACHE_KEY = 'hostelverse_vercel_blob_v1';
let cachedVercelBlobCheck: { available: boolean; checkedAt: number } | null = null;
let inFlightVercelBlobProbe: Promise<boolean> | null = null;

function readSessionVercelBlobCache(): { available: boolean; checkedAt: number } | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(VERCEL_BLOB_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { available?: boolean; checkedAt?: number };
    if (typeof parsed.available === 'boolean' && typeof parsed.checkedAt === 'number') {
      return { available: parsed.available, checkedAt: parsed.checkedAt };
    }
  } catch {
    // ignore storage access issues
  }
  return null;
}

function writeSessionVercelBlobCache(available: boolean, checkedAt: number): void {
  cachedVercelBlobCheck = { available, checkedAt };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(VERCEL_BLOB_CACHE_KEY, JSON.stringify(cachedVercelBlobCheck));
    }
  } catch {
    // ignore
  }
}

/**
 * Cached 1s probe checking whether /api/upload has BLOB_READ_WRITE_TOKEN configured.
 */
export async function checkVercelBlobAvailable(forceRefresh = false): Promise<boolean> {
  if (typeof fetch !== 'function' || typeof window === 'undefined') {
    return false;
  }

  const now = Date.now();
  const cached = cachedVercelBlobCheck || readSessionVercelBlobCache();
  if (!forceRefresh && cached) {
    cachedVercelBlobCheck = cached;
    const ttl = cached.available ? 15 * 60_000 : 5 * 60_000;
    if (now - cached.checkedAt < ttl) {
      return cached.available;
    }
  }

  if (inFlightVercelBlobProbe && !forceRefresh) {
    return inFlightVercelBlobProbe;
  }

  inFlightVercelBlobProbe = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const res = await fetch('/api/upload', { method: 'GET', signal: controller.signal });
      if (!res.ok) {
        writeSessionVercelBlobCache(false, Date.now());
        return false;
      }
      const data = (await res.json()) as { configured?: boolean };
      const available = Boolean(data?.configured);
      writeSessionVercelBlobCache(available, Date.now());
      return available;
    } catch {
      writeSessionVercelBlobCache(false, Date.now());
      return false;
    } finally {
      clearTimeout(timeout);
      inFlightVercelBlobProbe = null;
    }
  })();

  return inFlightVercelBlobProbe;
}

const SERVER_MEDIA_CACHE_KEY = 'hostelverse_server_media_v1';
let cachedServerMediaCheck: { available: boolean; checkedAt: number } | null = null;
let inFlightServerMediaProbe: Promise<boolean> | null = null;

function writeSessionServerMediaCache(available: boolean, checkedAt: number): void {
  cachedServerMediaCheck = { available, checkedAt };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SERVER_MEDIA_CACHE_KEY, JSON.stringify(cachedServerMediaCheck));
    }
  } catch {
    // ignore
  }
}

export async function checkServerMediaAvailable(forceRefresh = false): Promise<boolean> {
  if (typeof fetch !== 'function' || typeof window === 'undefined') {
    return false;
  }

  const now = Date.now();
  if (!forceRefresh && cachedServerMediaCheck) {
    const ttl = cachedServerMediaCheck.available ? 15 * 60_000 : 60_000;
    if (now - cachedServerMediaCheck.checkedAt < ttl) {
      return cachedServerMediaCheck.available;
    }
  }

  if (inFlightServerMediaProbe && !forceRefresh) {
    return inFlightServerMediaProbe;
  }

  inFlightServerMediaProbe = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch('/api/media/status', { method: 'GET', signal: controller.signal });
      if (!res.ok) {
        writeSessionServerMediaCache(false, Date.now());
        return false;
      }
      const data = (await res.json()) as { available?: boolean };
      const available = Boolean(data?.available);
      writeSessionServerMediaCache(available, Date.now());
      return available;
    } catch {
      writeSessionServerMediaCache(false, Date.now());
      return false;
    } finally {
      clearTimeout(timeout);
      inFlightServerMediaProbe = null;
    }
  })();

  return inFlightServerMediaProbe;
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
        'Firebase Storage bucket is not initialized on this project yet. Enable Storage in Firebase Console.',
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
        'Upload timed out while connecting to Firebase Storage. Check your connection or verify Storage setup, then retry.',
      retryable: true,
    };
  }
  if (code === 'storage/unknown' || msg.toLowerCase().includes('network')) {
    return {
      message:
        'Network error interrupted the upload. Your caption and file are saved—tap Retry when ready.',
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
  folder: UploadFolder;
  userId: string;
  precomputedDataUrl?: string;
  onProgress?: (telemetry: UploadTelemetry) => void;
  maxAutoRetries?: number;
  stallTimeoutMs?: number;
}): { promise: Promise<UploadResult>; cancel: () => void } {
  const {
    file,
    folder,
    userId,
    precomputedDataUrl,
    onProgress,
    maxAutoRetries = 1,
    stallTimeoutMs = 15_000,
  } = options;

  let cancelled = false;
  let activeTask: UploadTask | null = null;
  let activeXhr: XMLHttpRequest | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    cancelled = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (activeXhr) {
      try {
        activeXhr.abort();
      } catch {
        // Ignore if already settled
      }
      activeXhr = null;
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

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${folder}/${userId}/${uniqueId}_${safeName}`;
    const contentType = inferMimeType(file) || 'application/octet-stream';
    const overallStartedAt = performance.now();

    const uploadViaServerMedia = (): Promise<
      { ok: true; result: UploadResult } | { ok: false; fallback: boolean; error?: Error }
    > => {
      return new Promise((resolve) => {
        if (cancelled) {
          resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
          return;
        }
        const xhr = new XMLHttpRequest();
        activeXhr = xhr;
        const samples: { t: number; bytes: number }[] = [{ t: performance.now(), bytes: 0 }];

        const emitXhr = (phase: UploadPhase, transferred: number, total: number) => {
          if (!onProgress) return;
          const now = performance.now();
          const safeTotal = Math.max(total, file.size, 1);
          const percent = Math.min(100, Math.max(0, Math.round((transferred / safeTotal) * 100)));
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
            attempt: 1,
          });
        };

        xhr.open('POST', `/api/media/upload?filename=${encodeURIComponent(storagePath)}`);
        xhr.setRequestHeader('Content-Type', contentType);
        emitXhr('uploading', 0, file.size);

        xhr.upload.onprogress = (evt) => {
          if (cancelled) return;
          const now = performance.now();
          const loaded = evt.loaded;
          const total = evt.lengthComputable ? evt.total : file.size;
          samples.push({ t: now, bytes: loaded });
          emitXhr(loaded >= total ? 'verifying' : 'uploading', loaded, total);
        };

        xhr.onabort = () => {
          activeXhr = null;
          resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
        };

        xhr.onerror = () => {
          activeXhr = null;
          resolve({
            ok: false,
            fallback: true,
            error: new Error('Network error while uploading media to server.'),
          });
        };

        xhr.onload = () => {
          activeXhr = null;
          if (cancelled) {
            resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const payload = JSON.parse(xhr.responseText) as {
                url?: string;
                pathname?: string;
              };
              if (!payload.url) {
                resolve({ ok: false, fallback: true, error: new Error('Server upload response missing URL.') });
                return;
              }
              emitXhr('completed', file.size, file.size);
              resolve({
                ok: true,
                result: {
                  downloadUrl: payload.url,
                  storagePath: payload.pathname || storagePath,
                  bytesTransferred: file.size,
                  elapsedMs: Math.max(1, Math.round(performance.now() - overallStartedAt)),
                },
              });
              return;
            } catch {
              resolve({ ok: false, fallback: true, error: new Error('Invalid response from server media upload.') });
              return;
            }
          }

          if (xhr.status === 404 || xhr.status === 503) {
            writeSessionServerMediaCache(false, Date.now());
            resolve({ ok: false, fallback: true });
            return;
          }

          let errMsg = `Video upload failed (${xhr.status}).`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { error?: string };
            if (parsed.error) errMsg = parsed.error;
          } catch {
            // ignore JSON parse failure
          }
          resolve({ ok: false, fallback: false, error: new Error(errMsg) });
        };

        xhr.send(file);
      });
    };

    const readSmallVideoAsDataUrl = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string' && reader.result.length <= 480000) {
            resolve(reader.result);
          } else {
            reject(new Error('Video file is too large for inline fallback.'));
          }
        };
        reader.onerror = () => reject(new Error('Could not read video file.'));
        reader.readAsDataURL(file);
      });

    const directInlineFallback = async (): Promise<UploadResult> => {
      if (!contentType.startsWith('image/')) {
        const serverMediaReady = await checkServerMediaAvailable(true);
        if (serverMediaReady) {
          const serverOutcome = await uploadViaServerMedia();
          if (serverOutcome.ok === true) {
            return serverOutcome.result;
          }
          if (!serverOutcome.fallback) {
            throw serverOutcome.error || new Error('Video upload failed.');
          }
        }

        if (file.size <= 350 * 1024) {
          const videoDataUrl = await readSmallVideoAsDataUrl();
          if (cancelled) throw new UploadCancelledError();
          const elapsedMs = Math.max(1, Math.round(performance.now() - overallStartedAt));
          onProgress?.({
            phase: 'completed',
            bytesTransferred: file.size,
            totalBytes: file.size,
            percent: 100,
            speedBytesPerSec: Math.round(file.size / Math.max(0.02, elapsedMs / 1000)),
            etaSeconds: 0,
            elapsedMs,
            attempt: 1,
          });
          return {
            downloadUrl: videoDataUrl,
            storagePath: `direct/${storagePath}`,
            bytesTransferred: file.size,
            elapsedMs,
          };
        }

        throw new Error(
          'Video upload server is unavailable right now. Please try again in a moment or choose a shorter clip.'
        );
      }

      const budget = getInlineBudgetForFolder(folder);
      let dataUrl = precomputedDataUrl;
      let bytesTransferred = file.size;

      if (!dataUrl || dataUrl.length > budget.maxChars) {
        const encoded = await encodeImageUnderByteBudget(file, budget.maxBytes, budget.maxDimension);
        dataUrl = encoded.dataUrl;
        bytesTransferred = encoded.file.size;
      }

      if (cancelled) throw new UploadCancelledError();
      const elapsedMs = Math.max(1, Math.round(performance.now() - overallStartedAt));
      onProgress?.({
        phase: 'completed',
        bytesTransferred,
        totalBytes: bytesTransferred,
        percent: 100,
        speedBytesPerSec: Math.round(bytesTransferred / Math.max(0.02, elapsedMs / 1000)),
        etaSeconds: 0,
        elapsedMs,
        attempt: 1,
      });
      return {
        downloadUrl: dataUrl,
        storagePath: `direct/${storagePath}`,
        bytesTransferred,
        elapsedMs,
      };
    };

    const uploadViaVercelBlob = (): Promise<{ ok: true; result: UploadResult } | { ok: false; fallback: boolean; error?: Error }> => {
      return new Promise((resolve) => {
        if (cancelled) {
          resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
          return;
        }
        const xhr = new XMLHttpRequest();
        activeXhr = xhr;
        const samples: { t: number; bytes: number }[] = [{ t: performance.now(), bytes: 0 }];

        const emitXhr = (phase: UploadPhase, transferred: number, total: number) => {
          if (!onProgress) return;
          const now = performance.now();
          const safeTotal = Math.max(total, file.size, 1);
          const percent = Math.min(100, Math.max(0, Math.round((transferred / safeTotal) * 100)));
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
            attempt: 1,
          });
        };

        const uploadEndpoint = folder === 'avatars' ? '/api/avatar/upload' : '/api/upload';
        xhr.open('POST', `${uploadEndpoint}?filename=${encodeURIComponent(storagePath)}`);
        xhr.setRequestHeader('Content-Type', contentType);
        emitXhr('uploading', 0, file.size);

        xhr.upload.onprogress = (evt) => {
          if (cancelled) return;
          const now = performance.now();
          const loaded = evt.loaded;
          const total = evt.lengthComputable ? evt.total : file.size;
          samples.push({ t: now, bytes: loaded });
          emitXhr(loaded >= total ? 'verifying' : 'uploading', loaded, total);
        };

        xhr.onabort = () => {
          activeXhr = null;
          resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
        };

        xhr.onerror = () => {
          activeXhr = null;
          resolve({
            ok: false,
            fallback: true,
            error: new Error('Network error while uploading to Vercel Blob.'),
          });
        };

        xhr.onload = () => {
          activeXhr = null;
          if (cancelled) {
            resolve({ ok: false, fallback: false, error: new UploadCancelledError() });
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const payload = JSON.parse(xhr.responseText) as PutBlobResult;
              if (!payload.url) {
                resolve({ ok: false, fallback: true, error: new Error('Upload response missing URL.') });
                return;
              }
              emitXhr('completed', file.size, file.size);
              resolve({
                ok: true,
                result: {
                  downloadUrl: payload.url,
                  storagePath: payload.pathname || storagePath,
                  bytesTransferred: file.size,
                  elapsedMs: Math.max(1, Math.round(performance.now() - overallStartedAt)),
                  blob: payload,
                },
              });
              return;
            } catch {
              resolve({ ok: false, fallback: true, error: new Error('Invalid response from upload endpoint.') });
              return;
            }
          }

          if (xhr.status === 503 || xhr.status === 404) {
            writeSessionVercelBlobCache(false, Date.now());
            resolve({ ok: false, fallback: true });
            return;
          }

          let errMsg = `Upload failed (${xhr.status}).`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { error?: string };
            if (parsed.error) errMsg = parsed.error;
          } catch {
            // ignore JSON parse failure
          }
          resolve({ ok: false, fallback: false, error: new Error(errMsg) });
        };

        xhr.send(file);
      });
    };

    const [, vercelBlobAvailable, bucketAvailable] = await Promise.all([
      auth.currentUser.getIdToken(),
      checkVercelBlobAvailable(),
      checkStorageBucketAvailable(),
    ]);
    if (cancelled) throw new UploadCancelledError();

    if (vercelBlobAvailable) {
      const blobOutcome = await uploadViaVercelBlob();
      if (blobOutcome.ok === true) {
        return blobOutcome.result;
      }
      if (!blobOutcome.fallback) {
        throw blobOutcome.error || new Error('Upload failed.');
      }
    }

    if (!bucketAvailable) {
      return directInlineFallback();
    }

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
        let fallbackTriggered = false;
        const samples: { t: number; bytes: number }[] = [{ t: lastProgressAt, bytes: 0 }];

        const emit = (phase: UploadPhase, transferred: number, total: number) => {
          if (!onProgress) return;
          const now = performance.now();
          const safeTotal = Math.max(total, file.size, 1);
          const percent = Math.min(100, Math.max(0, Math.round((transferred / safeTotal) * 100)));

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
          if (cancelled || fallbackTriggered) return;
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;
          const idleMs = performance.now() - lastProgressAt;
          // If an upload sits at 0 bytes for >2.5s, Storage handshake is blocked/stalled: switch to server/direct publish
          if (lastTransferred === 0 && idleMs >= 2500) {
            fallbackTriggered = true;
            cleanupListeners();
            try {
              uploadTask.cancel();
            } catch {
              // ignore
            }
            writeSessionBucketCache(false, Date.now());
            directInlineFallback().then(resolve, reject);
            return;
          }
          if (idleMs >= stallTimeoutMs) {
            emit('stalled', lastTransferred, file.size);
          }
        }, 800);

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
            if (cancelled || fallbackTriggered) return;
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
            if (fallbackTriggered) return;
            cleanupListeners();
            activeTask = null;
            if (cancelled || (error as { code?: string })?.code === 'storage/canceled') {
              reject(new UploadCancelledError());
              return;
            }
            const code = (error as { code?: string })?.code || '';
            if (
              lastTransferred === 0 &&
              (code === 'storage/bucket-not-found' || code === 'storage/unknown' || code === 'storage/retry-limit-exceeded')
            ) {
              writeSessionBucketCache(false, Date.now());
              directInlineFallback().then(resolve, reject);
              return;
            }
            const mapped = mapStorageError(error);
            if (mapped.retryable && attempt <= maxAutoRetries) {
              const backoffMs = attempt * 1000;
              emit('retrying', lastTransferred, file.size);
              retryTimer = setTimeout(() => {
                runAttempt(attempt + 1).then(resolve, reject);
              }, backoffMs);
              return;
            }
            reject(new Error(mapped.message));
          },
          async () => {
            if (fallbackTriggered) return;
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
  let precomputedDataUrl: string | undefined;
  const mimeType = inferMimeType(file);
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    const prepared = await prepareImageForUpload(file, {
      folder,
      quality: 0.78,
    });
    URL.revokeObjectURL(prepared.previewUrl);
    fileToUpload = prepared.uploadFile;
    precomputedDataUrl = prepared.directDataUrl;
  }

  const { promise } = startResumableUpload({
    file: fileToUpload,
    folder,
    userId,
    precomputedDataUrl,
    onProgress: (telemetry) => {
      onProgress?.(telemetry.percent);
    },
  });

  const result = await promise;
  return result.downloadUrl;
}

const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadAvatarBlob(
  file: File,
  userId: string,
  onProgress?: (telemetry: UploadTelemetry) => void
): Promise<UploadResult> {
  const mime = inferMimeType(file);
  if (!AVATAR_MIME_TYPES.has(mime)) {
    throw new Error('Please choose a JPEG, PNG, or WebP image for your avatar.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Avatar image must be 5 MB or smaller.');
  }

  const prepared = await prepareImageForUpload(file, {
    folder: 'avatars',
    quality: 0.82,
  });
  URL.revokeObjectURL(prepared.previewUrl);

  const { promise } = startResumableUpload({
    file: prepared.uploadFile,
    folder: 'avatars',
    userId,
    precomputedDataUrl: prepared.directDataUrl,
    onProgress,
  });

  return promise;
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
