import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { updateUserProfile } from '../services/userService';
import { formatBytes, uploadMediaFile, validateMediaFile } from '../services/mediaService';
import { formatUserFriendlyError } from '../lib/firestoreError';
import { playSound } from '../utils/soundVfx';

export function CoverUploadCard() {
  const { profile, platformSettings, setProfile } = useAuth();
  const { showToast } = useToast();
  const inputFileRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
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
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validation = validateMediaFile(file, platformSettings.maxUploadSizeMB);
    if (!validation.valid || validation.mediaType !== 'image') {
      setErrorMsg(validation.error || 'Please choose a JPEG, PNG, or WebP cover image.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!selectedFile) {
      setErrorMsg('Please select a cover photo from your gallery first.');
      return;
    }
    setUploading(true);
    setProgressPercent(5);
    try {
      const coverUrl = await uploadMediaFile(selectedFile, 'covers', profile.uid, (pct) => {
        setProgressPercent(pct);
      });
      const updated = await updateUserProfile(profile.uid, profile.usernameLower, {
        coverUrl,
      });
      setProfile(updated);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
      if (inputFileRef.current) inputFileRef.current.value = '';
      playSound('upload-success');
      showToast({
        type: 'success',
        title: 'Cover photo updated',
        description: 'Your new cover photo is now visible on your profile.',
      });
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Unable to upload cover photo.');
      setErrorMsg(msg);
      showToast({
        type: 'error',
        title: 'Cover photo upload failed',
        description: msg,
      });
    } finally {
      setUploading(false);
    }
  };

  const activeCover = previewUrl || profile.coverUrl;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
            Profile Cover Photo
          </h2>
        </div>
        <span className="text-[11px] text-[#71717A]">JPEG, PNG, or WebP · Gallery</span>
      </div>

      <div className="rounded-xl overflow-hidden bg-[#0A0A0C] border border-white/[0.08] h-32 sm:h-40 relative">
        {activeCover ? (
          <img
            src={activeCover}
            alt="Profile cover preview"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#19191D] via-[#111114] to-[#050505] flex items-center justify-center text-xs text-[#71717A]">
            No custom cover photo selected yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-white/15 bg-[#0A0A0C] text-xs font-medium text-[#F8F9FA] hover:border-[#D4AF37]/50 transition-colors inline-flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{selectedFile ? 'Change Cover' : 'Choose from Gallery'}</span>
            <input
              ref={inputFileRef}
              type="file"
              accept="image/jpeg, image/png, image/webp"
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
            {uploading ? `Uploading ${progressPercent}%` : 'Save Cover'}
          </button>
        </div>

        {selectedFile && (
          <span className="text-xs text-[#A1A1AA] truncate max-w-full">
            {selectedFile.name} ({formatBytes(selectedFile.size)})
          </span>
        )}
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
    </form>
  );
}
