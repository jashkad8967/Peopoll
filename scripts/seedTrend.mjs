/**
 * One-off seed script: gives every existing poll a realistic, fluctuating
 * vote history so the trend charts have real timestamped data to draw across
 * all ranges (1 day / 3 days / week / all time).
 *
 * How it works:
 *  - For each poll it synthesises individual votes spread over the last ~10
 *    days. Each vote is assigned to a choice using time-varying weights, so
 *    the leading option shifts over time and the percentage lines genuinely
 *    fluctuate and cross — exactly what you'd see from real voting.
 *  - Those votes are aggregated into the app's hourly `trendSnapshots`
 *    buckets ({ timestamp, totalVotes, counts }). This is the same structure
 *    the live vote path writes, and it's readable + writable per the Firestore
 *    rules (the per-user `votes` docs can't be seeded because the rules only
 *    let a user write their own vote).
 *  - The poll's `choices[].count` and `totalVotes` are updated to match the
 *    final cumulative totals, so the chart's last point lands on the real
 *    displayed percentages.
 *
 * The randomness is deterministic per poll id, so re-running produces the same
 * history instead of drifting.
 *
 * Run with one of:
 *   $env:SEED_EMAIL="you@example.com"; $env:SEED_PASSWORD="yourpassword"; npm run seed:trend
 *   # or, if Anonymous sign-in is enabled:
 *   npm run seed:trend
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCcIgCadd9k1wAnt_YQ76IINQbY-ZnaAnE',
  authDomain: 'peopoll-8222e.firebaseapp.com',
  projectId: 'peopoll-8222e',
  storageBucket: 'peopoll-8222e.firebasestorage.app',
  messagingSenderId: '483681066380',
  appId: '1:483681066380:web:b852c4f12939e1d8b48aa9',
  measurementId: 'G-67Q21JL5JH'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_MS = 10 * DAY_MS; // how far back the synthetic history reaches

// Small deterministic PRNG so a poll's history is stable across runs.
function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The app's hourly bucket id: first 13 chars of the ISO string ("YYYY-MM-DDTHH").
function bucketIdFor(timeMs) {
  return new Date(timeMs).toISOString().slice(0, 13).replace(/:/g, '-');
}

// Builds a synthetic, fluctuating vote history for one poll and returns the
// hourly buckets plus the final per-choice totals.
function synthesiseHistory(poll) {
  const choices = poll.choices || [];
  if (choices.length < 2) {
    return null;
  }

  const rng = makeRng(String(poll.id));
  const now = Date.now();

  // Anchor the start to the poll's creation when it's recent, otherwise reach
  // back a fixed window so even old polls show a full trend.
  const createdAt = poll.createdAt?.toDate ? poll.createdAt.toDate().getTime() : null;
  const start = createdAt && now - createdAt < HISTORY_MS ? createdAt : now - HISTORY_MS;
  const span = Math.max(DAY_MS, now - start);

  // Total votes to synthesise (deterministic per poll).
  const voteCount = 60 + Math.floor(rng() * 140);

  // Each choice gets a base popularity and a phase so its share rises and
  // falls on its own schedule — that's what makes the lines cross over time.
  const profile = choices.map(() => ({
    base: 0.4 + rng() * 1.0,
    phase: rng() * Math.PI * 2,
    cycles: 1.2 + rng() * 2.3
  }));

  const counts = choices.map(() => 0);
  const buckets = new Map(); // bucketId -> { time, counts: {choiceId: n}, total }

  for (let i = 0; i < voteCount; i += 1) {
    // Bias vote times a little towards "now" so recent activity is denser,
    // while still covering the whole window.
    const u = Math.pow(rng(), 0.8); // 0 (old) .. 1 (recent), skewed recent
    const time = start + u * span;

    // Time-varying weight per choice.
    let totalWeight = 0;
    const weights = profile.map((p) => {
      const w = p.base * (1 + 0.7 * Math.sin(p.cycles * u * Math.PI * 2 + p.phase));
      const clamped = Math.max(0.05, w);
      totalWeight += clamped;
      return clamped;
    });

    // Weighted pick.
    let r = rng() * totalWeight;
    let choiceIdx = 0;
    for (let c = 0; c < weights.length; c += 1) {
      r -= weights[c];
      if (r <= 0) {
        choiceIdx = c;
        break;
      }
    }

    counts[choiceIdx] += 1;

    const id = bucketIdFor(time);
    const bucket = buckets.get(id) || { time, counts: {}, total: 0 };
    const choiceId = choices[choiceIdx].id;
    bucket.counts[choiceId] = (bucket.counts[choiceId] || 0) + 1;
    bucket.total += 1;
    bucket.time = Math.max(bucket.time, time); // represent bucket at its latest vote
    buckets.set(id, bucket);
  }

  return { buckets, counts, choices };
}

async function seed() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (email && password) {
    await signInWithEmailAndPassword(auth, email, password);
  } else {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      if (error?.code === 'auth/admin-restricted-operation' || error?.code === 'auth/operation-not-allowed') {
        throw new Error(
          'Anonymous sign-in is disabled. Either enable it in Firebase console ' +
            '(Authentication → Sign-in method → Anonymous), or set SEED_EMAIL and ' +
            'SEED_PASSWORD env vars to an existing email/password account.'
        );
      }
      throw error;
    }
  }

  const pollsSnap = await getDocs(collection(db, 'polls'));
  console.log(`Found ${pollsSnap.size} poll(s).`);

  let seeded = 0;
  for (const pollDoc of pollsSnap.docs) {
    const poll = { id: pollDoc.id, ...pollDoc.data() };
    const result = synthesiseHistory(poll);
    if (!result) {
      console.log(`Skipping "${poll.title || poll.id}" (needs at least 2 choices).`);
      continue;
    }

    const { buckets, counts, choices } = result;

    // Write the hourly trend buckets.
    for (const [bucketId, bucket] of buckets) {
      await setDoc(
        doc(db, 'polls', poll.id, 'trendSnapshots', bucketId),
        {
          timestamp: Timestamp.fromDate(new Date(bucket.time)),
          totalVotes: bucket.total,
          counts: bucket.counts
        },
        { merge: true }
      );
    }

    // Update the poll's totals so the chart converges on the real percentages.
    const updatedChoices = choices.map((choice, index) => ({ ...choice, count: counts[index] }));
    const totalVotes = counts.reduce((sum, value) => sum + value, 0);
    await updateDoc(doc(db, 'polls', poll.id), {
      choices: updatedChoices,
      totalVotes
    });

    seeded += 1;
    console.log(
      `Seeded "${poll.title || poll.id}" — ${totalVotes} votes across ${buckets.size} hourly buckets.`
    );
  }

  console.log(`Done. Seeded trend history for ${seeded} poll(s).`);
  process.exit(0);
}

seed().catch((error) => {
  console.error('Trend seeding failed:', error);
  process.exit(1);
});
