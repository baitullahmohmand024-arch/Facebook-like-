import { Timestamp } from 'firebase/firestore';

export type AppView =
  | 'landing'
  | 'auth'
  | 'feed'
  | 'explore'
  | 'moments'
  | 'messages'
  | 'notifications'
  | 'create'
  | 'profile'
  | 'settings'
  | 'admin';

export type MediaType = 'image' | 'video';
export type AspectRatioType = 'square' | 'landscape' | 'portrait' | 'vertical';
export type FeedTab = 'for-you' | 'following' | 'latest';

export interface UserProfile {
  uid: string;
  username: string;
  usernameLower: string;
  fullName: string;
  bio: string;
  hostel: string;
  avatarUrl: string;
  coverUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isSuspended: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivateSettings {
  uid: string;
  email: string;
  privacyMode: 'public' | 'followers';
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyFollows: boolean;
  notifyMessages: boolean;
  blockedUserIds: string[];
  updatedAt: Timestamp | null;
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorAvatarUrl: string;
  mediaUrl: string;
  mediaType: MediaType;
  aspectRatio: AspectRatioType;
  caption: string;
  hashtags: string[];
  visibility: 'public';
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CommentItem {
  id: string;
  postId: string;
  postAuthorId: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorAvatarUrl: string;
  text: string;
  isPublic: boolean;
  createdAt: Timestamp | null;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorUsername: string;
  actorName: string;
  actorAvatarUrl: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'system';
  postId: string;
  message: string;
  isRead: boolean;
  createdAt: Timestamp | null;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantAId: string;
  participantBId: string;
  participantAUsername: string;
  participantAName: string;
  participantAAvatar: string;
  participantBUsername: string;
  participantBName: string;
  participantBAvatar: string;
  lastMessageText: string;
  lastMessageSenderId: string;
  unreadByA: number;
  unreadByB: number;
  lastMessageAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  participantIds: string[];
  senderId: string;
  recipientId: string;
  text: string;
  isRead: boolean;
  createdAt: Timestamp | null;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: 'post' | 'user' | 'comment';
  targetId: string;
  targetAuthorId: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  reviewedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PlatformSettings {
  maxUploadSizeMB: number;
  allowNewRegistrations: boolean;
  maintenanceNotice: string;
  featuredHashtags: string[];
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
