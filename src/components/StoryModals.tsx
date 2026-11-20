import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pause,
  Play,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { StoryItem, UserProfile } from '../types';
import { createStory, deleteStory } from '../services/storyService';
import { uploadMediaFile, validateMediaFile } from '../services/mediaService';
import { useToast } from '../context/ToastContext';
import { Avatar } from './Avatar';
import { formatRelativeTime } from '../utils/formatters';
import { formatUserFriendlyError } from '../lib/firestoreError';
import { playSound } from '../utils/soundVfx';

interface AddStoryModalProps {
  open: boolean;
  profile: UserProfile;
  maxUploadSizeMB: number;
  onClose: () => void;
  onStoryCreated: (story: StoryItem) => void;
}

export function AddStoryModal({
  open,
  profile,
  maxUploadSizeMB,
  onClose,
  onStoryCreated,
}: AddStoryModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open) return null;

  const resetAndClose = () => {
    if (uploading) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
    setCaption('');
    setProgress(0);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateMediaFile(file, maxUploadSizeMB);
    if (!validation.valid || !validation.mediaType) {
      setErrorMsg(validation.error || 'Please choose a photo or short video.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setMediaType(validation.mediaType);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a photo or video from your gallery.');
      return;
    }
    setUploading(true);
    setProgress(8);
    setErrorMsg('');
    try {
      const mediaUrl = await uploadMediaFile(selectedFile, 'posts', profile.uid, (pct) => {
        setProgress(pct);
      });
      const created = await createStory({
        author: profile,
        mediaUrl,
        mediaType,
        caption,
      });
      playSound('upload-success');
      showToast({
        type: 'success',
        title: 'Story added!',
        description: 'Visible to hostel friends for 24 hours.',
      });
      onStoryCreated(created);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(null);
      setPreviewUrl('');
      setCaption('');
      setProgress(0);
      onClose();
    } catch (err) {
      setErrorMsg(formatUserFriendlyError(err, 'Could not publish your story.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Add Story"
    >
      <form
        onSubmit={handlePublish}
        className="w-full max-w-md rounded-2xl bg-[#111114] border border-[#F5C542]/30 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#15151A]">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F8D162] via-[#F5C542] to-[#D99B19] text-[#050505] flex items-center justify-center shadow-[0_2px_10px_rgba(245,197,66,0.35)]">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-[#FFFFFF]">Add Story</h2>
              <p className="text-[11px] text-[#A5A5AD]">Share a 24-hour campus moment</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={uploading}
            aria-label="Close Add Story"
            className="p-2 rounded-full text-[#A5A5AD] hover:text-[#FFFFFF] hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {!previewUrl ? (
            <label className="cursor-pointer block rounded-2xl border-2 border-dashed border-[#F5C542]/40 hover:border-[#F5C542] bg-[#0B0B0E] hover:bg-[#16161B] transition-all p-8 text-center group">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#F5C542]/20 to-[#D99B19]/10 border border-[#F5C542]/35 flex items-center justify-center text-[#F5C542] group-hover:scale-105 transition-transform">
                <ImagePlus className="w-6 h-6" />
              </div>
              <p className="mt-4 font-display text-sm font-semibold text-[#FFFFFF]">
                Select Photo or Video from Gallery
              </p>
              <p className="mt-1 text-xs text-[#A5A5AD]">
                JPG, PNG, WebP, MP4 or WebM · Disappears after 24 hours
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={handleFilePick}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-[#050505] border border-[#F5C542]/30 aspect-[4/5] max-h-[340px] mx-auto flex items-center justify-center">
                {mediaType === 'video' ? (
                  <video
                    src={previewUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Story preview"
                    className="w-full h-full object-cover"
                  />
                )}
                {!uploading && (
                  <label className="cursor-pointer absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 border border-[#F5C542]/40 text-xs font-medium text-[#FFFFFF] hover:border-[#F5C542] backdrop-blur-sm">
                    Change Media
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={handleFilePick}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#A5A5AD]">
              Caption (optional)
              <input
                type="text"
                maxLength={280}
                value={caption}
                disabled={uploading}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Evening tea at ICP lawn..."
                className="mt-1.5 w-full rounded-xl bg-[#050505] border border-white/10 px-3.5 py-2.5 text-sm text-[#FFFFFF] placeholder:text-[#71717A] focus:outline-none focus:border-[#F5C542]"
              />
            </label>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#F5C542]">
                <span>Publishing story...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D99B19] to-[#F8D162] transition-all duration-150"
                  style={{ width: `${Math.max(6, progress)}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <p role="alert" className="text-xs text-rose-400">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.08] bg-[#15151A] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={resetAndClose}
            disabled={uploading}
            className="px-4 py-2 rounded-full text-xs font-medium border border-white/15 text-[#FFFFFF] hover:bg-white/[0.04] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading || !selectedFile}
            className="gold-gradient-btn px-5 py-2 rounded-full text-xs font-bold disabled:opacity-45"
          >
            {uploading ? 'Sharing...' : 'Share Story'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface StoryViewerModalProps {
  stories: StoryItem[];
  initialIndex: number;
  currentUserId?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onOpenProfile: (uid: string) => void;
  onStoryDeleted: (storyId: string) => void;
}

const IMAGE_STORY_DURATION_MS = 6000;

export function StoryViewerModal({
  stories,
  initialIndex,
  currentUserId,
  isAdmin = false,
  onClose,
  onOpenProfile,
  onStoryDeleted,
}: StoryViewerModalProps) {
  const { showToast } = useToast();
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1))
  );
  const [paused, setPaused] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const currentStory = stories[index];

  useEffect(() => {
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1)));
    setProgressPct(0);
  }, [initialIndex, stories.length]);

  useEffect(() => {
    if (!currentStory || paused || currentStory.mediaType === 'video') return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / IMAGE_STORY_DURATION_MS) * 100);
      setProgressPct(pct);
      if (pct >= 100) {
        clearInterval(timer);
        if (index < stories.length - 1) {
          setIndex((i) => i + 1);
          setProgressPct(0);
        } else {
          onClose();
        }
      }
    }, 50);
    return () => clearInterval(timer);
  }, [currentStory, index, paused, stories.length, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') {
        if (index < stories.length - 1) {
          setIndex((i) => i + 1);
          setProgressPct(0);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (index > 0) {
          setIndex((i) => i - 1);
          setProgressPct(0);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, stories.length, onClose]);

  if (!currentStory) return null;

  const canDelete = Boolean(
    currentUserId && (currentUserId === currentStory.authorId || isAdmin)
  );

  const goPrev = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
      setProgressPct(0);
    }
  };

  const goNext = () => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
      setProgressPct(0);
    } else {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setPaused(true);
    try {
      await deleteStory(currentStory.id);
      showToast({ type: 'success', title: 'Story deleted' });
      onStoryDeleted(currentStory.id);
      if (stories.length <= 1) {
        onClose();
      } else if (index >= stories.length - 1) {
        setIndex(Math.max(0, stories.length - 2));
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not delete story',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Story Viewer"
    >
      {/* Desktop prev button */}
      {index > 0 && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous story"
          className="hidden sm:flex absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#111114]/90 border border-[#F5C542]/30 text-[#FFFFFF] hover:border-[#F5C542] items-center justify-center z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Story Card Frame */}
      <div className="relative w-full h-full sm:w-[420px] sm:h-[82vh] sm:max-h-[760px] sm:rounded-3xl overflow-hidden bg-[#050505] border border-[#F5C542]/25 shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col">
        {/* Progress Bars */}
        <div className="absolute top-0 inset-x-0 z-20 p-3 pt-3.5 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
          <div className="flex items-center gap-1.5 mb-3">
            {stories.map((s, idx) => {
              const fill =
                idx < index
                  ? '100%'
                  : idx === index
                  ? currentStory.mediaType === 'video'
                    ? '100%'
                    : `${progressPct}%`
                  : '0%';
              return (
                <div
                  key={s.id}
                  className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
                >
                  <div
                    className="h-full bg-[#F5C542] transition-all duration-75"
                    style={{ width: fill }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile(currentStory.authorId);
              }}
              className="flex items-center gap-2.5 min-w-0 text-left"
            >
              <div className="p-[1.5px] rounded-full bg-gradient-to-tr from-[#D99B19] to-[#F8D162] shrink-0">
                <Avatar
                  src={currentStory.authorAvatarUrl}
                  name={currentStory.authorName}
                  size="sm"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#FFFFFF] truncate">
                  {currentStory.authorName}
                </p>
                <p className="text-[10px] text-[#A5A5AD]">
                  {formatRelativeTime(currentStory.createdAt)}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentStory.mediaType === 'image' && (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Resume story' : 'Pause story'}
                  className="p-2 rounded-full bg-black/40 text-[#FFFFFF] hover:text-[#F5C542]"
                >
                  {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label="Delete story"
                  className="p-2 rounded-full bg-black/40 text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close story viewer"
                className="p-2 rounded-full bg-black/40 text-[#FFFFFF] hover:text-[#F5C542]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Media Content */}
        <div className="relative flex-1 flex items-center justify-center bg-[#050505]">
          {currentStory.mediaType === 'video' ? (
            <video
              key={currentStory.id}
              src={currentStory.mediaUrl}
              autoPlay
              playsInline
              controls
              onEnded={goNext}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              key={currentStory.id}
              src={currentStory.mediaUrl}
              alt={currentStory.caption || currentStory.authorName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}

          {/* Tap Left/Right Navigation Zones for Images */}
          {currentStory.mediaType === 'image' && (
            <>
              <button
                type="button"
                aria-label="Previous story"
                onClick={goPrev}
                className="absolute inset-y-20 left-0 w-1/3 z-10 cursor-pointer"
              />
              <button
                type="button"
                aria-label="Next story"
                onClick={goNext}
                className="absolute inset-y-20 right-0 w-1/3 z-10 cursor-pointer"
              />
            </>
          )}
        </div>

        {/* Caption Overlay */}
        {currentStory.caption && (
          <div className="absolute bottom-0 inset-x-0 z-20 p-5 pt-10 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none">
            <p className="text-sm text-[#FFFFFF] leading-relaxed text-center drop-shadow">
              {currentStory.caption}
            </p>
          </div>
        )}
      </div>

      {/* Desktop next button */}
      <button
        type="button"
        onClick={goNext}
        aria-label="Next story"
        className="hidden sm:flex absolute right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#111114]/90 border border-[#F5C542]/30 text-[#FFFFFF] hover:border-[#F5C542] items-center justify-center z-20"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
