import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  deletePost,
  fetchPostById,
  getUserLikedPostIds,
  getUserSavedPostIds,
  toggleLikePost,
  toggleSavePost,
} from '../services/postService';
import { Post } from '../types';
import { PostCard } from './PostCard';

interface PostDetailModalProps {
  postId: string | null;
  highlightCommentId?: string;
  openCommentsByDefault?: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onSearchHashtag: (tag: string) => void;
  onRequireAuth: () => void;
}

export function PostDetailModal({
  postId,
  highlightCommentId,
  openCommentsByDefault = true,
  onClose,
  onOpenProfile,
  onSearchHashtag,
  onRequireAuth,
}: PostDetailModalProps) {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!postId) {
      setPost(null);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    Promise.all([
      fetchPostById(postId),
      profile ? getUserLikedPostIds(profile.uid) : Promise.resolve(new Set<string>()),
      profile ? getUserSavedPostIds(profile.uid) : Promise.resolve(new Set<string>()),
    ])
      .then(([loaded, likes, saves]) => {
        if (cancelled) return;
        if (!loaded) {
          setPost(null);
          setNotFound(true);
        } else {
          setPost(loaded);
          setIsLiked(likes.has(loaded.id));
          setIsSaved(saves.has(loaded.id));
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId, profile]);

  if (!postId) return null;

  const handleToggleLike = async (target: Post) => {
    if (!profile) {
      onRequireAuth();
      return;
    }
    const prevLiked = isLiked;
    setIsLiked(!prevLiked);
    setPost((p) =>
      p ? { ...p, likesCount: Math.max(0, p.likesCount + (prevLiked ? -1 : 1)) } : p
    );
    try {
      await toggleLikePost(target, profile, prevLiked);
    } catch {
      setIsLiked(prevLiked);
      setPost((p) =>
        p ? { ...p, likesCount: Math.max(0, p.likesCount + (prevLiked ? 1 : -1)) } : p
      );
      showToast({ type: 'error', title: 'Could not update like' });
    }
  };

  const handleToggleSave = async (target: Post) => {
    if (!profile) {
      onRequireAuth();
      return;
    }
    const prevSaved = isSaved;
    setIsSaved(!prevSaved);
    try {
      await toggleSavePost(target.id, profile.uid, prevSaved);
    } catch {
      setIsSaved(prevSaved);
      showToast({ type: 'error', title: 'Could not update bookmark' });
    }
  };

  const handleDeletePost = async (target: Post) => {
    try {
      await deletePost(target, profile?.uid === target.authorId);
      showToast({ type: 'success', title: 'Post deleted' });
      onClose();
    } catch {
      showToast({ type: 'error', title: 'Could not delete post' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Post details"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl my-4 sm:my-8 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#F5C542]">
            Post Activity
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close post"
            className="w-9 h-9 rounded-full bg-[#111114] border border-[#F5C542]/30 text-[#FFFFFF] hover:text-[#F5C542] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-[#F5C542] animate-spin" />
            <p className="text-xs text-[#A5A5AD]">Loading post...</p>
          </div>
        ) : notFound || !post ? (
          <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-10 text-center">
            <p className="font-display text-base font-semibold text-[#FFFFFF]">
              Post unavailable
            </p>
            <p className="mt-1 text-xs text-[#A5A5AD]">
              This post may have been removed by its author or moderation.
            </p>
          </div>
        ) : (
          <PostCard
            variant="feed"
            post={post}
            currentUser={profile}
            isAdmin={isAdmin}
            isLiked={isLiked}
            isSaved={isSaved}
            initialCommentsOpen={openCommentsByDefault}
            highlightCommentId={highlightCommentId}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onDeletePost={handleDeletePost}
            onOpenProfile={(uid) => {
              onClose();
              onOpenProfile(uid);
            }}
            onSearchHashtag={(tag) => {
              onClose();
              onSearchHashtag(tag);
            }}
            onRequireAuth={() => {
              onClose();
              onRequireAuth();
            }}
          />
        )}
      </div>
    </div>
  );
}
