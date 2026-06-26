import { addDoc, collection, doc, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { ensureSignedIn, displayNameFor } from './account';
import { recordActivity } from './social';

// Posts a comment or a reply (when parentId is provided).
export async function postComment(pollId, text, parentId = null) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('Comment cannot be empty.');
  }

  const user = await ensureSignedIn();
  await addDoc(collection(db, 'polls', pollId, 'comments'), {
    userId: user.uid,
    userName: displayNameFor(user),
    text: trimmed,
    parentId: parentId || null,
    likedBy: [],
    createdAt: serverTimestamp()
  });

  recordActivity(parentId ? 'reply' : 'comment', { pollId, detail: trimmed.slice(0, 80) }).catch(() => {});
}

// Toggles the current user's like on a comment using an array of uids.
export async function toggleCommentLike(pollId, commentId, alreadyLiked) {
  const user = await ensureSignedIn();
  const commentRef = doc(db, 'polls', pollId, 'comments', commentId);
  await updateDoc(commentRef, {
    likedBy: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
  });

  if (!alreadyLiked) {
    recordActivity('like', { pollId, detail: 'Liked a comment' }).catch(() => {});
  }
}
