import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Bookmark,
  Camera,
  Edit3,
  Flag,
  Grid,
  MapPin,
  MessageSquare,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Post, UserProfile } from '../types';
import {
  deletePost,
  fetchPostsByAuthor,
  fetchPostsPage,
  getUserLikedPostIds,
  getUserSavedPostIds,
  toggleLikePost,
  toggleSavePost,
} from '../services/postService';
import {
  followUser,
  getUserProfile,
  isFollowingUser,
  unfollowUser,
  updateUserPrivateSettings,
  updateUserProfile,
} from '../services/userService';
import { uploadMediaFile, validateMediaFile } from '../services/mediaService';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/Skeletons';
import { ReportModal } from '../components/ReportModal';
import { formatCount, sanitizeUsername } from '../utils/formatters';
import { formatUserFriendlyError } from '../lib/firestoreError';

interface ProfilePageProps {
  targetUserId: string;
  onOpenProfile: (userId: string) => void;
  onMessageUser: (targetUser: UserProfile) => void;
  onSearchHashtag: (tag: string) => void;
  onRequireAuth: () => void;
}

const DEFAULT_COVER = '/src/assets/images/default_cover_obsidian_1794541690832.jpg';

export function ProfilePage({
  targetUserId,
  onOpenProfile,
  onMessageUser,
  onSearchHashtag,
  onRequireAuth,
}: ProfilePageProps) {
  const {
    profile: currentUser,
    privateSettings,
    isAdmin,
    platformSettings,
    setProfile: setAuthProfile,
    setPrivateSettings,
  } = useAuth();
  const { showToast } = useToast();

  const isOwnProfile = currentUser?.uid === targetUserId;

  const [member, setMember] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'saved'>('posts');
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Edit Modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editHostel, setEditHostel] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);

  const isBlocked = Boolean(privateSettings?.blockedUserIds.includes(targetUserId));

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedMember, authorPosts] = await Promise.all([
        getUserProfile(targetUserId),
        fetchPostsByAuthor(targetUserId),
      ]);
      setMember(loadedMember);
      setPosts(authorPosts);

      if (currentUser) {
        const [likes, saves, isFol] = await Promise.all([
          getUserLikedPostIds(currentUser.uid),
          getUserSavedPostIds(currentUser.uid),
          currentUser.uid !== targetUserId
            ? isFollowingUser(currentUser.uid, targetUserId)
            : Promise.resolve(false),
        ]);
        setLikedIds(likes);
        setSavedIds(saves);
        setFollowing(isFol);

        if (currentUser.uid === targetUserId && saves.size > 0) {
          const recent = await fetchPostsPage(null, 50);
          setSavedPosts(recent.posts.filter((p) => saves.has(p.id)));
        } else {
          setSavedPosts([]);
        }
      }
    } catch {
      showToast({ type: 'error', title: 'Could not load profile' });
    } finally {
      setLoading(false);
    }
  }, [targetUserId, currentUser, showToast]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const openEditModal = () => {
    if (!member) return;
    setEditFullName(member.fullName);
    setEditUsername(member.username);
    setEditBio(member.bio);
    setEditHostel(member.hostel);
    setEditAvatarUrl(member.avatarUrl);
    setEditCoverUrl(member.coverUrl);
    setEditOpen(true);
  };

  const handleMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    folder: 'avatars' | 'covers'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const validation = validateMediaFile(file, platformSettings.maxUploadSizeMB);
    if (!validation.valid || validation.mediaType !== 'image') {
      showToast({
        type: 'error',
        title: 'Invalid image',
        description: validation.error || 'Please choose an image file.',
      });
      return;
    }
    setUploadingImage(true);
    try {
      const url = await uploadMediaFile(file, folder, currentUser.uid);
      if (folder === 'avatars') setEditAvatarUrl(url);
      else setEditCoverUrl(url);
      showToast({
        type: 'success',
        title: folder === 'avatars' ? 'Avatar ready' : 'Cover image ready',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Upload failed',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !member) return;
    setSavingProfile(true);
    try {
      const updated = await updateUserProfile(currentUser.uid, member.usernameLower, {
        fullName: editFullName,
        username: sanitizeUsername(editUsername),
        bio: editBio,
        hostel: editHostel,
        avatarUrl: editAvatarUrl,
        coverUrl: editCoverUrl,
      });
      setMember(updated);
      setAuthProfile(updated);
      setEditOpen(false);
      showToast({ type: 'success', title: 'Profile updated' });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not update profile',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!member || followBusy) return;
    setFollowBusy(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setMember((prev) =>
      prev
        ? { ...prev, followersCount: Math.max(0, prev.followersCount + (nextFollowing ? 1 : -1)) }
        : prev
    );
    try {
      if (nextFollowing) {
        await followUser(currentUser, member.uid);
      } else {
        await unfollowUser(currentUser.uid, member.uid);
      }
    } catch {
      setFollowing(!nextFollowing);
      setMember((prev) =>
        prev
          ? { ...prev, followersCount: Math.max(0, prev.followersCount + (nextFollowing ? -1 : 1)) }
          : prev
      );
      showToast({ type: 'error', title: 'Could not update follow status' });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!currentUser || !privateSettings) return;
    const currentList = privateSettings.blockedUserIds || [];
    const nextList = isBlocked
      ? currentList.filter((id) => id !== targetUserId)
      : [...currentList, targetUserId];
    try {
      const updated = await updateUserPrivateSettings(currentUser.uid, {
        blockedUserIds: nextList,
      });
      setPrivateSettings(updated);
      showToast({
        type: 'success',
        title: isBlocked ? 'Member unblocked' : 'Member blocked',
      });
    } catch {
      showToast({ type: 'error', title: 'Could not update block list' });
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const liked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (liked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    const delta = liked ? -1 : 1;
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likesCount: Math.max(0, p.likesCount + delta) } : p))
    );
    try {
      await toggleLikePost(post, currentUser, liked);
    } catch {
      showToast({ type: 'error', title: 'Could not update like' });
    }
  };

  const handleToggleSave = async (post: Post) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const saved = savedIds.has(post.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    try {
      await toggleSavePost(post.id, currentUser.uid, saved);
    } catch {
      showToast({ type: 'error', title: 'Could not update bookmark' });
    }
  };

  const handleDeletePost = async (post: Post) => {
    try {
      await deletePost(post, currentUser?.uid === post.authorId);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      showToast({ type: 'success', title: 'Post deleted' });
    } catch {
      showToast({ type: 'error', title: 'Could not delete post' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse" />
        <PostCardSkeleton />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-12 text-center">
        <h1 className="font-display text-xl font-bold text-[#F8F9FA]">Member not found</h1>
        <p className="mt-2 text-sm text-[#A1A1AA]">
          This profile may have been deleted or is unavailable.
        </p>
      </div>
    );
  }

  const displayedPosts = activeTab === 'saved' ? savedPosts : posts;

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <section className="bg-[#151519] border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="h-44 sm:h-56 bg-[#0A0A0C] relative overflow-hidden">
          <img
            src={member.coverUrl || DEFAULT_COVER}
            alt={`${member.fullName} cover`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#151519] via-transparent to-black/20" />
        </div>

        <div className="px-6 pb-6 -mt-12 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="rounded-full p-1 bg-[#151519]">
                <Avatar src={member.avatarUrl} name={member.fullName} size="xl" />
              </div>
              <div className="pb-1">
                <h1 className="font-display text-2xl font-bold text-[#F8F9FA] leading-tight">
                  {member.fullName}
                </h1>
                <p className="text-sm text-[#A1A1AA]">@{member.username}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={openEditModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-[#F8F9FA] hover:border-[#D4AF37]/50 hover:bg-white/[0.04] flex items-center gap-2 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleFollowToggle}
                    disabled={followBusy}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                      following
                        ? 'border border-white/15 text-[#F8F9FA] hover:bg-white/[0.04]'
                        : 'gold-gradient-btn'
                    }`}
                  >
                    {following ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>

                  {currentUser && !isBlocked && (
                    <button
                      type="button"
                      onClick={() => onMessageUser(member)}
                      className="px-4 py-2 rounded-xl text-xs font-medium border border-white/15 text-[#F8F9FA] hover:border-[#D4AF37]/40 flex items-center gap-2 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Message</span>
                    </button>
                  )}

                  {currentUser && (
                    <>
                      <button
                        type="button"
                        onClick={handleBlockToggle}
                        title={isBlocked ? 'Unblock user' : 'Block user'}
                        aria-label={isBlocked ? 'Unblock user' : 'Block user'}
                        className={`p-2 rounded-xl border transition-colors ${
                          isBlocked
                            ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                            : 'border-white/10 text-[#A1A1AA] hover:text-[#F8F9FA]'
                        }`}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportOpen(true)}
                        title="Report user"
                        aria-label="Report user"
                        className="p-2 rounded-xl border border-white/10 text-[#A1A1AA] hover:text-[#D4AF37] transition-colors"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {member.isSuspended && (
            <p className="mt-4 text-xs text-rose-400">
              This account is currently suspended by moderation.
            </p>
          )}

          {member.bio && (
            <p className="mt-4 text-sm text-[#F8F9FA]/90 leading-relaxed max-w-2xl">
              {member.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#A1A1AA]">
            {member.hostel && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{member.hostel}</span>
              </span>
            )}
            <span className="font-mono tabular-nums">
              <strong className="text-[#F8F9FA]">{formatCount(member.postsCount)}</strong> Posts
            </span>
            <span className="font-mono tabular-nums">
              <strong className="text-[#F8F9FA]">{formatCount(member.followersCount)}</strong>{' '}
              Followers
            </span>
            <span className="font-mono tabular-nums">
              <strong className="text-[#F8F9FA]">{formatCount(member.followingCount)}</strong>{' '}
              Following
            </span>
          </div>
        </div>
      </section>

      {/* Posts / Saved Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'posts'
              ? 'bg-[#D4AF37] text-[#0A0A0C]'
              : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Published Posts</span>
        </button>

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'saved'
                ? 'bg-[#D4AF37] text-[#0A0A0C]'
                : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Posts</span>
          </button>
        )}
      </div>

      {/* Posts Stream */}
      {isBlocked ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
          <p className="text-sm text-[#A1A1AA]">
            You have blocked @{member.username}. Unblock them to view their posts.
          </p>
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
          <p className="font-display text-base font-semibold text-[#F8F9FA]">
            {activeTab === 'saved' ? 'No saved posts yet' : 'No published posts yet'}
          </p>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            {activeTab === 'saved'
              ? 'Bookmark photographs and videos from the feed to find them quickly here.'
              : 'Stories shared by this member will appear here.'}
          </p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {displayedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
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
        </div>
      )}

      {/* Edit Profile Modal (Owner Only) */}
      {editOpen && isOwnProfile && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveProfile}
            className="glass-surface w-full max-w-lg rounded-2xl p-6 border border-white/10 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#F8F9FA]">Edit Profile</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close edit profile"
                className="text-[#A1A1AA] hover:text-[#F8F9FA] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-white/15 text-xs font-medium text-[#F8F9FA] hover:bg-white/[0.04] flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{uploadingImage ? 'Uploading...' : 'Change Avatar'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleMediaUpload(e, 'avatars')}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-white/15 text-xs font-medium text-[#F8F9FA] hover:bg-white/[0.04] flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{uploadingImage ? 'Uploading...' : 'Change Cover'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleMediaUpload(e, 'covers')}
                  className="hidden"
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-[#A1A1AA]">
              Full Name
              <input
                type="text"
                required
                maxLength={64}
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
            </label>

            <label className="block text-xs font-medium text-[#A1A1AA]">
              Username
              <input
                type="text"
                required
                minLength={3}
                maxLength={24}
                value={editUsername}
                onChange={(e) => setEditUsername(sanitizeUsername(e.target.value))}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
            </label>

            <label className="block text-xs font-medium text-[#A1A1AA]">
              Hostel or Institution
              <input
                type="text"
                maxLength={80}
                value={editHostel}
                onChange={(e) => setEditHostel(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
            </label>

            <label className="block text-xs font-medium text-[#A1A1AA]">
              Bio
              <textarea
                rows={3}
                maxLength={240}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37] resize-none"
              />
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-white/10 text-[#F8F9FA]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile || uploadingImage}
                className="gold-gradient-btn px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {currentUser && !isOwnProfile && (
        <ReportModal
          open={reportOpen}
          reporterId={currentUser.uid}
          targetType="user"
          targetId={member.uid}
          targetAuthorId={member.uid}
          targetLabel={`@${member.username}`}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
