import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { StoryItem, UserProfile } from '../types';

export async function createStory(params: {
  author: UserProfile;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
}): Promise<StoryItem> {
  const storyRef = doc(collection(db, 'stories'));
  const expiresAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiresAt = Timestamp.fromDate(expiresAtDate);

  const payload = {
    id: storyRef.id,
    authorId: params.author.uid,
    authorUsername: params.author.username,
    authorName: params.author.fullName,
    authorAvatarUrl: (params.author.avatarUrl || '').slice(0, 32768),
    mediaUrl: params.mediaUrl.slice(0, 500000),
    mediaType: params.mediaType,
    caption: (params.caption || '').trim().slice(0, 280),
    visibility: 'public' as const,
    createdAt: serverTimestamp(),
    expiresAt,
  };

  try {
    await setDoc(storyRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stories/${storyRef.id}`);
  }

  return {
    ...payload,
    createdAt: Timestamp.now(),
  };
}

export async function fetchActiveStories(maxCount = 40): Promise<StoryItem[]> {
  try {
    const q = query(
      collection(db, 'stories'),
      orderBy('createdAt', 'desc'),
      limit(Math.min(50, maxCount))
    );
    const snap = await getDocs(q);
    const nowMs = Date.now();
    return snap.docs
      .map((d) => d.data() as StoryItem)
      .filter((story) => !story.expiresAt || story.expiresAt.toMillis() > nowMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'stories');
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
  }
}
