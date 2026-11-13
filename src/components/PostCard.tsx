import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Flag,
  Heart,
  ImageOff,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CommentItem, Post, UserProfile } from '../types';
import { formatCount, formatRelativeTime } from '../utils/formatters';
import { addComment, deleteComment, fetchComments } from '../services/postService';
import { useToast } from '../context/ToastContext';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { ReportModal } from './ReportModal';

interface PostCardProps {
  post: Post;
  currentUser: UserProfile | null;
  isAdmin?: boolean;
  isLiked: boolean;
  isSaved: boolean;
  onToggleLike: (post: Post) => Promise<void>;
  onToggleSave: (post: Post) => Promise<void>;
  onDeletePost: (post: Post) => Promise<void>;
  onOpenProfile: (userId: string) => void;
  onSearchHashtag: (tag: string) => void;
  onRequireAuth?: () => void;
}

export function PostCard({
  post,
  currentUser,
  isAdmin = false,
  isLiked,
  isSaved,
  onToggleLike,
  onToggleSave,
  onDeletePost,
  onOpenProfile,
  onSearchHashtag,
  onRequireAuth,
}: PostCardProps) {
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [localCommentsCount, setLocalCommentsCount] = useState(post.commentsCount);
  const [mediaError, setMediaError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalCommentsCount(post.commentsCount);
  }, [post.commentsCount]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const items = await fetchComments(post.id);
      setComments(items);
    } catch {
      showToast({ type: 'error', title: 'Could not load comments' });
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleToggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) {
      loadComments();
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const created = await addComment(post, currentUser, commentText);
      setComments((prev) => [...prev, created]);
      setLocalCommentsCount((c) => c + 1);
      setCommentText('');
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Failed to post comment',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (comment: CommentItem) => {
    try {
      await deleteComment(comment);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      setLocalCommentsCount((c) => Math.max(0, c - 1));
    } catch {
      showToast({ type: 'error', title: 'Could not delete comment' });
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast({
        type: 'success',
        title: 'Link copied',
        description: 'Post link is ready to share.',
      });
    } catch {
      showToast({
        type: 'info',
        title: 'Share link',
        description: shareUrl,
      });
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDeletePost(post);
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = Boolean(currentUser && (currentUser.uid === post.authorId || isAdmin));

  const aspectClass =
    post.aspectRatio === 'square'
      ? 'aspect-square'
      : post.aspectRatio === 'portrait'
      ? 'aspect-[3/4]'
      : post.aspectRatio === 'vertical'
      ? 'aspect-[9/16] max-h-[560px] mx-auto'
      : 'aspect-[4/3]';

  return (
    <article className="bg-[#151519] border border-white/[0.08] hover:border-white/[0.14] rounded-2xl overflow-hidden transition-colors duration-200">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile(post.authorId)}
          className="flex items-center gap-3 text-left group min-w-0"
        >
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#F8F9FA] group-hover:text-[#D4AF37] transition-colors truncate">
              {post.authorName}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA] truncate">
              <span>@{post.authorUsername}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Post options"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.06] transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1.5 w-48 glass-surface rounded-xl py-1.5 shadow-2xl border border-white/10 z-20">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleShare();
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#F8F9FA] hover:bg-white/[0.06] flex items-center gap-2.5"
              >
                <Share2 className="w-3.5 h-3.5 text-[#A1A1AA]" />
                Copy Post Link
              </button>

              {currentUser && currentUser.uid !== post.authorId && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setReportOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#F8F9FA] hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Flag className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Report Post
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDeleteOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10 flex items-center gap-2.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media Frame */}
      <div className="relative bg-[#0A0A0C] border-y border-white/[0.06]">
        {mediaError ? (
          <div className={`${aspectClass} w-full flex flex-col items-center justify-center gap-2 text-[#71717A] px-6 text-center`}>
            <ImageOff className="w-8 h-8 opacity-60" />
            <p className="text-xs">Media unavailable</p>
          </div>
        ) : post.mediaType === 'video' ? (
          <div className={`relative ${aspectClass} w-full bg-black flex items-center justify-center`}>
            <video
              src={post.mediaUrl}
              controls
              playsInline
              muted={muted}
              preload="metadata"
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 backdrop-blur-md text-[#F8F9FA] hover:bg-black/80 transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className={`${aspectClass} w-full overflow-hidden`}>
            <img
              src={post.mediaUrl}
              alt={post.caption || `Post by ${post.authorName}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setMediaError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Actions Bar */}
      <div className="px-5 pt-3.5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (currentUser ? onToggleLike(post) : onRequireAuth?.())}
              className={`min-h-[40px] px-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                isLiked
                  ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                  : 'text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.05]'
              }`}
              aria-label={isLiked ? 'Unlike post' : 'Like post'}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-[#D4AF37] text-[#D4AF37]' : ''}`} />
              <span className="tabular-nums text-xs">{formatCount(post.likesCount)}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleComments}
              className={`min-h-[40px] px-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                commentsOpen
                  ? 'text-[#F8F9FA] bg-white/[0.07]'
                  : 'text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.05]'
              }`}
              aria-label="Toggle comments"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="tabular-nums text-xs">{formatCount(localCommentsCount)}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="min-h-[40px] px-2.5 rounded-xl flex items-center gap-2 text-sm font-medium text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0"
              aria-label="Share post"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => (currentUser ? onToggleSave(post) : onRequireAuth?.())}
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors ${
              isSaved
                ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                : 'text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.05]'
            }`}
            aria-label={isSaved ? 'Remove from saved' : 'Save post'}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[#D4AF37] text-[#D4AF37]' : ''}`} />
          </button>
        </div>

        {/* Caption & Unboxed Hashtags */}
        {(post.caption || post.hashtags.length > 0) && (
          <div className="mt-3 space-y-2">
            {post.caption && (
              <p className="text-[15px] text-[#F8F9FA]/95 leading-relaxed whitespace-pre-wrap break-words">
                <button
                  type="button"
                  onClick={() => onOpenProfile(post.authorId)}
                  className="font-semibold text-[#F8F9FA] hover:text-[#D4AF37] mr-2 transition-colors"
                >
                  {post.authorUsername}
                </button>
                {post.caption}
              </p>
            )}
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#D4AF37]/90">
                {post.hashtags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onSearchHashtag(tag)}
                    className="hover:text-[#E7C96F] hover:underline transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comments Drawer */}
        {commentsOpen && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
            {commentsLoading ? (
              <p className="text-xs text-[#A1A1AA]">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-[#71717A]">No comments yet. Start the conversation.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {comments.map((comment) => {
                  const canRemoveComment = Boolean(
                    currentUser &&
                      (currentUser.uid === comment.authorId ||
                        currentUser.uid === post.authorId ||
                        isAdmin)
                  );
                  return (
                    <div key={comment.id} className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar
                          src={comment.authorAvatarUrl}
                          name={comment.authorName}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="text-xs text-[#F8F9FA] leading-relaxed break-words">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(comment.authorId)}
                              className="font-semibold hover:text-[#D4AF37] mr-1.5"
                            >
                              @{comment.authorUsername}
                            </button>
                            {comment.text}
                          </p>
                          <span className="text-[11px] text-[#71717A]">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                      </div>
                      {canRemoveComment && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment)}
                          aria-label="Delete comment"
                          className="text-[#71717A] hover:text-rose-400 p-1 rounded transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={500}
                placeholder={currentUser ? 'Add a thoughtful comment...' : 'Sign in to comment'}
                className="flex-1 rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                aria-label="Send comment"
                className="min-h-[38px] min-w-[38px] px-3 rounded-xl gold-gradient-btn flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this post?"
        description="This action permanently removes the post and its engagement from HOSTELVERSE."
        confirmLabel="Delete Post"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {currentUser && (
        <ReportModal
          open={reportOpen}
          reporterId={currentUser.uid}
          targetType="post"
          targetId={post.id}
          targetAuthorId={post.authorId}
          targetLabel={`Post by @${post.authorUsername}`}
          onClose={() => setReportOpen(false)}
        />
      )}
    </article>
  );
}
