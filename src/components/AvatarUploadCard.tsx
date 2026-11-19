import React, { useEffect, useRef, useState } from 'react';
import type { PutBlobResult } from '@vercel/blob';
import { updateProfile } from 'firebase/auth';
import { Camera, CheckCircle2, ExternalLink, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar } from './Avatar';
import { updateUserProfile } from '../services/userService';
import { formatBytes, uploadAvatarBlob } from '../services/mediaService';
import { formatUserFriendlyError } from '../lib/firestoreError';
import { playSound } from '../utils/soundVfx';

export function AvatarUploadCard() {
  const { firebaseUser, profile, setProfile } = useAuth();
  const { showToast } = useToast();
  const inputFileRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!profile) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const file = e.target.files?.[0] || null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setSelectedFile(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');

    const file = inputFileRef.current?.files?.[0] || selectedFile;
    if (!file) {
      setErrorMsg('Please select a JPEG, PNG, or WebP image first.');
      return;
    }

    setUploading(true);
    setProgressPercent(5);

    try {
      const result = await uploadAvatarBlob(file, profile.uid, (telemetry) => {
        setProgressPercent(telemetry.percent);
      });

      const updated = await updateUserProfile(profile.uid, profile.usernameLower, {
        avatarUrl: result.downloadUrl,
      });

      if (
        firebaseUser &&
        result.downloadUrl.startsWith('https://') &&
        result.downloadUrl.length <= 1800
      ) {
        await updateProfile(firebaseUser, { photoURL: result.downloadUrl }).catch(() => {});
      }

      setProfile(updated);

      if (result.blob) {
        setBlob(result.blob);
      } else if (result.downloadUrl.startsWith('https://')) {
        setBlob({
          url: result.downloadUrl,
          downloadUrl: result.downloadUrl,
          pathname: result.storagePath,
          contentType: file.type || 'image/webp',
          contentDisposition: 'inline',
          etag: '',
        });
      } else {
        setBlob(null);
      }

      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
      if (inputFileRef.current) {
        inputFileRef.current.value = '';
      }

      playSound('upload-success');
      showToast({
        type: 'success',
        title: 'Avatar updated',
        description: `Saved in ${(result.elapsedMs / 1000).toFixed(2)}s`,
      });
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Unable to upload avatar.');
      setErrorMsg(msg);
      showToast({
        type: 'error',
        title: 'Avatar upload failed',
        description: msg,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Camera className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
            Upload Your Avatar
          </h2>
        </div>
        <span className="text-[11px] text-[#71717A]">JPEG, PNG, or WebP · Max 5 MB</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar
          src={previewUrl || profile.avatarUrl}
          name={profile.fullName}
          size="lg"
          className="ring-2 ring-[#D4AF37]/30"
        />

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-white/15 bg-[#0A0A0C] text-xs font-medium text-[#F8F9FA] hover:border-[#D4AF37]/50 transition-colors inline-flex items-center gap-2">
              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{selectedFile ? 'Change Image' : 'Choose Image'}</span>
              <input
                name="file"
                ref={inputFileRef}
                type="file"
                accept="image/jpeg, image/png, image/webp"
                required
                disabled={uploading}
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {uploading ? `Uploading ${progressPercent}%` : 'Upload'}
            </button>
          </div>

          {selectedFile ? (
            <p className="text-xs text-[#A1A1AA] truncate">
              Selected: <span className="text-[#F8F9FA]">{selectedFile.name}</span> (
              {formatBytes(selectedFile.size)})
            </p>
          ) : (
            <p className="text-xs text-[#71717A]">
              Choose a photo and tap Upload to save it to your HOSTELVERSE profile.
            </p>
          )}
        </div>
      </div>

      {uploading && (
        <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-[#D4AF37] transition-all duration-150"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="text-xs text-rose-400">
          {errorMsg}
        </p>
      )}

      {blob && (
        <div className="rounded-xl bg-[#0A0A0C] border border-[#D4AF37]/25 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <a
              href={blob.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#D4AF37] hover:underline truncate"
            >
              {blob.url}
            </a>
          </div>
          <a
            href={blob.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open uploaded avatar URL"
            className="text-[#A1A1AA] hover:text-[#F8F9FA] shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </form>
  );
}
