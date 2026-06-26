import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { ensureSignedIn, displayNameFor } from './account';

// Deterministic chat id for a pair of users so both sides resolve the same doc.
export function chatIdFor(a, b) {
  return [a, b].sort().join('_');
}

// Ensures the 1:1 chat document exists and returns its id.
export async function ensureChat(otherUid) {
  const user = await ensureSignedIn();
  if (!otherUid || otherUid === user.uid) {
    throw new Error('Pick a different person to message.');
  }
  const id = chatIdFor(user.uid, otherUid);
  const ref = doc(db, 'chats', id);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      members: [user.uid, otherUid].sort(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: null,
      lastSenderId: null
    });
  }
  return id;
}

export async function sendMessage(chatId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const user = await ensureSignedIn();
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderId: user.uid,
    senderName: displayNameFor(user),
    text: trimmed,
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: trimmed.slice(0, 140),
    lastMessageAt: serverTimestamp(),
    lastSenderId: user.uid,
    updatedAt: serverTimestamp()
  });
}

export function subscribeMessages(chatId, callback) {
  if (!chatId) return () => {};
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

// All chats the current user is a member of. Sorted client-side to avoid a
// composite index requirement (array-contains + orderBy).
export function subscribeMyChats(uid, callback) {
  if (!uid) return () => {};
  const q = query(collection(db, 'chats'), where('members', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      chats.sort((a, b) => {
        const at = a.lastMessageAt?.toMillis?.() || a.updatedAt?.toMillis?.() || 0;
        const bt = b.lastMessageAt?.toMillis?.() || b.updatedAt?.toMillis?.() || 0;
        return bt - at;
      });
      callback(chats);
    },
    () => callback([])
  );
}
