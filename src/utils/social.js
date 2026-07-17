import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as limitFn,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { ensureSignedIn, displayNameFor } from './account';

// ---------------------------------------------------------------------------
// User profiles
// ---------------------------------------------------------------------------

// Creates or refreshes the public profile document for a user. Safe to call
// on every auth change. Anonymous guests get a stable "Guest ####" name.
export async function upsertUserProfile(user) {
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const payload = {
    uid: user.uid,
    displayName: displayNameFor(user),
    nameLower: displayNameFor(user).toLowerCase(),
    photoURL: user.photoURL || null,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    isAnonymous: !!user.isAnonymous,
    updatedAt: serverTimestamp()
  };
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
    payload.bio = '';
  }
  await setDoc(ref, payload, { merge: true });
}

export function subscribeUsers(callback) {
  return onSnapshot(collection(db, 'users'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Subscribes only to the specific user documents we actually need (e.g. the
// people in a conversation list), instead of downloading the entire `users`
// collection. Emits a { [uid]: profile } map and keeps it live per-document.
// This bounds reads/bandwidth to the number of contacts, avoiding the large
// full-collection downloads that slow first load and can time out at scale.
export function subscribeUsersByIds(ids, callback) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) {
    callback({});
    return () => {};
  }
  const map = {};
  const unsubs = unique.map((id) =>
    onSnapshot(
      doc(db, 'users', id),
      (snap) => {
        if (snap.exists()) {
          map[id] = { id: snap.id, ...snap.data() };
          callback({ ...map });
        }
      },
      () => {}
    )
  );
  return () => unsubs.forEach((fn) => fn());
}

export function subscribeUserProfile(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function updateUserBio(bio) {
  const user = await ensureSignedIn();
  await setDoc(doc(db, 'users', user.uid), { bio: (bio || '').slice(0, 280), updatedAt: serverTimestamp() }, { merge: true });
}

// Persists the user's app preference toggles onto their profile document.
export async function updateUserPreferences(preferences) {
  const user = await ensureSignedIn();
  await setDoc(
    doc(db, 'users', user.uid),
    { preferences: preferences || {}, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Saves the user's nationality (country) and state/province (region).
export async function updateUserLocation({ country, region }) {
  const user = await ensureSignedIn();
  await setDoc(
    doc(db, 'users', user.uid),
    {
      country: country ? String(country).slice(0, 60) : null,
      region: region ? String(region).slice(0, 80) : null,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

// ---------------------------------------------------------------------------
// Verified accounts
//
// Account types that can be verified (businesses, public figures, news, etc.).
// A profile only shows the badge once an admin sets `verified: true` on the
// user doc (Firestore rules forbid users from self-granting verification).
// Users submit a request here for manual review.
// ---------------------------------------------------------------------------

export const VERIFIED_TYPES = [
  { id: 'business', label: 'Business' },
  { id: 'celebrity', label: 'Public figure / Celebrity' },
  { id: 'news', label: 'News outlet' },
  { id: 'government', label: 'Municipality / Government' },
  { id: 'political', label: 'Political account' },
  { id: 'organization', label: 'Organization' }
];

export function verifiedTypeLabel(typeId) {
  return VERIFIED_TYPES.find((item) => item.id === typeId)?.label || 'Verified';
}

// Submits (or updates) the signed-in user's verification request for review.
export async function submitVerificationRequest({ type, legalName, details, links }) {
  const user = await ensureSignedIn();
  if (!type) {
    throw new Error('Please choose the type of account you are verifying.');
  }
  await setDoc(
    doc(db, 'verificationRequests', user.uid),
    {
      uid: user.uid,
      displayName: displayNameFor(user),
      type,
      legalName: (legalName || '').slice(0, 120),
      details: (details || '').slice(0, 600),
      links: (links || '').slice(0, 400),
      status: 'pending',
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
  // Mark the profile as having a pending request (does NOT grant the badge).
  await setDoc(
    doc(db, 'users', user.uid),
    { verificationRequested: true, verificationType: type, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Subscribes to the signed-in user's own verification request status.
export function subscribeVerificationRequest(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, 'verificationRequests', uid),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => callback(null)
  );
}

// ---------------------------------------------------------------------------
// Follow graph (Instagram-style). Friends = mutual follow.
// ---------------------------------------------------------------------------

export async function followUser(targetUid) {
  const user = await ensureSignedIn();
  if (!targetUid || targetUid === user.uid) return;
  await Promise.all([
    setDoc(doc(db, 'users', user.uid, 'following', targetUid), { uid: targetUid, createdAt: serverTimestamp() }),
    setDoc(doc(db, 'users', targetUid, 'followers', user.uid), { uid: user.uid, createdAt: serverTimestamp() })
  ]);
}

export async function unfollowUser(targetUid) {
  const user = await ensureSignedIn();
  if (!targetUid) return;
  await Promise.all([
    deleteDoc(doc(db, 'users', user.uid, 'following', targetUid)),
    deleteDoc(doc(db, 'users', targetUid, 'followers', user.uid))
  ]);
}

export function subscribeFollowing(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(collection(db, 'users', uid, 'following'), (snap) => {
    callback(snap.docs.map((d) => d.id));
  });
}

export function subscribeFollowers(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(collection(db, 'users', uid, 'followers'), (snap) => {
    callback(snap.docs.map((d) => d.id));
  });
}

// Mutual follows = friends. Subscribes to both edges and emits the intersection.
export function subscribeFriends(uid, callback) {
  if (!uid) return () => {};
  let following = [];
  let followers = [];
  const emit = () => {
    const set = new Set(followers);
    callback(following.filter((id) => set.has(id)));
  };
  const unsubA = subscribeFollowing(uid, (ids) => {
    following = ids;
    emit();
  });
  const unsubB = subscribeFollowers(uid, (ids) => {
    followers = ids;
    emit();
  });
  return () => {
    unsubA();
    unsubB();
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchUsers(term, max = 20) {
  const text = (term || '').trim().toLowerCase();
  if (!text) return [];
  const ref = collection(db, 'users');
  const q = query(ref, orderBy('nameLower'), where('nameLower', '>=', text), where('nameLower', '<=', `${text}\uf8ff`), limitFn(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Activity feed (powers Settings interactions + daily "top creators")
// ---------------------------------------------------------------------------

// Records an interaction both privately (for the actor's own history) and in a
// global feed (so the home page can rank the most-interacted-with creators).
export async function recordActivity(type, { pollId, pollTitle, detail } = {}) {
  const user = await ensureSignedIn();
  const now = serverTimestamp();
  const tasks = [
    addDoc(collection(db, 'users', user.uid, 'activity'), {
      type,
      pollId: pollId || null,
      pollTitle: pollTitle || '',
      detail: detail || '',
      createdAt: now
    }),
    addDoc(collection(db, 'activityFeed'), {
      type,
      actorId: user.uid,
      pollId: pollId || null,
      createdAt: now
    })
  ];
  // Best-effort: never let activity logging break the primary action.
  await Promise.allSettled(tasks);
}

export function subscribeMyActivity(uid, callback, max = 50) {
  if (!uid) return () => {};
  const q = query(collection(db, 'users', uid, 'activity'), orderBy('createdAt', 'desc'), limitFn(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

// Subscribes to global activity from the last `sinceMs` window. Capped low
// because this only feeds the "top creators" aggregation — 200 recent entries
// is plenty and avoids downloading a huge slice of the feed on every load.
export function subscribeRecentFeed(sinceMs, callback) {
  const cutoff = new Date(Date.now() - sinceMs);
  const q = query(collection(db, 'activityFeed'), where('createdAt', '>=', cutoff), orderBy('createdAt', 'desc'), limitFn(200));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}
