import { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { ArrowRight, Image as ImageIcon, Plus, PlusSquare, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FeedTab, Post, StoryItem, UserProfile } from '../types';
import {
  deletePost,
  fetchPostsPage,
  getUserLikedPostIds,
  getUserSavedPostIds,
  toggleLikePost,
  toggleSavePost,
} from '../services/postService';
import { fetchActiveStories } from '../services/storyService';
import { fetchDiscoverMembers, getFollowingIds } from '../services/userService';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/Skeletons';
import { Avatar } from '../components/Avatar';
import { AddStoryModal, StoryViewerModal } from '../components/StoryModals';
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
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [addStoryOpen, setAddStoryOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [bannerImgSrc, setBannerImgSrc] = useState(
    'https://res.cloudinary.com/jnobnl9r/image/upload/v1795087575/images_2_w4lp7z.jpg'
  );
  const [bannerImgFailed, setBannerImgFailed] = useState(false);

  const blockedSet = useMemo(
    () => new Set(privateSettings?.blockedUserIds || []),
    [privateSettings]
  );

  const loadInitialFeed = useCallback(async () => {
    setLoading(true);
    try {
      const pagePromise = fetchPostsPage(null, 12);
      const membersPromise = fetchDiscoverMembers(8);
      const storiesPromise = fetchActiveStories(40).catch(() => [] as StoryItem[]);
      const [page, members, activeStories] = await Promise.all([
        pagePromise,
        membersPromise,
        storiesPromise,
      ]);

      setPosts(page.posts);
      setLastDoc(page.lastDoc);
      setHasMore(page.hasMore);
      setStories(activeStories);
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

  const visibleStories = useMemo(
    () => stories.filter((s) => !blockedSet.has(s.authorId)),
    [stories, blockedSet]
  );

  // Deduplicate latest story per author for the ring bar, keeping full chronological array for viewer
  const storyHighlights = useMemo(() => {
    const seenAuthors = new Set<string>();
    const list: { story: StoryItem; indexInStream: number }[] = [];
    visibleStories.forEach((story, idx) => {
      if (!seenAuthors.has(story.authorId)) {
        seenAuthors.add(story.authorId);
        list.push({ story, indexInStream: idx });
      }
    });
    return list;
  }, [visibleStories]);

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      {/* Main Feed Column */}
      <div className="lg:col-span-8 space-y-5 min-w-0">
        {/* Luxury Campus Welcome Banner */}
        <div className="relative rounded-2xl overflow-hidden border border-[#F5C542]/25 bg-[#111114] shadow-[0_12px_36px_rgba(0,0,0,0.65)]">
          <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
            {!bannerImgFailed ? (
              <img
                src={bannerImgSrc}
                alt="Islamia College Peshawar"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (bannerImgSrc !== '/images/icp-hero-campus.jpg') {
                    setBannerImgSrc('/images/icp-hero-campus.jpg');
                  } else {
                    setBannerImgFailed(true);
                  }
                }}
                className="w-full h-full object-cover object-center brightness-[0.8] contrast-[1.06]"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#19191D] via-[#111114] to-[#050505]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/82 to-[#050505]/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-transparent to-[#050505]/30" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_40%,rgba(245,197,66,0.18),transparent_60%)]" />
          </div>

          <div className="relative z-10 px-4 sm:px-6 py-5 sm:py-6">
            <p className="font-script text-2xl sm:text-3xl text-[#F5C542] leading-none drop-shadow-[0_2px_12px_rgba(245,197,66,0.35)]">
              Welcome to
            </p>
            <h2 className="mt-0.5 font-display font-extrabold tracking-tight text-2xl sm:text-3xl leading-tight">
              <span className="text-[#FFFFFF]">Hostel </span>
              <span className="text-[#F5C542]">Friend</span>
            </h2>
            <svg
              viewBox="0 0 220 12"
              className="mt-1 w-32 sm:w-40 h-2.5 text-[#F5C542]"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 9C62 2 158 2 216 9"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            </svg>
            <p className="mt-2 text-xs sm:text-sm font-semibold tracking-tight">
              <span className="text-[#FFFFFF]">Your Hostel. Your People. </span>
              <span className="text-[#F5C542]">Your Memories.</span>
            </p>
          </div>
        </div>

        {/* Home Feed Title + Segmented Filter Control */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pt-1">
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#FFFFFF]">
              Home Feed
            </h1>
            <p className="text-xs text-[#A5A5AD] mt-0.5 leading-relaxed">
              Every Moment Has a Story · Real-time hostel community stream
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-[#111114] rounded-full border border-[#F5C542]/20 shadow-inner">
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
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-[#F5C542] to-[#D99B19] text-[#050505] shadow-[0_2px_12px_rgba(245,197,66,0.3)]'
                      : 'text-[#A5A5AD] hover:text-[#FFFFFF]'
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
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full border border-[#F5C542]/25 bg-[#111114] text-[#F5C542] hover:border-[#F5C542]/60 hover:bg-[#19191D] transition-colors shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stories Strip + Attractive Add Story Card */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full border-[2.5px] border-[#F5C542] inline-block shrink-0 shadow-[0_0_10px_rgba(245,197,66,0.45)]"
                aria-hidden="true"
              />
              <span className="font-display text-sm font-semibold text-[#FFFFFF]">Stories</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (visibleStories.length > 0) {
                  setViewerIndex(0);
                } else {
                  onNavigateExplore();
                }
              }}
              className="text-xs font-semibold text-[#F5C542] hover:text-[#F8D162] inline-flex items-center gap-1 transition-colors"
            >
              <span>{visibleStories.length > 0 ? 'Watch all' : 'See all'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-start gap-3.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                if (!profile) {
                  onRequireAuth();
                  return;
                }
                setAddStoryOpen(true);
              }}
              className="w-[78px] h-[98px] rounded-2xl bg-gradient-to-b from-[#1A1A20] via-[#131317] to-[#0B0B0E] border border-[#F5C542]/45 hover:border-[#F5C542] flex flex-col items-center justify-center gap-2 shrink-0 shadow-[0_8px_24px_rgba(245,197,66,0.14)] hover:shadow-[0_10px_28px_rgba(245,197,66,0.24)] transition-all active:scale-[0.98] relative overflow-hidden"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(245,197,66,0.2),transparent_70%)] pointer-events-none"
              />
              <span className="relative z-10 w-10 h-10 rounded-full bg-gradient-to-br from-[#F8D162] via-[#F5C542] to-[#D99B19] text-[#050505] flex items-center justify-center shadow-[0_4px_16px_rgba(245,197,66,0.5)]">
                <Plus className="w-5 h-5 stroke-[2.6]" />
              </span>
              <span className="relative z-10 text-[11px] font-semibold text-[#FFFFFF]">
                Add Story
              </span>
            </button>

            {storyHighlights.map(({ story, indexInStream }) => (
              <button
                key={story.id}
                type="button"
                onClick={() => setViewerIndex(indexInStream)}
                className="w-[74px] flex flex-col items-center gap-1.5 shrink-0 group text-center pt-1"
              >
                <div className="p-[2.5px] rounded-full bg-gradient-to-tr from-[#D99B19] via-[#F5C542] to-[#F8D162] shadow-[0_4px_16px_rgba(245,197,66,0.28)] group-hover:scale-105 transition-transform">
                  <div className="w-[58px] h-[58px] rounded-full p-[2px] bg-[#050505] overflow-hidden">
                    {story.mediaType === 'image' ? (
                      <img
                        src={story.mediaUrl}
                        alt={story.authorName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <Avatar
                        src={story.authorAvatarUrl}
                        name={story.authorName}
                        size="md"
                        className="w-full h-full"
                      />
                    )}
                  </div>
                </div>
                <span className="w-full text-[11px] font-medium text-[#FFFFFF]/95 group-hover:text-[#F5C542] truncate transition-colors">
                  {story.authorId === profile?.uid ? 'Your Story' : story.authorName.split(' ')[0]}
                </span>
              </button>
            ))}

            {suggestedMembers
              .filter((m) => !storyHighlights.some((h) => h.story.authorId === m.uid))
              .map((member) => (
                <button
                  key={member.uid}
                  type="button"
                  onClick={() => onOpenProfile(member.uid)}
                  className="w-[72px] flex flex-col items-center gap-1.5 shrink-0 group text-center pt-1"
                >
                  <div className="p-[2px] rounded-full bg-gradient-to-tr from-[#D99B19]/75 via-[#F5C542]/80 to-[#F8D162]/75 shadow-[0_4px_14px_rgba(245,197,66,0.16)] group-hover:scale-105 transition-transform">
                    <div className="rounded-full p-[2px] bg-[#050505]">
                      <Avatar src={member.avatarUrl} name={member.fullName} size="md" />
                    </div>
                  </div>
                  <span className="w-full text-[11px] text-[#FFFFFF]/85 group-hover:text-[#F5C542] truncate transition-colors">
                    {member.fullName.split(' ')[0]}
                  </span>
                </button>
              ))}
          </div>
        </div>

        {/* Quick Post Composer Bar */}
        <button
          type="button"
          onClick={onNavigateCreate}
          className="w-full bg-[#111114] hover:bg-[#19191D] border border-[#F5C542]/30 hover:border-[#F5C542]/55 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all text-left group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              src={profile?.avatarUrl}
              name={profile?.fullName || 'Hostel Friend'}
              size="sm"
            />
            <span className="text-sm text-[#A5A5AD] group-hover:text-[#FFFFFF] truncate transition-colors">
              What&apos;s on your mind?
            </span>
          </div>
          <span className="w-9 h-9 rounded-xl bg-[#19191D] border border-[#F5C542]/25 flex items-center justify-center text-[#F5C542] shrink-0">
            <ImageIcon className="w-4 h-4" />
          </span>
        </button>

        {loading ? (
          <div className="space-y-5">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        ) : displayedPosts.length === 0 ? (
          <div className="bg-[#111114] border border-[#F5C542]/25 rounded-2xl p-8 sm:p-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <Users className="w-8 h-8 text-[#F5C542] mx-auto" />
            <h2 className="mt-4 font-display text-lg font-semibold text-[#FFFFFF]">
              {activeTab === 'following'
                ? 'Your Following stream is quiet'
                : 'No stories published yet'}
            </h2>
            <p className="mt-2 text-sm text-[#A5A5AD] max-w-md mx-auto">
              {activeTab === 'following'
                ? 'Follow fellow hostel members in Explore to see their photographs and videos here.'
                : 'Share the very first photograph or moment from your hostel corridor.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onNavigateCreate}
                className="gold-gradient-btn px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 shadow-[0_4px_16px_rgba(245,197,66,0.28)]"
              >
                <PlusSquare className="w-4 h-4" />
                <span>Create Post</span>
              </button>
              <button
                type="button"
                onClick={onNavigateExplore}
                className="px-5 py-2.5 rounded-full text-sm font-medium border border-[#F5C542]/30 bg-[#19191D] text-[#FFFFFF] hover:border-[#F5C542]"
              >
                Explore Members
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {displayedPosts.map((post) => (
              <PostCard
                key={post.id}
                variant="feed"
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
                  className="px-6 py-2.5 rounded-full border border-[#F5C542]/30 bg-[#111114] text-sm font-semibold text-[#F5C542] hover:bg-[#19191D] hover:border-[#F5C542]/60 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading more stories...' : 'Load More Stories'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Right Rail */}
      <aside className="hidden lg:block lg:col-span-4 space-y-5 sticky top-6">
        {profile && (
          <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-5 shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-3.5">
              <div className="p-[1.5px] rounded-full bg-gradient-to-tr from-[#D99B19] via-[#F5C542] to-[#F8D162] shrink-0">
                <Avatar src={profile.avatarUrl} name={profile.fullName} size="md" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-display font-semibold text-[#FFFFFF] truncate">
                  {profile.fullName}
                </p>
                <p className="text-xs text-[#A5A5AD] truncate">@{profile.username}</p>
              </div>
            </div>
            {profile.hostel && (
              <p className="mt-3 text-xs text-[#A5A5AD]">{profile.hostel}</p>
            )}
            <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-3 text-center">
              <div>
                <p className="font-mono text-sm font-semibold text-[#FFFFFF] tabular-nums">
                  {profile.postsCount}
                </p>
                <p className="text-[11px] text-[#A5A5AD]">Posts</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-[#FFFFFF] tabular-nums">
                  {profile.followersCount}
                </p>
                <p className="text-[11px] text-[#A5A5AD]">Followers</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-[#FFFFFF] tabular-nums">
                  {profile.followingCount}
                </p>
                <p className="text-[11px] text-[#A5A5AD]">Following</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-5 shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold text-[#FFFFFF]">
              Discover Members
            </h2>
            <button
              type="button"
              onClick={onNavigateExplore}
              className="text-xs font-medium text-[#F5C542] hover:text-[#F8D162]"
            >
              See all
            </button>
          </div>
          {suggestedMembers.length === 0 ? (
            <p className="text-xs text-[#A5A5AD]">New members will appear here as they join.</p>
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
                      <p className="text-xs font-semibold text-[#FFFFFF] group-hover:text-[#F5C542] transition-colors truncate">
                        {member.fullName}
                      </p>
                      <p className="text-[11px] text-[#A5A5AD] truncate">
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

        <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-5 shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
          <h2 className="font-display text-sm font-semibold text-[#FFFFFF] mb-3">
            Trending Tags
          </h2>
          <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-xs text-[#F5C542]">
            {platformSettings.featuredHashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSearchHashtag(tag)}
                className="hover:text-[#F8D162] hover:underline"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {profile && (
        <AddStoryModal
          open={addStoryOpen}
          profile={profile}
          maxUploadSizeMB={platformSettings.maxUploadSizeMB}
          onClose={() => setAddStoryOpen(false)}
          onStoryCreated={(newStory) => {
            setStories((prev) => [newStory, ...prev]);
          }}
        />
      )}

      {viewerIndex !== null && visibleStories.length > 0 && (
        <StoryViewerModal
          stories={visibleStories}
          initialIndex={viewerIndex}
          currentUserId={profile?.uid}
          isAdmin={isAdmin}
          onClose={() => setViewerIndex(null)}
          onOpenProfile={onOpenProfile}
          onStoryDeleted={(storyId) => {
            setStories((prev) => prev.filter((s) => s.id !== storyId));
          }}
        />
      )}
    </div>
  );
}
