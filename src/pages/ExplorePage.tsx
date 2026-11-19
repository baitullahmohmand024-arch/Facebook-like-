import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, Heart, MessageCircle, Search, TrendingUp, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Post, UserProfile } from '../types';
import {
  deletePost,
  fetchPostsByHashtag,
  fetchPostsPage,
  getUserLikedPostIds,
  getUserSavedPostIds,
  toggleLikePost,
  toggleSavePost,
} from '../services/postService';
import { fetchDiscoverMembers } from '../services/userService';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { MemberCardSkeleton } from '../components/Skeletons';
import { formatCount } from '../utils/formatters';

interface ExplorePageProps {
  initialHashtag?: string;
  onOpenProfile: (userId: string) => void;
  onRequireAuth: () => void;
  onOpenTrends?: () => void;
}

type ExploreFilter = 'all' | 'photos' | 'videos' | 'members';

export function ExplorePage({
  initialHashtag = '',
  onOpenProfile,
  onRequireAuth,
  onOpenTrends,
}: ExplorePageProps) {
  const { profile, privateSettings, isAdmin, platformSettings } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState(initialHashtag ? `#${initialHashtag}` : '');
  const [filter, setFilter] = useState<ExploreFilter>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const blockedSet = useMemo(
    () => new Set(privateSettings?.blockedUserIds || []),
    [privateSettings]
  );

  useEffect(() => {
    if (initialHashtag) {
      setSearchQuery(`#${initialHashtag}`);
    }
  }, [initialHashtag]);

  const loadExplore = useCallback(async () => {
    setLoading(true);
    try {
      const cleanTag = searchQuery.trim().startsWith('#')
        ? searchQuery.trim().slice(1).toLowerCase()
        : '';

      const [postRes, memberList] = await Promise.all([
        cleanTag ? fetchPostsByHashtag(cleanTag).then((p) => ({ posts: p })) : fetchPostsPage(null, 36),
        fetchDiscoverMembers(36),
      ]);

      setPosts(postRes.posts);
      setMembers(memberList);

      if (profile) {
        const [likes, saves] = await Promise.all([
          getUserLikedPostIds(profile.uid),
          getUserSavedPostIds(profile.uid),
        ]);
        setLikedIds(likes);
        setSavedIds(saves);
      }
    } catch {
      showToast({ type: 'error', title: 'Could not load Explore' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, profile, showToast]);

  useEffect(() => {
    loadExplore();
  }, [loadExplore]);

  const normalizedTerm = searchQuery.trim().toLowerCase().replace(/^[@#]/, '');

  const filteredPosts = useMemo(() => {
    return posts
      .filter((p) => !blockedSet.has(p.authorId))
      .filter((p) => {
        if (filter === 'photos') return p.mediaType === 'image';
        if (filter === 'videos') return p.mediaType === 'video';
        return true;
      })
      .filter((p) => {
        if (!normalizedTerm) return true;
        return (
          p.caption.toLowerCase().includes(normalizedTerm) ||
          p.authorUsername.toLowerCase().includes(normalizedTerm) ||
          p.authorName.toLowerCase().includes(normalizedTerm) ||
          p.hashtags.some((t) => t.includes(normalizedTerm))
        );
      })
      .sort((a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount));
  }, [posts, blockedSet, filter, normalizedTerm]);

  const filteredMembers = useMemo(() => {
    return members
      .filter((m) => !blockedSet.has(m.uid))
      .filter((m) => {
        if (!normalizedTerm) return true;
        return (
          m.usernameLower.includes(normalizedTerm) ||
          m.fullName.toLowerCase().includes(normalizedTerm) ||
          m.hostel.toLowerCase().includes(normalizedTerm)
        );
      });
  }, [members, blockedSet, normalizedTerm]);

  const handleToggleLike = async (post: Post) => {
    if (!profile) {
      onRequireAuth();
      return;
    }
    const currentlyLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    const delta = currentlyLiked ? -1 : 1;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, likesCount: Math.max(0, p.likesCount + delta) } : p
      )
    );
    setSelectedPost((prev) =>
      prev && prev.id === post.id
        ? { ...prev, likesCount: Math.max(0, prev.likesCount + delta) }
        : prev
    );
    try {
      await toggleLikePost(post, profile, currentlyLiked);
    } catch {
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
    } catch {
      showToast({ type: 'error', title: 'Could not update bookmark' });
    }
  };

  const handleDeletePost = async (post: Post) => {
    try {
      await deletePost(post, profile?.uid === post.authorId);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setSelectedPost(null);
      showToast({ type: 'success', title: 'Post deleted' });
    } catch {
      showToast({ type: 'error', title: 'Could not delete post' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Explore HOSTELVERSE
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Discover trending photographs, reels, hashtags, and fellow hostel members
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search @username, #hashtag, or hostel..."
              className="w-full rounded-xl bg-[#151519] border border-white/10 pl-10 pr-9 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#F8F9FA] p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onOpenTrends && (
            <button
              type="button"
              onClick={onOpenTrends}
              className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-[#D4AF37]/35 bg-[#151519] text-[#D4AF37] hover:border-[#D4AF37] hover:bg-white/[0.04] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Trends</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Segmented Bar + Quick Hashtags */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08] self-start">
          {(
            [
              { id: 'all', label: 'Trending' },
              { id: 'photos', label: 'Photographs' },
              { id: 'videos', label: 'Videos' },
              { id: 'members', label: 'Members' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filter === item.id
                  ? 'bg-[#D4AF37] text-[#0A0A0C]'
                  : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[#D4AF37]">
          {platformSettings.featuredHashtags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setFilter('all');
                setSearchQuery(`#${tag}`);
              }}
              className="hover:text-[#E7C96F] hover:underline"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <MemberCardSkeleton key={i} />
          ))}
        </div>
      ) : filter === 'members' ? (
        filteredMembers.length === 0 ? (
          <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
            <Users className="w-8 h-8 text-[#D4AF37] mx-auto" />
            <p className="mt-3 font-display text-base font-semibold text-[#F8F9FA]">
              No matching members found
            </p>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Try searching a different name, username, or hostel block.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((member) => (
              <button
                key={member.uid}
                type="button"
                onClick={() => onOpenProfile(member.uid)}
                className="text-left bg-[#151519] border border-white/[0.08] hover:border-[#D4AF37]/40 rounded-2xl p-5 flex items-center gap-4 transition-colors"
              >
                <Avatar src={member.avatarUrl} name={member.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display font-semibold text-[#F8F9FA] truncate">
                    {member.fullName}
                  </p>
                  <p className="text-xs text-[#A1A1AA] truncate">
                    @{member.username}
                    {member.hostel ? ` · ${member.hostel}` : ''}
                  </p>
                  <p className="mt-1.5 text-[11px] font-mono tabular-nums text-[#71717A]">
                    {formatCount(member.followersCount)} followers · {member.postsCount} posts
                  </p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {/* Matching Members Strip when searching */}
          {normalizedTerm && filteredMembers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#A1A1AA]">Matching Members</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredMembers.slice(0, 6).map((member) => (
                  <button
                    key={member.uid}
                    type="button"
                    onClick={() => onOpenProfile(member.uid)}
                    className="text-left bg-[#151519] border border-white/[0.08] hover:border-[#D4AF37]/40 rounded-xl p-3.5 flex items-center gap-3 transition-colors"
                  >
                    <Avatar src={member.avatarUrl} name={member.fullName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F8F9FA] truncate">
                        {member.fullName}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">@{member.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Responsive Masonry Grid */}
          {filteredPosts.length === 0 ? (
            <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-12 text-center">
              <p className="font-display text-lg font-semibold text-[#F8F9FA]">
                No stories match your filter yet
              </p>
              <p className="mt-2 text-xs text-[#A1A1AA]">
                Clear your search or publish new photographs and videos to populate Explore.
              </p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
              {filteredPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPost(post)}
                  className="break-inside-avoid w-full text-left group relative rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#D4AF37]/40 bg-[#151519] transition-colors block"
                >
                  <div className="relative bg-[#0A0A0C]">
                    {post.mediaType === 'text' ? (
                      <div className="p-5 space-y-4 bg-[#151519]">
                        <p className="text-sm text-[#F8F9FA] leading-relaxed line-clamp-6 whitespace-pre-wrap break-words">
                          {post.caption}
                        </p>
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA] pt-2 border-t border-white/[0.06]">
                          <span className="font-medium truncate">@{post.authorUsername}</span>
                          <span className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5 text-[#D4AF37]" />
                              {formatCount(post.likesCount)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {formatCount(post.commentsCount)}
                            </span>
                          </span>
                        </div>
                      </div>
                    ) : post.mediaType === 'video' ? (
                      <>
                        {post.thumbnailUrl ? (
                          <img
                            src={post.thumbnailUrl}
                            alt={post.caption || 'Explore video moment'}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          <video
                            src={post.mediaUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-auto object-cover"
                          />
                        )}
                        <div className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/70 text-[#D4AF37]">
                          <Film className="w-3.5 h-3.5" />
                        </div>
                      </>
                    ) : (
                      <img
                        src={post.mediaUrl}
                        alt={post.caption || 'Explore post'}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    )}
                    {post.mediaType !== 'text' && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-4">
                        <div className="w-full flex items-center justify-between text-xs text-[#F8F9FA]">
                          <span className="font-medium truncate">@{post.authorUsername}</span>
                          <span className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5 text-[#D4AF37]" />
                              {formatCount(post.likesCount)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {formatCount(post.commentsCount)}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Post Lightbox Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl relative my-8">
            <button
              type="button"
              onClick={() => setSelectedPost(null)}
              aria-label="Close post view"
              className="mb-3 ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151519] border border-white/10 text-xs text-[#F8F9FA] hover:border-[#D4AF37]/40"
            >
              <X className="w-4 h-4" /> Close
            </button>
            <PostCard
              post={selectedPost}
              currentUser={profile}
              isAdmin={isAdmin}
              isLiked={likedIds.has(selectedPost.id)}
              isSaved={savedIds.has(selectedPost.id)}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
              onDeletePost={handleDeletePost}
              onOpenProfile={(uid) => {
                setSelectedPost(null);
                onOpenProfile(uid);
              }}
              onSearchHashtag={(tag) => {
                setSelectedPost(null);
                setSearchQuery(`#${tag}`);
              }}
              onRequireAuth={onRequireAuth}
            />
          </div>
        </div>
      )}
    </div>
  );
}
