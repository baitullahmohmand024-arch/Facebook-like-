import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
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

export async function createPost(params: {
  author: UserProfile;
  mediaUrl: string;
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
    authorAvatarUrl: params.author.avatarUrl,
    mediaUrl: params.mediaUrl.slice(0, 2048),
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

  // Send @mention notifications cleanly if caption mentions existing usernames
  const mentionMatches = Array.from(
    new Set((params.caption.match(/@([a-zA-Z0-9_]{3,24})/g) || []).map((m) => m.slice(1).toLowerCase()))
  ).slice(0, 5);

  if (mentionMatches.length > 0) {
    for (const handle of mentionMatches) {
      if (handle === params.author.usernameLower) continue;
      try {
        const uq = query(collection(db, 'users'), where('usernameLower', '==', handle), limit(1));
        const uSnap = await getDocs(uq);
        if (!uSnap.empty) {
          const target = uSnap.docs[0].data() as UserProfile;
          const notifRef = doc(collection(db, 'notifications'));
          await setDoc(notifRef, {
            id: notifRef.id,
            recipientId: target.uid,
            actorId: params.author.uid,
            actorUsername: params.author.username,
            actorName: params.author.fullName,
            actorAvatarUrl: params.author.avatarUrl,
            type: 'mention',
            postId: postRef.id,
            message: `@${params.author.username} mentioned you in a post.`,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // Ignore non-critical mention notification failures
      }
    }
  }

  return postRef.id;
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

    if (post.authorId !== actor.uid) {
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        id: notifRef.id,
        recipientId: post.authorId,
        actorId: actor.uid,
        actorUsername: actor.username,
        actorName: actor.fullName,
        actorAvatarUrl: actor.avatarUrl,
        type: 'like',
        postId: post.id,
        message: `@${actor.username} liked your post.`,
        isRead: false,
        createdAt: serverTimestamp(),
      });
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
  text: string
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
    isPublic: true,
    createdAt: serverTimestamp(),
  };

  batch.set(commentRef, commentData);
  batch.update(doc(db, 'posts', post.id), {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  if (post.authorId !== actor.uid) {
    const notifRef = doc(collection(db, 'notifications'));
    batch.set(notifRef, {
      id: notifRef.id,
      recipientId: post.authorId,
      actorId: actor.uid,
      actorUsername: actor.username,
      actorName: actor.fullName,
      actorAvatarUrl: actor.avatarUrl,
      type: 'comment',
      postId: post.id,
      message: `@${actor.username} commented: "${cleanText.slice(0, 60)}"`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `comments/${commentRef.id}`);
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
