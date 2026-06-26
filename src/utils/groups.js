import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
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

// Role hierarchy inside a group. Higher rank can manage strictly lower ranks.
export const ROLE_RANK = { member: 1, admin: 2, coOwner: 3, owner: 4 };

export const ROLE_LABEL = {
  owner: 'Owner',
  coOwner: 'Co-owner',
  admin: 'Admin',
  member: 'Member'
};

// Managers (admin and above) can approve posts and manage members.
export function isManager(role) {
  return (ROLE_RANK[role] || 0) >= ROLE_RANK.admin;
}

export function canApprovePosts(role) {
  return isManager(role);
}

// Posts from managers are auto-approved; everyone else needs approval.
export function postStatusFor(role) {
  return isManager(role) ? 'approved' : 'pending';
}

// Returns the management actions an actor with `actorRole` may take on a member
// with `targetRole`. Encodes the owner > co-owner > admin > member hierarchy.
export function memberActions(actorRole, targetRole) {
  const actorRank = ROLE_RANK[actorRole] || 0;
  const targetRank = ROLE_RANK[targetRole] || 0;
  if (actorRank < ROLE_RANK.admin) return []; // members cannot manage
  if (targetRank >= actorRank) return []; // cannot act on equal or higher rank

  const actions = [];

  if (targetRole === 'member') {
    actions.push({ key: 'makeAdmin', label: 'Make admin', role: 'admin' });
    if (actorRole === 'owner') {
      actions.push({ key: 'makeCoOwner', label: 'Make co-owner', role: 'coOwner' });
    }
  }

  if (targetRole === 'admin') {
    if (actorRole === 'owner') {
      actions.push({ key: 'makeCoOwner', label: 'Promote to co-owner', role: 'coOwner' });
    }
    actions.push({ key: 'demoteToMember', label: 'Demote to member', role: 'member' });
  }

  if (targetRole === 'coOwner') {
    // Only the owner outranks a co-owner.
    actions.push({ key: 'demoteToAdmin', label: 'Demote to admin', role: 'admin' });
    actions.push({ key: 'demoteToMember', label: 'Demote to member', role: 'member' });
  }

  actions.push({ key: 'remove', label: 'Remove from group', destructive: true });
  actions.push({ key: 'block', label: 'Block user', destructive: true });
  return actions;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup({ name, description, topic }) {
  const user = await ensureSignedIn();
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('Please provide a group name.');
  }

  const groupRef = await addDoc(collection(db, 'groups'), {
    name: trimmedName,
    description: (description || '').trim(),
    topic: (topic || '').trim(),
    ownerId: user.uid,
    ownerName: displayNameFor(user),
    memberCount: 1,
    createdAt: serverTimestamp()
  });

  // The creator is the owner.
  await setDoc(doc(db, 'groups', groupRef.id, 'members', user.uid), {
    uid: user.uid,
    displayName: displayNameFor(user),
    role: 'owner',
    blocked: false,
    canComment: true,
    commentRequest: false,
    joinedAt: serverTimestamp()
  });

  return groupRef.id;
}

export function subscribeGroups(callback) {
  const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export function subscribeGroup(groupId, callback) {
  if (!groupId) return () => {};
  return onSnapshot(doc(db, 'groups', groupId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function subscribeGroupMembers(groupId, callback) {
  if (!groupId) return () => {};
  return onSnapshot(
    collection(db, 'groups', groupId, 'members'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export function subscribeMyMembership(groupId, uid, callback) {
  if (!groupId || !uid) {
    callback(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'groups', groupId, 'members', uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Follow/join a group as a contributing member.
export async function followGroup(groupId) {
  const user = await ensureSignedIn();
  const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    if (existing.data().blocked) {
      throw new Error('You are blocked from this group.');
    }
    return; // already a member
  }
  await setDoc(memberRef, {
    uid: user.uid,
    displayName: displayNameFor(user),
    role: 'member',
    blocked: false,
    canComment: false,
    commentRequest: false,
    joinedAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(1) }).catch(() => {});
}

export async function leaveGroup(groupId, role) {
  const user = await ensureSignedIn();
  if (role === 'owner') {
    throw new Error('Owners cannot leave their own group.');
  }
  await deleteDoc(doc(db, 'groups', groupId, 'members', user.uid));
  await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(-1) }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Group chat
// ---------------------------------------------------------------------------

// True when a member is allowed to send messages in the group chat. Managers
// can always comment; everyone else needs an approved comment request.
export function canComment(member) {
  if (!member) return false;
  if (isManager(member.role)) return true;
  return member.canComment === true;
}

export function subscribeGroupChat(groupId, callback) {
  if (!groupId) return () => {};
  const q = query(collection(db, 'groups', groupId, 'chat'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export async function sendGroupChatMessage(groupId, text) {
  const user = await ensureSignedIn();
  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('Write a message before sending.');
  }
  await addDoc(collection(db, 'groups', groupId, 'chat'), {
    authorId: user.uid,
    authorName: displayNameFor(user),
    text: trimmed,
    createdAt: serverTimestamp()
  });
}

// A follower asks for permission to comment in the chat.
export async function requestCommentAccess(groupId) {
  const user = await ensureSignedIn();
  await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { commentRequest: true });
}

export async function cancelCommentRequest(groupId) {
  const user = await ensureSignedIn();
  await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { commentRequest: false });
}

// Managers approve or deny pending comment requests.
export async function approveCommentAccess(groupId, uid) {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { canComment: true, commentRequest: false });
}

export async function denyCommentAccess(groupId, uid) {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { canComment: false, commentRequest: false });
}

// Polls published into this group. Visible to anyone, but surfaced under the
// group rather than the global feed.
export function subscribeGroupPolls(groupId, callback) {
  if (!groupId) return () => {};
  const q = query(collection(db, 'polls'), where('groupId', '==', groupId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      callback(items);
    },
    () => callback([])
  );
}

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

export async function setMemberRole(groupId, uid, role) {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { role });
}

export async function removeMember(groupId, uid) {
  await deleteDoc(doc(db, 'groups', groupId, 'members', uid));
  await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(-1) }).catch(() => {});
}

export async function blockMember(groupId, uid) {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { role: 'member', blocked: true });
}

export async function unblockMember(groupId, uid) {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { blocked: false });
}

export async function applyMemberAction(groupId, uid, action) {
  switch (action.key) {
    case 'makeAdmin':
    case 'makeCoOwner':
    case 'demoteToMember':
    case 'demoteToAdmin':
      return setMemberRole(groupId, uid, action.role);
    case 'remove':
      return removeMember(groupId, uid);
    case 'block':
      return blockMember(groupId, uid);
    default:
      return undefined;
  }
}
