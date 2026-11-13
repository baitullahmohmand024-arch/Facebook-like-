import { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { PlusSquare, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FeedTab, Post, UserProfile } from '../types';
import {
  deletePost,
  fetchPostsPage,
  getUserLikedPostIds,
  getUserSavedPostIds,
  toggleLikePost,
  toggleSavePost,
} from '../services/postService';
import { fetchDiscoverMembers, getFollowingIds } from '../services/userService';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/Skeletons';
import { Avatar } from '../components/Avatar';
import { formatUserFriendlyError } from '../lib/firestoreError';

interface FeedPageProps {
  onNavigateCreate: () => void;
  onNavigateExplore: () => void;
  onOpenProfile: (userId: string) => void;
  onSearchHashtag: (tag: string) => void;
  onRequireAuth: () => void;
}

export function FeedPage({
  onNavigateCreate,
  onNavigateExplore,
  onOpenProfile,
  onSearchHashtag,
  onRequireAuth,
}: FeedPageProps) {
  const { profile, privateSettings, isAdmin, platformSettings } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const [posts, setPosts] = useState<Post[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [suggestedMembers, setSuggestedMembers] = useState<UserProfile[]>([]);

  const blockedSet = useMemo(
    () => new Set(privateSettings?.blockedUserIds || []),
    [privateSettings]
  );

  const loadInitialFeed = useCallback(async () => {
    setLoading(true);
    try {
      const pagePromise = fetchPostsPage(null, 12);
      const membersPromise = fetchDiscoverMembers(8);
      const [page, members] = await Promise.all([pagePromise, membersPromise]);

      setPosts(page.posts);
      setLastDoc(page.lastDoc);
      setHasMore(page.hasMore);
      setSuggestedMembers(
        members.filter((m) => m.uid !== profile?.uid && !blockedSet.has(m.uid)).slice(0, 5)
      );

      if (profile) {
        const [likes, saves, following] = await Promise.all([
          getUserLikedPostIds(profile.uid),
          getUserSavedPostIds(profile.uid),
          getFollowingIds(profile.uid),
        ]);
        setLikedIds(likes);
        setSavedIds(saves);
        setFollowingIds(new Set(following));
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not load feed',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setLoading(false);
    }
  }, [profile, blockedSet, showToast]);

  useEffect(() => {
    loadInitialFeed();
  }, [loadInitialFeed]);

  const handleLoadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPostsPage(lastDoc, 12);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.posts.filter((p) => !seen.has(p.id))];
      });
      setLastDoc(next.lastDoc);
      setHasMore(next.hasMore);
    } catch {
      showToast({ type: 'error', title: 'Failed to load more stories' });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!profile) {
      onRequireAuth();
      return;
    }
    const currentlyLiked = likedIds.has(post.id);
    // Optimistic update
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likesCount: Math.max(0, p.likesCount + (currentlyLiked ? -1 : 1)) }
          : p
      )
    );

    try {
      await toggleLikePost(post, profile, currentlyLiked);
    } catch {
      // Rollback
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (currentlyLiked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likesCount: post.likesCount } : p))
      );
      showToast({ type: 'error', title: 'Could not update like' });
    }
  };

  const handleToggleSave = async (post: Post) => {
    if (!profile) {
      onRequireAuth();
      return;
    }
    const currentlySaved = savedIds.has(post.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (currentlySaved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    try {
      await toggleSavePost(post.id, profile.uid, currentlySaved);
      showToast({
        type: 'success',
        title: currentlySaved ? 'Removed from saved' : 'Saved to your collection',
      });
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (currentlySaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      showToast({ type: 'error', title: 'Could not update saved state' });
    }
  };

  const handleDeletePost = async (post: Post) => {
    try {
      await deletePost(post, profile?.uid === post.authorId);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      showToast({ type: 'success', title: 'Post deleted' });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Unable to delete post',
        description: formatUserFriendlyError(err),
      });
    }
  };

  const displayedPosts = useMemo(() => {
    const visible = posts.filter((p) => !blockedSet.has(p.authorId));
    if (activeTab === 'following') {
      return visible.filter(
        (p) => followingIds.has(p.authorId) || p.authorId === profile?.uid
      );
    }
    if (activeTab === 'for-you') {
      return [...visible].sort((a, b) => {
        const scoreA = a.likesCount * 2 + a.commentsCount * 3;
        const scoreB = b.likesCount * 2 + b.commentsCount * 3;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
      });
    }
    return visible;
  }, [posts, blockedSet, activeTab, followingIds, profile]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Main Feed Column */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
              Home Feed
            </h1>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              Every Moment Has a Story · Real-time hostel community stream
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08]">
              {(
                [
                  { id: 'for-you', label: 'For You' },
                  { id: 'following', label: 'Following' },
                  { id: 'latest', label: 'Latest' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[#D4AF37] text-[#0A0A0C]'
                      : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadInitialFeed}
              aria-label="Refresh feed"
              className="p-2 rounded-xl border border-white/[0.08] bg-[#151519] text-[#A1A1AA] hover:text-[#F8F9FA] transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        ) : displayedPosts.length === 0 ? (
          <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
            <Users className="w-8 h-8 text-[#D4AF37] mx-auto" />
            <h2 className="mt-4 font-display text-lg font-semibold text-[#F8F9FA]">
              {activeTab === 'following'
                ? 'Your Following stream is quiet'
                : 'No stories published yet'}
            </h2>
            <p className="mt-2 text-sm text-[#A1A1AA] max-w-md mx-auto">
              {activeTab === 'following'
                ? 'Follow fellow hostel members in Explore to see their photographs and videos here.'
                : 'Share the very first photograph or moment from your hostel corridor.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onNavigateCreate}
                className="gold-gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
              >
                <PlusSquare className="w-4 h-4" />
                <span>Create Post</span>
              </button>
              <button
                type="button"
                onClick={onNavigateExplore}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-[#F8F9FA] hover:bg-white/[0.04]"
              >
                Explore Members
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {displayedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={profile}
                isAdmin={isAdmin}
                isLiked={likedIds.has(post.id)}
                isSaved={savedIds.has(post.id)}
                onToggleLike={handleToggleLike}
                onToggleSave={handleToggleSave}
                onDeletePost={handleDeletePost}
                onOpenProfile={onOpenProfile}
                onSearchHashtag={onSearchHashtag}
                onRequireAuth={onRequireAuth}
              />
            ))}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl border border-white/10 bg-[#151519] text-sm font-medium text-[#F8F9FA] hover:border-[#D4AF37]/40 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading more stories...' : 'Load More Stories'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Right Rail */}
      <aside className="hidden lg:block lg:col-span-4 space-y-6 sticky top-6">
        {profile && (
          <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
            <div className="flex items-center gap-3.5">
              <Avatar src={profile.avatarUrl} name={profile.fullName} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-display font-semibold text-[#F8F9FA] truncate">
                  {profile.fullName}
                </p>
                <p className="text-xs text-[#A1A1AA] truncate">@{profile.username}</p>
              </div>
            </div>
            {profile.hostel && (
              <p className="mt-3 text-xs text-[#A1A1AA]">{profile.hostel}</p>
            )}
            <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-3 text-center">
              <div>
                <p className="font-mono text-sm font-semibold text-[#F8F9FA] tabular-nums">
                  {profile.postsCount}
                </p>
                <p className="text-[11px] text-[#71717A]">Posts</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-[#F8F9FA] tabular-nums">
                  {profile.followersCount}
                </p>
                <p className="text-[11px] text-[#71717A]">Followers</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-[#F8F9FA] tabular-nums">
                  {profile.followingCount}
                </p>
                <p className="text-[11px] text-[#71717A]">Following</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold text-[#F8F9FA]">
              Discover Members
            </h2>
            <button
              type="button"
              onClick={onNavigateExplore}
              className="text-xs text-[#D4AF37] hover:text-[#E7C96F]"
            >
              See all
            </button>
          </div>
          {suggestedMembers.length === 0 ? (
            <p className="text-xs text-[#71717A]">New members will appear here as they join.</p>
          ) : (
            <div className="space-y-3.5">
              {suggestedMembers.map((member) => (
                <button
                  key={member.uid}
                  type="button"
                  onClick={() => onOpenProfile(member.uid)}
                  className="w-full flex items-center justify-between gap-3 text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={member.avatarUrl} name={member.fullName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F8F9FA] group-hover:text-[#D4AF37] transition-colors truncate">
                        {member.fullName}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        @{member.username}
                        {member.hostel ? ` · ${member.hostel}` : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
          <h2 className="font-display text-sm font-semibold text-[#F8F9FA] mb-3">
            Trending Tags
          </h2>
          <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-xs text-[#D4AF37]">
            {platformSettings.featuredHashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSearchHashtag(tag)}
                className="hover:text-[#E7C96F] hover:underline"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
