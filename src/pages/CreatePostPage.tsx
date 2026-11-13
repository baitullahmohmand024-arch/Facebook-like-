import React, { useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AspectRatioType, MediaType } from '../types';
import { uploadMediaFile, validateMediaFile } from '../services/mediaService';
import { createPost } from '../services/postService';
import { parseHashtags } from '../utils/formatters';

interface CreatePostPageProps {
  onPublished: () => void;
  onCancel: () => void;
}

export function CreatePostPage({ onPublished, onCancel }: CreatePostPageProps) {
  const { profile, platformSettings, refreshUserState } = useAuth();
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('landscape');
  const [caption, setCaption] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelected = (file: File) => {
    setErrorMsg('');
    const validation = validateMediaFile(file, platformSettings.maxUploadSizeMB);
    if (!validation.valid || !validation.mediaType) {
      setErrorMsg(validation.error || 'Invalid media file.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objUrl);
    setMediaType(validation.mediaType);
    if (validation.mediaType === 'video') {
      setAspectRatio('vertical');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const clearSelectedFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
    setUploadProgress(0);
    setErrorMsg('');
  };

  const parsedTags = parseHashtags(hashtagInput, caption);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!selectedFile) {
      setErrorMsg('Please select a photograph or video to publish.');
      return;
    }

    setPublishing(true);
    setErrorMsg('');
    setUploadProgress(5);

    try {
      const downloadUrl = await uploadMediaFile(
        selectedFile,
        'posts',
        profile.uid,
        (pct) => setUploadProgress(Math.max(5, pct))
      );

      await createPost({
        author: profile,
        mediaUrl: downloadUrl,
        mediaType,
        aspectRatio,
        caption,
        hashtags: parsedTags,
      });

      await refreshUserState();
      showToast({
        type: 'success',
        title: 'Story published',
        description: 'Your post is now live across HOSTELVERSE.',
      });
      onPublished();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not publish your post.');
      setUploadProgress(0);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Create Post
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Share a photograph or vertical Moment · Max {platformSettings.maxUploadSizeMB} MB
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-medium border border-white/10 text-[#A1A1AA] hover:text-[#F8F9FA]"
        >
          Cancel
        </button>
      </div>

      <form
        onSubmit={handlePublish}
        className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-6"
      >
        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 leading-relaxed"
          >
            {errorMsg}
          </div>
        )}

        {/* Media Upload / Preview Zone */}
        {!previewUrl ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`cursor-pointer flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 px-6 text-center transition-colors ${
              dragActive
                ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                : 'border-white/15 bg-[#0A0A0C] hover:border-[#D4AF37]/50'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#151519] border border-white/10 flex items-center justify-center text-[#D4AF37] mb-4">
              <Upload className="w-5 h-5" />
            </div>
            <p className="font-display text-base font-semibold text-[#F8F9FA]">
              Drop a photograph or video here
            </p>
            <p className="mt-1.5 text-xs text-[#A1A1AA]">
              Supports JPG, PNG, WebP, GIF, MP4, WebM, MOV up to {platformSettings.maxUploadSizeMB} MB
            </p>
            <span className="mt-5 px-4 py-2 rounded-xl text-xs font-semibold gold-gradient-btn">
              Select Media File
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
              className="hidden"
            />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-[#0A0A0C] border border-white/[0.08]">
              {mediaType === 'video' ? (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full max-h-[460px] object-contain mx-auto"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="Upload preview"
                  className="w-full max-h-[460px] object-contain mx-auto"
                />
              )}
              {!publishing && (
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  aria-label="Remove selected media"
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-[#F8F9FA] hover:bg-black transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#A1A1AA]">
              <span className="flex items-center gap-2">
                {mediaType === 'video' ? (
                  <Film className="w-4 h-4 text-[#D4AF37]" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
                )}
                <span>
                  {selectedFile?.name} ·{' '}
                  {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                </span>
              </span>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'landscape', label: '4:3' },
                    { id: 'square', label: '1:1' },
                    { id: 'portrait', label: '3:4' },
                    { id: 'vertical', label: '9:16 Moment' },
                  ] as const
                ).map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      aspectRatio === ratio.id
                        ? 'bg-[#D4AF37] text-[#0A0A0C]'
                        : 'bg-[#0A0A0C] text-[#A1A1AA] border border-white/10 hover:text-[#F8F9FA]'
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Caption */}
        <div>
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1.5">
            <label htmlFor="post-caption" className="font-medium">
              Caption
            </label>
            <span className="font-mono tabular-nums">{caption.length}/1000</span>
          </div>
          <textarea
            id="post-caption"
            rows={4}
            maxLength={1000}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write the story behind this moment... You can mention peers with @username or add #hashtags."
            className="w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-4 py-3 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37] resize-none"
          />
        </div>

        {/* Optional Hashtags */}
        <div>
          <label htmlFor="post-hashtags" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
            Hashtags (optional, up to 10)
          </label>
          <input
            id="post-hashtags"
            type="text"
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            placeholder="rooftop, latenightstudy, hostellife"
            className="w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-4 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
          />
          {parsedTags.length > 0 && (
            <p className="mt-2 text-xs text-[#D4AF37]">
              Tags: {parsedTags.map((t) => `#${t}`).join(' · ')}
            </p>
          )}
        </div>

        {/* Upload Progress Bar */}
        {publishing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Uploading to HOSTELVERSE Storage...</span>
              <span className="font-mono tabular-nums text-[#D4AF37]">{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#0A0A0C] overflow-hidden border border-white/[0.06]">
              <div
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#E7C96F] transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={publishing}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-[#F8F9FA] hover:bg-white/[0.04] disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={publishing || !selectedFile}
            className="gold-gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : 'Publish Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
