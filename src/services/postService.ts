import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { AspectRatioType, CommentItem, MediaType, Post, UserProfile } from '../types';
import {
  buildNotificationPayload,
  createAppNotification,
  shouldSkipDedupeKey,
} from './notificationService';

export async function createPost(params: {
  author: UserProfile;
  mediaUrl: string;
  thumbnailUrl?: string;
  mediaType: MediaType;
  aspectRatio: AspectRatioType;
  caption: string;
  hashtags: string[];
}): Promise<string> {
  const postRef = doc(collection(db, 'posts'));
  const batch = writeBatch(db);

  batch.set(postRef, {
    id: postRef.id,
    authorId: params.author.uid,
    authorUsername: params.author.username,
    authorName: params.author.fullName,
    authorAvatarUrl: (params.author.avatarUrl || '').slice(0, 32768),
    mediaUrl: params.mediaType === 'text' ? '' : params.mediaUrl.slice(0, 500000),
    ...(params.thumbnailUrl ? { thumbnailUrl: params.thumbnailUrl.slice(0, 100000) } : {}),
    mediaType: params.mediaType,
    aspectRatio: params.aspectRatio,
    caption: params.caption.trim().slice(0, 1000),
    hashtags: params.hashtags.slice(0, 10),
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', params.author.uid), {
    postsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postRef.id}`);
  }

  // Send @mention notifications in the background so post publishing returns immediately
  const mentionMatches = Array.from(
    new Set((params.caption.match(/@([a-zA-Z0-9_]{3,24})/g) || []).map((m) => m.slice(1).toLowerCase()))
  ).slice(0, 5);

  if (mentionMatches.length > 0) {
    void Promise.all(
      mentionMatches
        .filter((handle) => handle !== params.author.usernameLower)
        .map(async (handle) => {
          try {
            const uq = query(collection(db, 'users'), where('usernameLower', '==', handle), limit(1));
            const uSnap = await getDocs(uq);
            if (!uSnap.empty) {
              const target = uSnap.docs[0].data() as UserProfile;
              await createAppNotification({
                recipientId: target.uid,
                actor: params.author,
                type: 'USER_MENTION',
                title: 'New Mention',
                body: `${params.author.fullName} mentioned you in a post.`,
                message: 'mentioned you in a post.',
                postId: postRef.id,
                relatedPostId: postRef.id,
              });
            }
          } catch {
            // Ignore non-critical mention notification failures
          }
        })
    );
  }

  return postRef.id;
}

export async function fetchPostById(postId: string): Promise<Post | null> {
  if (!postId) return null;
  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    return snap.exists() ? (snap.data() as Post) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `posts/${postId}`);
  }
}

export async function deletePost(post: Post, isOwnerDelete: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'posts', post.id));
  if (isOwnerDelete) {
    batch.update(doc(db, 'users', post.authorId), {
      postsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
  }
}

export async function fetchPostsPage(
  lastSnapshot: DocumentSnapshot | null = null,
  pageSize = 12
): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  try {
    const q = lastSnapshot
      ? query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastSnapshot), limit(pageSize))
      : query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(pageSize));
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => d.data() as Post);
    const nextLast = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return {
      posts,
      lastDoc: nextLast,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchPostsByAuthor(authorId: string): Promise<Post[]> {
  try {
    const q = query(collection(db, 'posts'), where('authorId', '==', authorId), limit(50));
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => d.data() as Post);
    return posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchVideoMoments(): Promise<Post[]> {
  try {
    const q = query(collection(db, 'posts'), where('mediaType', '==', 'video'), limit(40));
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => d.data() as Post);
    return posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchPostsByHashtag(tag: string): Promise<Post[]> {
  const cleanTag = tag.replace(/^#/, '').toLowerCase();
  if (!cleanTag) return [];
  try {
    const q = query(collection(db, 'posts'), where('hashtags', 'array-contains', cleanTag), limit(40));
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => d.data() as Post);
    return posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchTrendsSample(sampleSize = 100): Promise<Post[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.round(sampleSize)));
  try {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(safeLimit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Post);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function getUserLikedPostIds(uid: string): Promise<Set<string>> {
  try {
    const q = query(collection(db, 'likes'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return new Set(snap.docs.map((d) => d.data().postId as string));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'likes');
  }
}

export async function toggleLikePost(
  post: Post,
  actor: UserProfile,
  currentlyLiked: boolean
): Promise<void> {
  const likeId = `${post.id}_${actor.uid}`;
  const likeRef = doc(db, 'likes', likeId);
  const postRef = doc(db, 'posts', post.id);
  const batch = writeBatch(db);

  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(postRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(likeRef, {
      id: likeId,
      postId: post.id,
      userId: actor.uid,
      createdAt: serverTimestamp(),
    });
    batch.update(postRef, {
      likesCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    if (post.authorId !== actor.uid && !shouldSkipDedupeKey(`like:${actor.uid}:${post.id}`)) {
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(
        notifRef,
        buildNotificationPayload(notifRef.id, {
          recipientId: post.authorId,
          actor,
          type: 'POST_LIKE',
          title: 'New Like',
          body: `${actor.fullName} liked your post.`,
          message: 'liked your post.',
          postId: post.id,
          relatedPostId: post.id,
        })
      );
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `likes/${likeId}`);
  }
}

export async function getUserSavedPostIds(uid: string): Promise<Set<string>> {
  try {
    const q = query(collection(db, 'savedPosts'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return new Set(snap.docs.map((d) => d.data().postId as string));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'savedPosts');
  }
}

export async function toggleSavePost(
  postId: string,
  uid: string,
  currentlySaved: boolean
): Promise<void> {
  const saveId = `${uid}_${postId}`;
  const saveRef = doc(db, 'savedPosts', saveId);
  try {
    if (currentlySaved) {
      await deleteDoc(saveRef);
    } else {
      await setDoc(saveRef, {
        id: saveId,
        userId: uid,
        postId,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `savedPosts/${saveId}`);
  }
}

export async function fetchComments(postId: string): Promise<CommentItem[]> {
  try {
    const q = query(collection(db, 'comments'), where('postId', '==', postId), limit(100));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as CommentItem);
    return list.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'comments');
  }
}

export async function addComment(
  post: Post,
  actor: UserProfile,
  text: string,
  replyTo?: {
    parentCommentId: string;
    replyToUserId: string;
    replyToUsername: string;
  }
): Promise<CommentItem> {
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) throw new Error('Comment cannot be empty.');

  const commentRef = doc(collection(db, 'comments'));
  const batch = writeBatch(db);

  const commentData = {
    id: commentRef.id,
    postId: post.id,
    postAuthorId: post.authorId,
    authorId: actor.uid,
    authorUsername: actor.username,
    authorName: actor.fullName,
    authorAvatarUrl: actor.avatarUrl,
    text: cleanText,
    ...(replyTo
      ? {
          parentCommentId: replyTo.parentCommentId,
          replyToUserId: replyTo.replyToUserId,
          replyToUsername: replyTo.replyToUsername,
        }
      : {}),
    isPublic: true,
    createdAt: serverTimestamp(),
  };

  batch.set(commentRef, commentData);
  batch.update(doc(db, 'posts', post.id), {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  const notifiedUids = new Set<string>([actor.uid]);

  if (replyTo && replyTo.replyToUserId && !notifiedUids.has(replyTo.replyToUserId)) {
    notifiedUids.add(replyTo.replyToUserId);
    const replyNotifRef = doc(collection(db, 'notifications'));
    batch.set(
      replyNotifRef,
      buildNotificationPayload(replyNotifRef.id, {
        recipientId: replyTo.replyToUserId,
        actor,
        type: 'COMMENT_REPLY',
        title: 'New Reply',
        body: `${actor.fullName} replied to your comment.`,
        message: `replied to your comment: "${cleanText.slice(0, 60)}"`,
        postId: post.id,
        relatedPostId: post.id,
        relatedCommentId: commentRef.id,
      })
    );
  }

  if (post.authorId !== actor.uid && !notifiedUids.has(post.authorId)) {
    notifiedUids.add(post.authorId);
    const notifRef = doc(collection(db, 'notifications'));
    batch.set(
      notifRef,
      buildNotificationPayload(notifRef.id, {
        recipientId: post.authorId,
        actor,
        type: 'POST_COMMENT',
        title: 'New Comment',
        body: `${actor.fullName} commented on your post.`,
        message: `commented on your post: "${cleanText.slice(0, 60)}"`,
        postId: post.id,
        relatedPostId: post.id,
        relatedCommentId: commentRef.id,
      })
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `comments/${commentRef.id}`);
  }

  // Send @mention notifications for users tagged inside the comment
  const mentionMatches = Array.from(
    new Set((cleanText.match(/@([a-zA-Z0-9_]{3,24})/g) || []).map((m) => m.slice(1).toLowerCase()))
  ).slice(0, 5);

  if (mentionMatches.length > 0) {
    void Promise.all(
      mentionMatches
        .filter((handle) => handle !== actor.usernameLower)
        .map(async (handle) => {
          try {
            const uq = query(collection(db, 'users'), where('usernameLower', '==', handle), limit(1));
            const uSnap = await getDocs(uq);
            if (!uSnap.empty) {
              const target = uSnap.docs[0].data() as UserProfile;
              if (!notifiedUids.has(target.uid)) {
                notifiedUids.add(target.uid);
                await createAppNotification({
                  recipientId: target.uid,
                  actor,
                  type: 'USER_MENTION',
                  title: 'Mentioned in Comment',
                  body: `${actor.fullName} mentioned you in a comment.`,
                  message: `mentioned you in a comment: "${cleanText.slice(0, 60)}"`,
                  postId: post.id,
                  relatedPostId: post.id,
                  relatedCommentId: commentRef.id,
                });
              }
            }
          } catch {
            // Ignore non-critical mention notification failures
          }
        })
    );
  }

  return {
    ...commentData,
    createdAt: null,
  };
}

export async function deleteComment(comment: CommentItem): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'comments', comment.id));
  batch.update(doc(db, 'posts', comment.postId), {
    commentsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `comments/${comment.id}`);
  }
}
