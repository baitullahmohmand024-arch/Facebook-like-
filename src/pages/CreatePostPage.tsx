import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AspectRatioType } from '../types';
import {
  checkStorageBucketAvailable,
  formatBytes,
  formatEta,
  formatSpeed,
  PreparedMedia,
  prepareMediaForUpload,
  startResumableUpload,
  supportsWebPEncoding,
  UploadCancelledError,
  UploadTelemetry,
  validateMediaFile,
} from '../services/mediaService';
import { createPost } from '../services/postService';
import { parseHashtags } from '../utils/formatters';
import { formatUserFriendlyError } from '../lib/firestoreError';
import { playSound } from '../utils/soundVfx';

interface CreatePostPageProps {
  onPublished: () => void;
  onCancel: () => void;
}

type ComposerMode = 'media' | 'text';
type PublishStage = 'idle' | 'optimizing' | 'uploading' | 'saving' | 'failed';

export function CreatePostPage({ onPublished, onCancel }: CreatePostPageProps) {
  const { profile, platformSettings, refreshUserState } = useAuth();
  const { showToast } = useToast();

  const [composerMode, setComposerMode] = useState<ComposerMode>('media');
  const [prepared, setPrepared] = useState<PreparedMedia | null>(null);
  const [originalFileName, setOriginalFileName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('landscape');
  const [caption, setCaption] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');

  const [stage, setStage] = useState<PublishStage>('idle');
  const [telemetry, setTelemetry] = useState<UploadTelemetry | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const [instantPreviewUrl, setInstantPreviewUrl] = useState<string | null>(null);
  const instantPreviewRef = useRef<string | null>(null);
  const selectionSeqRef = useRef(0);
  const submittingRef = useRef(false);
  const cancelActiveUploadRef = useRef<(() => void) | null>(null);
  const uploadedCacheRef = useRef<{
    fingerprint: string;
    mediaUrl: string;
    thumbnailUrl?: string;
    elapsedMs: number;
  } | null>(null);

  const revokePreparedUrls = (item: PreparedMedia | null) => {
    if (!item) return;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.thumbnailPreviewUrl) URL.revokeObjectURL(item.thumbnailPreviewUrl);
  };

  useEffect(() => {
    void checkStorageBucketAvailable();
    void supportsWebPEncoding();
    return () => {
      cancelActiveUploadRef.current?.();
      if (instantPreviewRef.current) {
        URL.revokeObjectURL(instantPreviewRef.current);
        instantPreviewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      revokePreparedUrls(prepared);
    };
  }, [prepared]);

  const handleFileSelected = async (file: File) => {
    if (submittingRef.current) return;
    setErrorMsg('');
    const validation = validateMediaFile(file, platformSettings.maxUploadSizeMB);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid media file.');
      return;
    }

    const seq = ++selectionSeqRef.current;
    uploadedCacheRef.current = null;
    setTelemetry(null);
    setOriginalFileName(file.name);
    setComposerMode('media');
    setStage('optimizing');

    // Show immediate 0ms preview for photos while single-pass WebP optimization finishes
    if (instantPreviewRef.current) {
      URL.revokeObjectURL(instantPreviewRef.current);
      instantPreviewRef.current = null;
    }
    if (validation.mediaType === 'image') {
      const quickUrl = URL.createObjectURL(file);
      instantPreviewRef.current = quickUrl;
      setInstantPreviewUrl(quickUrl);
    } else {
      setInstantPreviewUrl(null);
    }

    try {
      const nextPrepared = await prepareMediaForUpload(file, {
        folder: 'posts',
        maxDimension: 1280,
        quality: 0.78,
      });
      if (seq !== selectionSeqRef.current) {
        revokePreparedUrls(nextPrepared);
        return;
      }
      setPrepared((prev) => {
        revokePreparedUrls(prev);
        return nextPrepared;
      });
      if (instantPreviewRef.current) {
        URL.revokeObjectURL(instantPreviewRef.current);
        instantPreviewRef.current = null;
      }
      setInstantPreviewUrl(null);
      setAspectRatio(nextPrepared.suggestedAspectRatio);
      setStage('idle');
      playSound('ui-tap');
    } catch (err) {
      if (seq !== selectionSeqRef.current) return;
      if (instantPreviewRef.current) {
        URL.revokeObjectURL(instantPreviewRef.current);
        instantPreviewRef.current = null;
      }
      setInstantPreviewUrl(null);
      setStage('idle');
      setErrorMsg(formatUserFriendlyError(err, 'Could not process the selected media file.'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFileSelected(file);
  };

  const clearSelectedFile = () => {
    if (submittingRef.current) return;
    selectionSeqRef.current++;
    if (instantPreviewRef.current) {
      URL.revokeObjectURL(instantPreviewRef.current);
      instantPreviewRef.current = null;
    }
    setInstantPreviewUrl(null);
    setPrepared((prev) => {
      revokePreparedUrls(prev);
      return null;
    });
    uploadedCacheRef.current = null;
    setOriginalFileName('');
    setTelemetry(null);
    setStage('idle');
    setErrorMsg('');
  };

  const handleModeChange = (nextMode: ComposerMode) => {
    if (isBusy) return;
    setErrorMsg('');
    setComposerMode(nextMode);
    if (nextMode === 'text' && prepared) {
      clearSelectedFile();
    }
  };

  const handleCancelUpload = () => {
    cancelActiveUploadRef.current?.();
    cancelActiveUploadRef.current = null;
  };

  const parsedTags = parseHashtags(hashtagInput, caption);
  const isBusy = stage === 'optimizing' || stage === 'uploading' || stage === 'saving';
  const hasText = caption.trim().length > 0;
  const isTextOnlyPublish = composerMode === 'text' || (!prepared && hasText);
  const canPublish = Boolean(prepared || hasText);

  const executePublish = async () => {
    if (!profile || submittingRef.current) return;
    if (!prepared && !hasText) {
      setErrorMsg('Write a post or attach a photograph or video to publish.');
      return;
    }

    submittingRef.current = true;
    setErrorMsg('');
    const startedAt = performance.now();
    playSound('upload-start');

    try {
      // Direct Text-Only Post (instant Firestore save, zero media upload wait)
      if (!prepared || composerMode === 'text') {
        setStage('saving');
        await createPost({
          author: profile,
          mediaUrl: '',
          mediaType: 'text',
          aspectRatio: 'square',
          caption,
          hashtags: parsedTags,
        });
        void refreshUserState();
        playSound('upload-success');
        const elapsedSec = ((performance.now() - startedAt) / 1000).toFixed(1);
        showToast({
          type: 'success',
          title: 'Post published',
          description: `Published directly to the feed in ${elapsedSec}s.`,
        });
        onPublished();
        return;
      }

      // Media Post (Image or Video)
      let mediaUrl: string;
      let thumbnailUrl: string | undefined;
      let uploadElapsedMs = 0;

      if (uploadedCacheRef.current?.fingerprint === prepared.fingerprint) {
        mediaUrl = uploadedCacheRef.current.mediaUrl;
        thumbnailUrl = uploadedCacheRef.current.thumbnailUrl;
        uploadElapsedMs = uploadedCacheRef.current.elapsedMs;
      } else {
        const storageAvailable =
          prepared.mediaType === 'image' && prepared.directDataUrl
            ? await checkStorageBucketAvailable()
            : true;

        if (!storageAvailable && prepared.directDataUrl) {
          // Single-pass precomputed image is already ready — skip upload stage entirely and save straight to Firestore
          mediaUrl = prepared.directDataUrl;
          uploadElapsedMs = 0;
        } else {
          setStage('uploading');
          setTelemetry({
            phase: 'uploading',
            bytesTransferred: 0,
            totalBytes: prepared.optimizedSize,
            percent: 0,
            speedBytesPerSec: 0,
            etaSeconds: null,
            elapsedMs: 0,
            attempt: 1,
          });

          const mainUpload = startResumableUpload({
            file: prepared.uploadFile,
            folder: 'posts',
            userId: profile.uid,
            precomputedDataUrl: prepared.directDataUrl,
            onProgress: (nextTelemetry) => setTelemetry(nextTelemetry),
          });

          const thumbUpload =
            prepared.mediaType === 'video' && prepared.thumbnailFile
              ? startResumableUpload({
                  file: prepared.thumbnailFile,
                  folder: 'thumbnails',
                  userId: profile.uid,
                  maxAutoRetries: 1,
                })
              : null;

          cancelActiveUploadRef.current = () => {
            mainUpload.cancel();
            thumbUpload?.cancel();
          };

          const [mainRes, thumbRes] = await Promise.all([
            mainUpload.promise,
            thumbUpload ? thumbUpload.promise.catch(() => null) : Promise.resolve(null),
          ]);

          cancelActiveUploadRef.current = null;
          mediaUrl = mainRes.downloadUrl;
          thumbnailUrl = thumbRes?.downloadUrl;
          uploadElapsedMs = mainRes.elapsedMs;
        }

        uploadedCacheRef.current = {
          fingerprint: prepared.fingerprint,
          mediaUrl,
          thumbnailUrl,
          elapsedMs: uploadElapsedMs,
        };
      }

      setStage('saving');
      await createPost({
        author: profile,
        mediaUrl,
        thumbnailUrl,
        mediaType: prepared.mediaType,
        aspectRatio,
        caption,
        hashtags: parsedTags,
      });

      void refreshUserState();
      playSound('upload-success');
      const totalSec = ((performance.now() - startedAt) / 1000).toFixed(1);
      showToast({
        type: 'success',
        title: 'Story published',
        description: `Live in the HOSTELVERSE feed in ${totalSec}s.`,
      });
      onPublished();
    } catch (err) {
      cancelActiveUploadRef.current = null;
      setStage('failed');
      if (err instanceof UploadCancelledError) {
        playSound('unlike');
        setErrorMsg('Upload cancelled. Your caption, hashtags, and media are preserved.');
      } else {
        playSound('error');
        setErrorMsg(formatUserFriendlyError(err, 'Could not publish your post. Please try again.'));
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const handlePublishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPublish) {
      setErrorMsg('Write a post or attach a photograph or video to publish.');
      return;
    }
    void executePublish();
  };

  const getStageMessage = (): string => {
    if (stage === 'optimizing') return 'Optimizing media preview...';
    if (stage === 'saving') return 'Publishing to HOSTELVERSE feed...';
    if (!telemetry) return 'Preparing upload...';
    if (telemetry.phase === 'paused-offline') return 'Paused — waiting for network connection...';
    if (telemetry.phase === 'retrying') return `Reconnecting (attempt ${telemetry.attempt})...`;
    if (telemetry.phase === 'stalled') return 'Connection looks stalled — wait, cancel, or retry.';
    if (telemetry.phase === 'verifying') return 'Confirming download URL...';
    return `Uploading ${prepared?.formatLabel || 'media'} to HOSTELVERSE...`;
  };

  const savedPercent =
    prepared && prepared.originalSize > 0 && prepared.optimizedSize < prepared.originalSize
      ? Math.round(((prepared.originalSize - prepared.optimizedSize) / prepared.originalSize) * 100)
      : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Create Post
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Publish text thoughts, photographs, or vertical Moments · Max {platformSettings.maxUploadSizeMB} MB
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08]">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleModeChange('media')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                composerMode === 'media'
                  ? 'bg-[#D4AF37] text-[#0A0A0C]'
                  : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Photo / Video</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleModeChange('text')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                composerMode === 'text'
                  ? 'bg-[#D4AF37] text-[#0A0A0C]'
                  : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Text Only</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium border border-white/10 text-[#A1A1AA] hover:text-[#F8F9FA] disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
        </div>
      </div>

      <form
        onSubmit={handlePublishSubmit}
        className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-6"
      >
        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {canPublish && stage === 'failed' && (
              <button
                type="button"
                onClick={() => void executePublish()}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Media Dropzone / Preview when in Media mode */}
        {composerMode === 'media' && (
          <>
            {stage === 'optimizing' && instantPreviewUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-[#0A0A0C] border border-white/[0.08]">
                  <img
                    src={instantPreviewUrl}
                    alt="Instant upload preview"
                    className="w-full max-h-[460px] object-contain mx-auto"
                  />
                  <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/75 border border-white/15 px-3 py-1.5 text-xs text-[#F8F9FA]">
                    <Loader2 className="w-3.5 h-3.5 text-[#D4AF37] animate-spin" />
                    <span>Optimizing WebP...</span>
                  </div>
                </div>
              </div>
            ) : stage === 'optimizing' && !prepared ? (
              <div className="rounded-2xl border border-white/10 bg-[#0A0A0C] py-14 px-6 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="w-7 h-7 text-[#D4AF37] animate-spin" />
                <p className="text-sm font-medium text-[#F8F9FA]">Optimizing preview for fast upload...</p>
                <p className="text-xs text-[#A1A1AA]">{originalFileName}</p>
              </div>
            ) : !prepared ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`cursor-pointer flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 px-6 text-center transition-colors ${
                  dragActive
                    ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                    : 'border-white/15 bg-[#0A0A0C] hover:border-[#D4AF37]/50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#151519] border border-white/10 flex items-center justify-center text-[#D4AF37] mb-3.5">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="font-display text-base font-semibold text-[#F8F9FA]">
                  Drop a photograph or video here
                </p>
                <p className="mt-1.5 text-xs text-[#A1A1AA]">
                  Optional — attach media or just write a text post below
                </p>
                <span className="mt-4 min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold gold-gradient-btn inline-flex items-center">
                  Select Media File
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelected(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-[#0A0A0C] border border-white/[0.08]">
                  {prepared.mediaType === 'video' ? (
                    <video
                      src={prepared.previewUrl}
                      poster={prepared.thumbnailPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-[460px] object-contain mx-auto"
                    />
                  ) : (
                    <img
                      src={prepared.previewUrl}
                      alt="Upload preview"
                      className="w-full max-h-[460px] object-contain mx-auto"
                    />
                  )}
                  {!isBusy && (
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      aria-label="Remove selected media"
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center absolute top-3 right-3 rounded-full bg-black/75 text-[#F8F9FA] hover:bg-black transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#A1A1AA]">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    {prepared.mediaType === 'video' ? (
                      <Film className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <span className="truncate font-mono tabular-nums">
                      {originalFileName} ·{' '}
                      {prepared.wasCompressed ? (
                        <>
                          {formatBytes(prepared.originalSize)} →{' '}
                          <span className="text-[#D4AF37] font-semibold">
                            {formatBytes(prepared.optimizedSize)} {prepared.formatLabel}
                          </span>
                          {savedPercent > 0 ? ` (-${savedPercent}%)` : ''}
                        </>
                      ) : (
                        <>
                          {formatBytes(prepared.optimizedSize)} {prepared.formatLabel}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
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
                        disabled={isBusy}
                        onClick={() => setAspectRatio(ratio.id)}
                        className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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
          </>
        )}

        {/* Live Text Post Preview when Text-Only Mode is selected */}
        {composerMode === 'text' && (
          <div className="rounded-2xl bg-[#0A0A0C] border border-white/[0.08] p-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Text Post Preview</span>
              <span>@{profile?.username || 'member'}</span>
            </div>
            <p className="text-[16px] leading-relaxed text-[#F8F9FA] whitespace-pre-wrap break-words min-h-[3rem]">
              {caption.trim() ? caption : 'Your hostel update, thought, or announcement will appear here cleanly in the feed.'}
            </p>
          </div>
        )}

        {/* Caption / Post Text */}
        <div>
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1.5">
            <label htmlFor="post-caption" className="font-medium">
              {composerMode === 'text' ? 'Post Text' : 'Caption'}
            </label>
            <span className="font-mono tabular-nums">{caption.length}/1000</span>
          </div>
          <textarea
            id="post-caption"
            rows={composerMode === 'text' ? 5 : 4}
            maxLength={1000}
            value={caption}
            disabled={isBusy}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={
              composerMode === 'text'
                ? 'Share a hostel update, event notice, study room invite, or thought... Mention peers with @username or add #hashtags.'
                : 'Write the story behind this moment (or publish text-only without media)... Mention peers with @username or add #hashtags.'
            }
            className="w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-4 py-3 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37] resize-none disabled:opacity-60"
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
            disabled={isBusy}
            onChange={(e) => setHashtagInput(e.target.value)}
            placeholder="rooftop, latenightstudy, hostellife"
            className="w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-4 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37] disabled:opacity-60"
          />
          {parsedTags.length > 0 && (
            <p className="mt-2 text-xs text-[#D4AF37]">
              Tags: {parsedTags.map((t) => `#${t}`).join(' · ')}
            </p>
          )}
        </div>

        {/* Real Upload Progress Panel */}
        {(stage === 'uploading' || stage === 'saving') && (
          <div className="rounded-xl bg-[#0A0A0C] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#F8F9FA] min-w-0">
                {telemetry?.phase === 'paused-offline' ? (
                  <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin shrink-0" />
                )}
                <span className="truncate font-medium">{getStageMessage()}</span>
              </div>
              <span className="font-mono tabular-nums text-[#D4AF37] font-semibold shrink-0">
                {stage === 'saving' ? '100%' : `${telemetry?.percent ?? 0}%`}
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-[#151519] overflow-hidden border border-white/[0.06]">
              <div
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#E7C96F] transition-[width] duration-150"
                style={{ width: `${stage === 'saving' ? 100 : telemetry?.percent ?? 0}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1AA] font-mono tabular-nums">
              <span>
                {stage === 'saving'
                  ? 'Saving post to Firestore...'
                  : telemetry
                  ? `${formatBytes(telemetry.bytesTransferred)} / ${formatBytes(telemetry.totalBytes)}`
                  : ''}
                {stage === 'uploading' && telemetry && telemetry.speedBytesPerSec > 0
                  ? ` · ${formatSpeed(telemetry.speedBytesPerSec)}`
                  : ''}
                {stage === 'uploading' && telemetry?.etaSeconds
                  ? ` · ${formatEta(telemetry.etaSeconds)}`
                  : ''}
              </span>

              {stage === 'uploading' && (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-white/15 text-[#F8F9FA] hover:border-rose-400/50 hover:text-rose-300 font-sans font-medium transition-colors whitespace-nowrap"
                >
                  Cancel Upload
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-[#F8F9FA] hover:bg-white/[0.04] disabled:opacity-40 whitespace-nowrap"
          >
            Discard
          </button>

          {stage === 'failed' && canPublish ? (
            <button
              type="button"
              onClick={() => void executePublish()}
              className="min-h-[44px] gold-gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Publish</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isBusy || !canPublish}
              className="min-h-[44px] gold-gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
            >
              {stage === 'optimizing'
                ? 'Optimizing...'
                : stage === 'uploading'
                ? `Uploading ${telemetry?.percent ?? 0}%`
                : stage === 'saving'
                ? 'Publishing...'
                : isTextOnlyPublish
                ? 'Publish Text Post'
                : 'Publish Post'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
