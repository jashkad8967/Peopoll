import { doc, runTransaction, Timestamp, increment, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { ensureSignedIn, isPhoneVerified } from './account';
import { recordActivity } from './social';

// Raised when a vote is attempted without a verified phone. Callers catch this
// to open the phone verification flow rather than showing a generic error.
export class PhoneVerificationRequiredError extends Error {
  constructor() {
    super('Phone verification is required to vote.');
    this.name = 'PhoneVerificationRequiredError';
    this.code = 'phone-verification-required';
  }
}

// Subscribes to a poll's hourly trend buckets (real, timestamped vote history)
// in ascending time order. The callback receives an array of
// { id, timestamp, totalVotes, counts } documents. Returns an unsubscribe fn.
export function subscribeTrendSnapshots(pollId, callback) {
  if (!pollId) {
    callback([]);
    return () => {};
  }
  const snapshotsQuery = query(
    collection(db, 'polls', pollId, 'trendSnapshots'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(
    snapshotsQuery,
    (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))),
    () => callback([])
  );
}

export async function castPollVote(pollId, choiceId) {
  const currentUser = await ensureSignedIn();

  // Voting is gated on a verified phone so extra accounts can't stuff the
  // ballot. Surface a typed error the UI can catch to open verification.
  if (!isPhoneVerified(currentUser)) {
    throw new PhoneVerificationRequiredError();
  }

  const pollRef = doc(db, 'polls', pollId);
  const voteRef = doc(db, 'polls', pollId, 'votes', currentUser.uid);
  const bucketId = new Date().toISOString().slice(0, 13).replace(/:/g, '-');
  const snapshotRef = doc(db, 'polls', pollId, 'trendSnapshots', bucketId);

  let pollTitle = '';
  let choiceLabel = '';
  let changed = false;

  await runTransaction(db, async (tx) => {
    const pollDoc = await tx.get(pollRef);
    if (!pollDoc.exists()) {
      throw new Error('Poll no longer exists');
    }

    const voteDoc = await tx.get(voteRef);
    const previousChoiceId = voteDoc.exists() ? voteDoc.data().choiceId : null;
    const currentPoll = pollDoc.data();
    pollTitle = currentPoll.title || '';
    choiceLabel = (currentPoll.choices || []).find((choice) => choice.id === choiceId)?.label || '';

    if (previousChoiceId === choiceId) {
      return;
    }
    changed = true;

    const updatedChoices = (currentPoll.choices || []).map((choice) => {
      if (choice.id === choiceId) {
        return { ...choice, count: (choice.count || 0) + 1 };
      }
      if (choice.id === previousChoiceId) {
        return { ...choice, count: Math.max(0, (choice.count || 0) - 1) };
      }
      return choice;
    });

    const totalVotes = currentPoll.totalVotes || 0;
    const updatedTotalVotes = previousChoiceId ? totalVotes : totalVotes + 1;

    tx.update(pollRef, {
      choices: updatedChoices,
      totalVotes: updatedTotalVotes
    });

    tx.set(
      voteRef,
      {
        userId: currentUser.uid,
        choiceId,
        votedAt: Timestamp.now()
      },
      { merge: true }
    );

    const snapshotUpdate = {
      timestamp: Timestamp.now(),
      totalVotes: increment(previousChoiceId ? 0 : 1),
      [`counts.${choiceId}`]: increment(1)
    };

    if (previousChoiceId) {
      snapshotUpdate[`counts.${previousChoiceId}`] = increment(-1);
    }

    tx.set(snapshotRef, snapshotUpdate, { merge: true });
  });

  if (changed) {
    // Best-effort activity log; never block the vote on it.
    recordActivity('vote', { pollId, pollTitle, detail: choiceLabel }).catch(() => {});
  }
}