import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  CornerDownRight,
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
  X,
} from 'lucide-react';
import { CommentItem, Post, UserProfile } from '../types';
import { formatCount, formatRelativeTime } from '../utils/formatters';
import { addComment, deleteComment, fetchComments } from '../services/postService';
import { useToast } from '../context/ToastContext';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { ReportModal } from './ReportModal';
import { SharePostModal } from './SharePostModal';
import { formatUserFriendlyError } from '../lib/firestoreError';
import { playSound } from '../utils/soundVfx';

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
  variant?: 'default' | 'feed';
  initialCommentsOpen?: boolean;
  highlightCommentId?: string;
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
  variant = 'default',
  initialCommentsOpen = false,
  highlightCommentId,
}: PostCardProps) {
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{
    parentCommentId: string;
    replyToUserId: string;
    replyToUsername: string;
  } | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [localCommentsCount, setLocalCommentsCount] = useState(post.commentsCount);
  const [mediaError, setMediaError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (initialCommentsOpen) {
      setCommentsOpen(true);
      void loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCommentsOpen, post.id]);

  const handleToggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) {
      void loadComments();
    } else {
      setReplyingTo(null);
    }
  };

  const handleStartReply = (comment: CommentItem) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    setReplyingTo({
      parentCommentId: comment.parentCommentId || comment.id,
      replyToUserId: comment.authorId,
      replyToUsername: comment.authorUsername,
    });
    setTimeout(() => commentInputRef.current?.focus(), 40);
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
      const created = await addComment(post, currentUser, commentText, replyingTo || undefined);
      setComments((prev) => [...prev, created]);
      setLocalCommentsCount((c) => c + 1);
      setCommentText('');
      setReplyingTo(null);
      playSound('comment');
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Failed to post comment',
        description: formatUserFriendlyError(err),
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

  const handleShare = () => {
    playSound('ui-tap');
    setShareOpen(true);
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

  if (variant === 'feed') {
    return (
      <article className="bg-[#111114] border border-[#F5C542]/25 hover:border-[#F5C542]/45 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.55)] transition-all duration-200">
        {/* Post Author Header */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            className="flex items-center gap-3 text-left group min-w-0"
          >
            <div className="rounded-full p-[1.5px] bg-gradient-to-tr from-[#D99B19]/70 via-[#F5C542]/80 to-[#F8D162]/60 shrink-0">
              <Avatar src={post.authorAvatarUrl} name={post.authorName} size="md" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-display font-semibold text-[#FFFFFF] group-hover:text-[#F5C542] transition-colors truncate">
                {post.authorName}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-[#A5A5AD] truncate">
                <span className="truncate">@{post.authorUsername}</span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{formatRelativeTime(post.createdAt)}</span>
              </div>
            </div>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Post options"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#A5A5AD] hover:text-[#F5C542] hover:bg-[#19191D] transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[#19191D] rounded-xl py-1.5 shadow-2xl border border-[#F5C542]/25 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleShare();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#FFFFFF] hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#F5C542]" />
                  Share Post
                </button>

                {currentUser && currentUser.uid !== post.authorId && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#FFFFFF] hover:bg-white/[0.06] flex items-center gap-2.5"
                  >
                    <Flag className="w-3.5 h-3.5 text-[#F5C542]" />
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

        {/* Caption & Hashtags Above Media */}
        {(post.caption || post.hashtags.length > 0) && (
          <div className="px-4 sm:px-5 pb-3 space-y-2">
            {post.caption && (
              <p
                className={`${
                  post.mediaType === 'text' ? 'text-[16px] sm:text-[17px]' : 'text-[15px]'
                } text-[#FFFFFF]/95 leading-relaxed whitespace-pre-wrap break-words`}
              >
                {post.caption}
              </p>
            )}
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-[13px] font-medium text-[#F5C542]">
                {post.hashtags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onSearchHashtag(tag)}
                    className="hover:text-[#F8D162] hover:underline transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attached Image or Video */}
        {post.mediaType !== 'text' && (
          <div className="px-4 sm:px-5 pb-3">
            <div className="relative rounded-xl overflow-hidden bg-[#050505] border border-white/[0.08]">
              {mediaError ? (
                <div className={`${aspectClass} w-full flex flex-col items-center justify-center gap-2 text-[#A5A5AD] px-6 text-center`}>
                  <ImageOff className="w-8 h-8 opacity-60 text-[#F5C542]" />
                  <p className="text-xs">Media unavailable</p>
                </div>
              ) : post.mediaType === 'video' ? (
                <div className={`relative ${aspectClass} w-full bg-black flex items-center justify-center`}>
                  <video
                    src={post.mediaUrl}
                    poster={post.thumbnailUrl || undefined}
                    controls
                    playsInline
                    muted={muted}
                    preload={post.thumbnailUrl ? 'none' : 'metadata'}
                    onError={() => setMediaError(true)}
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Unmute video' : 'Mute video'}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/65 backdrop-blur-md text-[#F5C542] border border-[#F5C542]/30 hover:bg-black/85 transition-colors"
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
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setMediaError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reaction Summary + Golden Actions Bar */}
        <div className="px-4 sm:px-5 pb-3">
          <div className="pb-2.5 border-b border-white/[0.08] flex items-center justify-between text-xs text-[#A5A5AD]">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Heart className="w-3.5 h-3.5 fill-[#F5C542] text-[#F5C542]" />
              <span className="text-[#FFFFFF] font-medium">{formatCount(post.likesCount)}</span>
              <span>{post.likesCount === 1 ? 'like' : 'likes'}</span>
            </span>
            <button
              type="button"
              onClick={handleToggleComments}
              className="hover:text-[#F5C542] transition-colors tabular-nums"
            >
              {formatCount(localCommentsCount)} {localCommentsCount === 1 ? 'comment' : 'comments'}
            </button>
          </div>

          <div className="pt-1.5 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => {
                if (currentUser) {
                  playSound(isLiked ? 'unlike' : 'like');
                  void onToggleLike(post);
                } else {
                  onRequireAuth?.();
                }
              }}
              className={`flex-1 min-h-[42px] px-2 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] whitespace-nowrap ${
                isLiked
                  ? 'text-[#F5C542] bg-[#F5C542]/12'
                  : 'text-[#FFFFFF]/90 hover:text-[#F5C542] hover:bg-[#19191D]'
              }`}
              aria-label={isLiked ? 'Unlike post' : 'Like post'}
            >
              <Heart className={`w-4 h-4 text-[#F5C542] ${isLiked ? 'fill-[#F5C542]' : ''}`} />
              <span>{isLiked ? 'Liked' : 'Like'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleComments}
              className={`flex-1 min-h-[42px] px-2 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] whitespace-nowrap ${
                commentsOpen
                  ? 'text-[#F5C542] bg-[#19191D]'
                  : 'text-[#FFFFFF]/90 hover:text-[#F5C542] hover:bg-[#19191D]'
              }`}
              aria-label="Toggle comments"
            >
              <MessageCircle className="w-4 h-4 text-[#F5C542]" />
              <span>Comment</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="flex-1 min-h-[42px] px-2 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-[#FFFFFF]/90 hover:text-[#F5C542] hover:bg-[#19191D] transition-all active:scale-[0.98] whitespace-nowrap"
              aria-label="Share post"
            >
              <Share2 className="w-4 h-4 text-[#F5C542]" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentUser) {
                  playSound(isSaved ? 'unlike' : 'save');
                  void onToggleSave(post);
                } else {
                  onRequireAuth?.();
                }
              }}
              className={`min-h-[42px] min-w-[42px] px-2.5 rounded-xl flex items-center justify-center transition-all active:scale-[0.98] shrink-0 ${
                isSaved
                  ? 'text-[#F5C542] bg-[#F5C542]/12'
                  : 'text-[#A5A5AD] hover:text-[#F5C542] hover:bg-[#19191D]'
              }`}
              aria-label={isSaved ? 'Remove from saved' : 'Save post'}
            >
              <Bookmark className={`w-4 h-4 text-[#F5C542] ${isSaved ? 'fill-[#F5C542]' : ''}`} />
            </button>
          </div>

          {/* Comments Drawer */}
          {commentsOpen && (
            <div className="mt-3 pt-3.5 border-t border-white/[0.08] space-y-3">
              {commentsLoading ? (
                <p className="text-xs text-[#A5A5AD]">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-[#A5A5AD]">No comments yet. Start the conversation.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {comments.map((comment) => {
                    const canRemoveComment = Boolean(
                      currentUser &&
                        (currentUser.uid === comment.authorId ||
                          currentUser.uid === post.authorId ||
                          isAdmin)
                    );
                    const isHighlighted = highlightCommentId === comment.id;
                    const isReply = Boolean(comment.parentCommentId);
                    return (
                      <div
                        key={comment.id}
                        className={`flex items-start justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors ${
                          isReply ? 'ml-5 border-l-2 border-[#F5C542]/25 pl-3' : ''
                        } ${isHighlighted ? 'bg-[#F5C542]/12 ring-1 ring-[#F5C542]/45' : ''}`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Avatar
                            src={comment.authorAvatarUrl}
                            name={comment.authorName}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-[#FFFFFF] leading-relaxed break-words">
                              <button
                                type="button"
                                onClick={() => onOpenProfile(comment.authorId)}
                                className="font-semibold hover:text-[#F5C542] mr-1.5"
                              >
                                @{comment.authorUsername}
                              </button>
                              {comment.replyToUsername && (
                                <span className="text-[#F5C542]/90 mr-1.5 font-medium">
                                  @{comment.replyToUsername}
                                </span>
                              )}
                              {comment.text}
                            </p>
                            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#A5A5AD]">
                              <span>{formatRelativeTime(comment.createdAt)}</span>
                              {currentUser && (
                                <button
                                  type="button"
                                  onClick={() => handleStartReply(comment)}
                                  className="inline-flex items-center gap-1 hover:text-[#F5C542] font-medium transition-colors"
                                >
                                  <CornerDownRight className="w-3 h-3" />
                                  <span>Reply</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        {canRemoveComment && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment)}
                            aria-label="Delete comment"
                            className="text-[#A5A5AD] hover:text-rose-400 p-1 rounded transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {replyingTo && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#F5C542]/10 border border-[#F5C542]/25 text-xs">
                  <span className="text-[#F5C542] truncate">
                    Replying to <strong>@{replyingTo.replyToUsername}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancel reply"
                    className="text-[#A5A5AD] hover:text-[#FFFFFF]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
                <input
                  ref={commentInputRef}
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  placeholder={
                    replyingTo
                      ? `Reply to @${replyingTo.replyToUsername}...`
                      : currentUser
                      ? 'Add a thoughtful comment or @mention...'
                      : 'Sign in to comment'
                  }
                  className="flex-1 rounded-xl bg-[#050505] border border-white/10 px-3.5 py-2 text-sm text-[#FFFFFF] placeholder:text-[#A5A5AD]/70 focus:outline-none focus:border-[#F5C542]"
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
          description="This action permanently removes the post and its engagement from Hostel Friend."
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

        <SharePostModal
          open={shareOpen}
          post={post}
          onClose={() => setShareOpen(false)}
        />
      </article>
    );
  }

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
                Share Post
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

      {/* Media Frame or Text-Only Editorial Surface */}
      {post.mediaType === 'text' ? (
        <div className="px-5 py-6 bg-[#0A0A0C]/70 border-y border-white/[0.06]">
          <p className="text-[17px] sm:text-[18px] text-[#F8F9FA] leading-relaxed whitespace-pre-wrap break-words font-normal">
            {post.caption}
          </p>
        </div>
      ) : (
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
                poster={post.thumbnailUrl || undefined}
                controls
                playsInline
                muted={muted}
                preload={post.thumbnailUrl ? 'none' : 'metadata'}
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
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setMediaError(true)}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      {/* Actions Bar */}
      <div className="px-5 pt-3.5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (currentUser) {
                  playSound(isLiked ? 'unlike' : 'like');
                  void onToggleLike(post);
                } else {
                  onRequireAuth?.();
                }
              }}
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
            onClick={() => {
              if (currentUser) {
                playSound(isSaved ? 'unlike' : 'save');
                void onToggleSave(post);
              } else {
                onRequireAuth?.();
              }
            }}
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
        {((post.mediaType !== 'text' && post.caption) || post.hashtags.length > 0) && (
          <div className="mt-3 space-y-2">
            {post.mediaType !== 'text' && post.caption && (
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
                  const isHighlighted = highlightCommentId === comment.id;
                  const isReply = Boolean(comment.parentCommentId);
                  return (
                    <div
                      key={comment.id}
                      className={`flex items-start justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors ${
                        isReply ? 'ml-5 border-l-2 border-[#D4AF37]/25 pl-3' : ''
                      } ${isHighlighted ? 'bg-[#D4AF37]/12 ring-1 ring-[#D4AF37]/45' : ''}`}
                    >
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
                            {comment.replyToUsername && (
                              <span className="text-[#D4AF37]/90 mr-1.5 font-medium">
                                @{comment.replyToUsername}
                              </span>
                            )}
                            {comment.text}
                          </p>
                          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#71717A]">
                            <span>{formatRelativeTime(comment.createdAt)}</span>
                            {currentUser && (
                              <button
                                type="button"
                                onClick={() => handleStartReply(comment)}
                                className="inline-flex items-center gap-1 hover:text-[#D4AF37] font-medium transition-colors"
                              >
                                <CornerDownRight className="w-3 h-3" />
                                <span>Reply</span>
                              </button>
                            )}
                          </div>
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

            {replyingTo && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/25 text-xs">
                <span className="text-[#D4AF37] truncate">
                  Replying to <strong>@{replyingTo.replyToUsername}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                  className="text-[#A1A1AA] hover:text-[#F8F9FA]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
              <input
                ref={commentInputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={500}
                placeholder={
                  replyingTo
                    ? `Reply to @${replyingTo.replyToUsername}...`
                    : currentUser
                    ? 'Add a thoughtful comment or @mention...'
                    : 'Sign in to comment'
                }
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
        description="This action permanently removes the post and its engagement from Hostel Friend."
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

      <SharePostModal
        open={shareOpen}
        post={post}
        onClose={() => setShareOpen(false)}
      />
    </article>
  );
}
