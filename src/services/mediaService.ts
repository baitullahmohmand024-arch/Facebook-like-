import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { MediaType } from '../types';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function validateMediaFile(
  file: File,
  maxSizeMB: number
): { valid: boolean; mediaType?: MediaType; error?: string } {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: 'Unsupported format. Please upload JPG, PNG, WebP, GIF, MP4, WebM, or MOV files.',
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
  };
}

export function uploadMediaFile(
  file: File,
  folder: 'posts' | 'avatars' | 'covers',
  userId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${folder}/${userId}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => {
        const code = (error as { code?: string }).code || '';
        if (code === 'storage/unauthorized') {
          reject(
            new Error(
              'Firebase Storage rejected the upload. Deploy storage.rules in Firebase Console -> Storage -> Rules to enable media uploads.'
            )
          );
          return;
        }
        if (code === 'storage/retry-limit-exceeded' || code === 'storage/unknown') {
          reject(
            new Error(
              'Firebase Storage bucket is not initialized yet. Enable Storage in your Firebase Console to upload media.'
            )
          );
          return;
        }
        reject(new Error(error.message || 'Media upload failed. Please try again.'));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to retrieve uploaded file URL.'));
        }
      }
    );
  });
}
