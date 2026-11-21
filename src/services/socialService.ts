import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  ChatMessage,
  Conversation,
  ModerationReport,
  NotificationItem,
  PlatformSettings,
  UserProfile,
} from '../types';
import { getConversationId } from '../utils/formatters';
import {
  createAppNotification,
  markAllNotificationsRead as markAllNotifsRead,
  markNotificationRead as markNotifRead,
} from './notificationService';

export function subscribeNotifications(
  uid: string,
  callback: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('recipientId', '==', uid), limit(80));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as NotificationItem);
      items.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
  );
}

export const markNotificationRead = markNotifRead;
export const markAllNotificationsRead = markAllNotifsRead;

export function subscribeConversations(
  uid: string,
  callback: (items: Conversation[]) => void
): Unsubscribe {
  const q = query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Conversation);
      items.sort((a, b) => (b.lastMessageAt?.toMillis() || 0) - (a.lastMessageAt?.toMillis() || 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );
}

export async function getOrCreateConversation(
  me: UserProfile,
  other: UserProfile
): Promise<Conversation> {
  const convId = getConversationId(me.uid, other.uid);
  const convRef = doc(db, 'conversations', convId);

  try {
    const existingSnap = await getDoc(convRef);
    if (existingSnap.exists()) {
      return existingSnap.data() as Conversation;
    }

    const [a, b] = [me, other].sort((x, y) => x.uid.localeCompare(y.uid));
    const payload = {
      id: convId,
      participantIds: [a.uid, b.uid],
      participantAId: a.uid,
      participantBId: b.uid,
      participantAUsername: a.username,
      participantAName: a.fullName,
      participantAAvatar: a.avatarUrl,
      participantBUsername: b.username,
      participantBName: b.fullName,
      participantBAvatar: b.avatarUrl,
      lastMessageText: '',
      lastMessageSenderId: '',
      unreadByA: 0,
      unreadByB: 0,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(convRef, payload);
    const createdSnap = await getDoc(convRef);
    return createdSnap.data() as Conversation;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `conversations/${convId}`);
  }
}

export function subscribeMessages(
  conversationId: string,
  uid: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    where('participantIds', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const msgs = snapshot.docs.map((d) => d.data() as ChatMessage);
      msgs.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
      callback(msgs);
    },
    (error) =>
      handleFirestoreError(error, OperationType.LIST, `conversations/${conversationId}/messages`)
  );
}

export async function sendMessage(
  conversation: Conversation,
  senderId: string,
  text: string,
  senderProfile?: UserProfile
): Promise<void> {
  const clean = text.trim().slice(0, 1000);
  if (!clean) return;

  const senderIsA = conversation.participantAId === senderId;
  const recipientId = senderIsA ? conversation.participantBId : conversation.participantAId;
  const recipientIsA = conversation.participantAId === recipientId;

  const msgRef = doc(collection(db, 'conversations', conversation.id, 'messages'));
  const convRef = doc(db, 'conversations', conversation.id);
  const batch = writeBatch(db);

  batch.set(msgRef, {
    id: msgRef.id,
    conversationId: conversation.id,
    participantIds: conversation.participantIds,
    senderId,
    recipientId,
    text: clean,
    isRead: false,
    createdAt: serverTimestamp(),
  });

  batch.update(convRef, {
    lastMessageText: clean.slice(0, 500),
    lastMessageSenderId: senderId,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(recipientIsA ? { unreadByA: increment(1) } : { unreadByB: increment(1) }),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `conversations/${conversation.id}/messages/${msgRef.id}`
    );
  }

  // Create recipient in-app notification for real-time bell & push routing
  if (recipientId && recipientId !== senderId) {
    const actor: UserProfile = senderProfile || {
      uid: senderId,
      username: senderIsA ? conversation.participantAUsername : conversation.participantBUsername,
      usernameLower: (senderIsA
        ? conversation.participantAUsername
        : conversation.participantBUsername
      ).toLowerCase(),
      fullName: senderIsA ? conversation.participantAName : conversation.participantBName,
      bio: '',
      hostel: '',
      avatarUrl: senderIsA ? conversation.participantAAvatar : conversation.participantBAvatar,
      coverUrl: '',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      isSuspended: false,
      createdAt: null,
      updatedAt: null,
    };

    void createAppNotification({
      recipientId,
      actor,
      type: 'NEW_MESSAGE',
      title: actor.fullName || 'Hostel Member',
      body: clean.slice(0, 140),
      message: `sent you a message: "${clean.slice(0, 80)}"`,
      relatedConversationId: conversation.id,
      relatedMessageId: msgRef.id,
      actionUrl: `/?view=messages&conversationId=${encodeURIComponent(conversation.id)}&uid=${encodeURIComponent(senderId)}`,
    }).catch(() => {
      // Never block message delivery if notification creation fails
    });
  }
}

export async function markConversationRead(
  conversation: Conversation,
  myUid: string,
  messages: ChatMessage[] = []
): Promise<void> {
  const isA = conversation.participantAId === myUid;
  const unreadCount = isA ? conversation.unreadByA : conversation.unreadByB;
  const unreadMsgs = messages.filter((m) => m.recipientId === myUid && !m.isRead);

  if (unreadCount <= 0 && unreadMsgs.length === 0) return;

  try {
    if (unreadMsgs.length === 0) {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        ...(isA ? { unreadByA: 0 } : { unreadByB: 0 }),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const chunkSize = 400;
    for (let i = 0; i < unreadMsgs.length; i += chunkSize) {
      const slice = unreadMsgs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const msg of slice) {
        batch.update(doc(db, 'conversations', conversation.id, 'messages', msg.id), {
          isRead: true,
          readAt: serverTimestamp(),
        });
      }
      if (i === 0 && unreadCount > 0) {
        batch.update(doc(db, 'conversations', conversation.id), {
          ...(isA ? { unreadByA: 0 } : { unreadByB: 0 }),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversation.id}`);
  }
}

export async function setConversationTyping(
  conversation: Pick<Conversation, 'id' | 'participantAId' | 'participantBId'>,
  myUid: string,
  isTyping: boolean
): Promise<void> {
  if (!conversation?.id || !myUid) return;
  const isA = conversation.participantAId === myUid;
  const isB = conversation.participantBId === myUid;
  if (!isA && !isB) return;

  try {
    await updateDoc(doc(db, 'conversations', conversation.id), {
      ...(isA
        ? { typingAAt: isTyping ? serverTimestamp() : null }
        : { typingBAt: isTyping ? serverTimestamp() : null }),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical real-time indicator; never disrupt message delivery
  }
}

export async function createReport(params: {
  reporterId: string;
  targetType: 'post' | 'user' | 'comment';
  targetId: string;
  targetAuthorId: string;
  reason: string;
  details: string;
}): Promise<void> {
  const reportRef = doc(collection(db, 'reports'));
  try {
    await setDoc(reportRef, {
      id: reportRef.id,
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      targetAuthorId: params.targetAuthorId,
      reason: params.reason.trim().slice(0, 100),
      details: params.details.trim().slice(0, 600),
      status: 'open',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportRef.id}`);
  }
}

export async function fetchAllReports(): Promise<ModerationReport[]> {
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ModerationReport);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function updateReportStatus(
  reportId: string,
  status: 'resolved' | 'dismissed',
  adminUid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      reviewedBy: adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminDeletePostById(postId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function adminToggleUserSuspension(
  targetUid: string,
  isSuspended: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      isSuspended,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function fetchPlatformSettings(): Promise<PlatformSettings> {
  const defaults: PlatformSettings = {
    maxUploadSizeMB: 25,
    allowNewRegistrations: true,
    maintenanceNotice: '',
    featuredHashtags: ['hostellife', 'latenightstudy', 'rooftop', 'campusfilm', 'coffeehour'],
    updatedBy: 'system',
    updatedAt: null,
  };
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'config'));
    if (!snap.exists()) return defaults;
    return snap.data() as PlatformSettings;
  } catch {
    return defaults;
  }
}

export async function savePlatformSettings(
  adminUid: string,
  settings: Omit<PlatformSettings, 'updatedBy' | 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(doc(db, 'platformSettings', 'config'), {
      maxUploadSizeMB: Math.min(100, Math.max(1, Math.round(settings.maxUploadSizeMB))),
      allowNewRegistrations: settings.allowNewRegistrations,
      maintenanceNotice: settings.maintenanceNotice.trim().slice(0, 240),
      featuredHashtags: settings.featuredHashtags.slice(0, 10),
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platformSettings/config');
  }
}

export async function fetchAdminActivityOverview(): Promise<{
  users: UserProfile[];
  totalPostsSampled: number;
  openReports: number;
}> {
  try {
    const [usersSnap, postsSnap, reportsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50))),
    ]);
    const users = usersSnap.docs.map((d) => d.data() as UserProfile);
    const openReports = reportsSnap.docs.filter((d) => d.data().status === 'open').length;
    return {
      users,
      totalPostsSampled: postsSnap.size,
      openReports,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admin-overview');
  }
}
