import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Film,
  Heart,
  MessageCircle,
  Pause,
  Play,
  PlusSquare,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CommentItem, Post } from '../types';
import {
  addComment,
  fetchComments,
  fetchVideoMoments,
  getUserLikedPostIds,
  toggleLikePost,
} from '../services/postService';
import { Avatar } from '../components/Avatar';
import { formatCount, formatRelativeTime } from '../utils/formatters';
import { playSound } from '../utils/soundVfx';

interface MomentsPageProps {
  onOpenProfile: (userId: string) => void;
  onNavigateCreate: () => void;
  onRequireAuth: () => void;
}

export function MomentsPage({
  onOpenProfile,
  onNavigateCreate,
  onRequireAuth,
}: MomentsPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [videos, setVideos] = useState<Post[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number | null>(null);

  const loadMoments = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchVideoMoments();
      setVideos(items);
      if (profile) {
        const likes = await getUserLikedPostIds(profile.uid);
        setLikedIds(likes);
      }
    } catch {
      showToast({ type: 'error', title: 'Could not load Moments' });
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  useEffect(() => {
    loadMoments();
  }, [loadMoments]);

  const currentVideo = videos[currentIndex] || null;

  useEffect(() => {
    setCommentsOpen(false);
    setComments([]);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (playing) {
        videoRef.current.play().catch(() => setPlaying(false));
      }
    }
  }, [currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((idx) => (idx < videos.length - 1 ? idx + 1 : idx));
  }, [videos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((idx) => (idx > 0 ? idx - 1 : idx));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleLike = async () => {
    if (!currentVideo) return;
    if (!profile) {
      onRequireAuth();
      return;
    }
    const currentlyLiked = likedIds.has(currentVideo.id);
    playSound(currentlyLiked ? 'unlike' : 'like');
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(currentVideo.id);
      else next.add(currentVideo.id);
      return next;
    });
    setVideos((prev) =>
      prev.map((v) =>
        v.id === currentVideo.id
          ? { ...v, likesCount: Math.max(0, v.likesCount + (currentlyLiked ? -1 : 1)) }
          : v
      )
    );
    try {
      await toggleLikePost(currentVideo, profile, currentlyLiked);
    } catch {
      showToast({ type: 'error', title: 'Could not update like' });
    }
  };

  const openCommentsDrawer = async () => {
    if (!currentVideo) return;
    setCommentsOpen(true);
    try {
      const list = await fetchComments(currentVideo.id);
      setComments(list);
    } catch {
      showToast({ type: 'error', title: 'Could not load comments' });
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVideo) return;
    if (!profile) {
      onRequireAuth();
      return;
    }
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const added = await addComment(currentVideo, profile, commentText);
      setComments((prev) => [...prev, added]);
      setVideos((prev) =>
        prev.map((v) =>
          v.id === currentVideo.id ? { ...v, commentsCount: v.commentsCount + 1 } : v
        )
      );
      setCommentText('');
      playSound('comment');
    } catch {
      showToast({ type: 'error', title: 'Could not send comment' });
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-full max-w-[400px] aspect-[9/16] rounded-3xl bg-[#151519] border border-white/[0.08] animate-pulse" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="max-w-lg mx-auto bg-[#151519] border border-white/[0.08] rounded-2xl p-12 text-center my-8">
        <Film className="w-10 h-10 text-[#D4AF37] mx-auto" />
        <h1 className="mt-4 font-display text-xl font-bold text-[#F8F9FA]">
          No Video Moments Yet
        </h1>
        <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
          Upload a vertical video clip from your hostel rooftop, studio session, or campus walk to
          kick off HOSTELVERSE Moments.
        </p>
        <button
          type="button"
          onClick={onNavigateCreate}
          className="mt-6 gold-gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
        >
          <PlusSquare className="w-4 h-4" />
          <span>Upload First Moment</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[420px] flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[#F8F9FA]">Moments</h1>
          <p className="text-xs text-[#A1A1AA] font-mono tabular-nums">
            {currentIndex + 1} / {videos.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="Previous video"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#151519] border border-white/10 flex items-center justify-center text-[#F8F9FA] disabled:opacity-30 hover:border-[#D4AF37]/40 transition-colors"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === videos.length - 1}
            aria-label="Next video"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#151519] border border-white/10 flex items-center justify-center text-[#F8F9FA] disabled:opacity-30 hover:border-[#D4AF37]/40 transition-colors"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Vertical Player Container */}
      <div
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current === null) return;
          const delta = touchStartY.current - e.changedTouches[0].clientY;
          if (delta > 50) goNext();
          if (delta < -50) goPrev();
          touchStartY.current = null;
        }}
        className="relative w-full max-w-[420px] aspect-[9/16] max-h-[78vh] rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl"
      >
        <video
          ref={videoRef}
          key={currentVideo.id}
          src={currentVideo.mediaUrl}
          poster={currentVideo.thumbnailUrl || undefined}
          playsInline
          loop
          autoPlay
          muted={muted}
          preload="auto"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="w-full h-full object-cover cursor-pointer"
        />

        {/* Top Sound & Play Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause video' : 'Play video'}
            className="pointer-events-auto min-w-[44px] min-h-[44px] rounded-full bg-black/55 backdrop-blur-md text-[#F8F9FA] flex items-center justify-center"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="pointer-events-auto min-w-[44px] min-h-[44px] rounded-full bg-black/55 backdrop-blur-md text-[#F8F9FA] flex items-center justify-center"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Contrast Scrim & Overlay Metadata */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5 pt-16 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenProfile(currentVideo.authorId)}
              className="flex items-center gap-2.5 text-left group"
            >
              <Avatar
                src={currentVideo.authorAvatarUrl}
                name={currentVideo.authorName}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F8F9FA] group-hover:text-[#D4AF37] truncate">
                  {currentVideo.authorName}
                </p>
                <p className="text-xs text-[#A1A1AA] truncate">
                  @{currentVideo.authorUsername} · {formatRelativeTime(currentVideo.createdAt)}
                </p>
              </div>
            </button>

            {currentVideo.caption && (
              <p className="mt-3 text-xs sm:text-sm text-[#F8F9FA]/95 line-clamp-3 leading-relaxed">
                {currentVideo.caption}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleLike}
              className="flex flex-col items-center gap-1 min-w-[44px]"
              aria-label="Like moment"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md ${
                  likedIds.has(currentVideo.id)
                    ? 'bg-[#D4AF37] text-[#0A0A0C]'
                    : 'bg-black/55 text-[#F8F9FA]'
                }`}
              >
                <Heart
                  className={`w-5 h-5 ${likedIds.has(currentVideo.id) ? 'fill-current' : ''}`}
                />
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#F8F9FA]">
                {formatCount(currentVideo.likesCount)}
              </span>
            </button>

            <button
              type="button"
              onClick={openCommentsDrawer}
              className="flex flex-col items-center gap-1 min-w-[44px]"
              aria-label="Open comments"
            >
              <div className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md text-[#F8F9FA] flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#F8F9FA]">
                {formatCount(currentVideo.commentsCount)}
              </span>
            </button>
          </div>
        </div>

        {/* Comments Bottom Sheet Inside Player */}
        {commentsOpen && (
          <div className="absolute inset-x-0 bottom-0 top-1/3 bg-[#151519]/95 backdrop-blur-xl border-t border-white/15 rounded-t-3xl p-4 flex flex-col z-20">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <p className="text-sm font-display font-semibold text-[#F8F9FA]">
                Comments ({currentVideo.commentsCount})
              </p>
              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
                aria-label="Close comments"
                className="p-1 text-[#A1A1AA] hover:text-[#F8F9FA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-[#71717A] text-center py-6">
                  Be the first to comment on this Moment.
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5">
                    <Avatar src={c.authorAvatarUrl} name={c.authorName} size="xs" />
                    <div>
                      <p className="text-xs text-[#F8F9FA]">
                        <span className="font-semibold mr-1.5">@{c.authorUsername}</span>
                        {c.text}
                      </p>
                      <span className="text-[11px] text-[#71717A]">
                        {formatRelativeTime(c.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSendComment} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 rounded-xl bg-[#0A0A0C] border border-white/10 px-3 py-2 text-xs text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                className="gold-gradient-btn p-2 rounded-xl disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
