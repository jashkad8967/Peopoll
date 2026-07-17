/**
 * Comprehensive, self-consistent seed script (Firebase Admin SDK).
 *
 * What it creates — and why it "all matches up":
 *  - A roster of realistic, SEARCHABLE users (real-sounding names, bios,
 *    countries/regions). Search works because each profile carries a
 *    `nameLower` field, exactly like the live app writes.
 *  - A set of realistic standalone polls authored BY those roster users.
 *  - For EVERY poll in the project (the new ones AND any pre-existing group
 *    polls), one real vote per real user: a distinct `votes/{uid}` document
 *    for a distinct roster user, each with its own timestamp. No phantom
 *    votes — `totalVotes` === number of vote docs === sum of `choices[].count`
 *    === sum across the hourly `trendSnapshots` buckets.
 *  - Timestamps are varied and realistic: users are created over the past few
 *    months, polls over the past few weeks, and each vote lands at its own
 *    moment after its poll was created, so the trend charts genuinely
 *    fluctuate.
 *
 * Why the Admin SDK: the Firestore security rules only let a signed-in client
 * write ITS OWN user document and ITS OWN vote. Creating many distinct users
 * and a vote per user is only possible with admin (server) credentials, which
 * bypass rules. This script is meant to be run locally by a project owner.
 *
 * Credentials (pick one):
 *   1. Place a service-account key at scripts/serviceAccountKey.json
 *      (Firebase console → Project settings → Service accounts → Generate key).
 *   2. Or set GOOGLE_APPLICATION_CREDENTIALS to the key file path and run.
 *
 * Run:
 *   npm install          # first time, to install firebase-admin
 *   npm run seed:data
 *
 * The output is deterministic: re-running produces the same users, voters and
 * timestamps (vote docs are keyed by uid, trend buckets by hour), so it is safe
 * to run more than once without inflating counts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'peopoll-8222e';
const __dirname = dirname(fileURLToPath(import.meta.url));

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Deterministic PRNG (so a run is reproducible and idempotent).
// ---------------------------------------------------------------------------
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

// Fisher–Yates shuffle driven by a seeded RNG.
function shuffle(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// The app's hourly trend bucket id: "YYYY-MM-DDTHH" with ':' replaced by '-'.
function bucketIdFor(timeMs) {
  return new Date(timeMs).toISOString().slice(0, 13).replace(/:/g, '-');
}

// ---------------------------------------------------------------------------
// Realistic roster building blocks.
// ---------------------------------------------------------------------------
const FULL_NAMES = [
  'Emma Thompson', 'Liam Walsh', 'Olivia Bennett', 'Noah Fischer', 'Ava Morales',
  'Ethan Nakamura', 'Sophia Rossi', 'Mason Clarke', 'Isabella Costa', 'Lucas Meyer',
  'Mia Anderson', 'Aiden O’Brien', 'Amelia Novak', 'Elijah Brooks', 'Harper Reyes',
  'James Sullivan', 'Evelyn Zhang', 'Benjamin Park', 'Abigail Dubois', 'Sebastian Vega',
  'Aisha Rahman', 'Mateo García', 'Priya Nair', 'Kenji Watanabe', 'Sofia Jansen',
  'Omar Haddad', 'Yuki Tanaka', 'Diego Santos', 'Zara Khan', 'Nikolai Petrov',
  'Fatima Alvi', 'Grace Lee', 'Chen Wei', 'Ananya Iyer', 'Kwame Mensah',
  'Ingrid Larsen', 'Ravi Kapoor', 'Elena Popescu', 'Tariq Nasser', 'Mei Lin',
  'Daniel Okafor', 'Chloe Dubois', 'Marcus Webb', 'Nadia Haas', 'Victor Almeida',
  'Lena Schmidt', 'Hassan Ali', 'Camila Ortiz', 'Theo Laurent', 'Aria Kapadia',
  'Oscar Lindqvist', 'Freya Nielsen', 'Ibrahim Farouk', 'Julia Kowalski', 'Andre Moreau',
  'Sana Malik', 'Felix Braun', 'Rosa Delgado', 'Yara Haddad', 'Dmitri Volkov',
  'Hana Kim', 'Leo Ferrari', 'Naomi Adeyemi', 'Paul Novak'
];

const LOCATIONS = [
  { country: 'United States', region: 'California' },
  { country: 'United States', region: 'New York' },
  { country: 'United Kingdom', region: 'England' },
  { country: 'Canada', region: 'Ontario' },
  { country: 'Australia', region: 'New South Wales' },
  { country: 'Germany', region: 'Bavaria' },
  { country: 'France', region: 'Île-de-France' },
  { country: 'India', region: 'Maharashtra' },
  { country: 'Japan', region: 'Tokyo' },
  { country: 'Brazil', region: 'São Paulo' },
  { country: 'Spain', region: 'Catalonia' },
  { country: 'Nigeria', region: 'Lagos' },
  { country: 'South Africa', region: 'Gauteng' },
  { country: 'Mexico', region: 'Jalisco' },
  { country: 'Netherlands', region: 'North Holland' },
  { country: 'Sweden', region: 'Stockholm' }
];

const BIOS = [
  'Coffee enthusiast and weekend hiker.',
  'Product designer who loves a clean interface.',
  'Always up for a good, respectful debate.',
  'Sharing the opinions that actually matter.',
  'Sports fanatic and casual gamer.',
  'Foodie exploring one recipe at a time.',
  'Tech optimist and lifelong learner.',
  'Here for the polls and the people.',
  'Photographer chasing the golden hour.',
  'Music, books, and long walks.',
  'Startup builder fuelled by espresso.',
  'Curious mind, honest votes.',
  'Teacher by day, trivia champion by night.',
  'Cyclist, reader, and amateur chef.',
  'Just trying to make better decisions together.',
  'Data nerd with a soft spot for good design.'
];

// Build the roster of realistic user documents.
function buildRoster() {
  const now = Date.now();
  return FULL_NAMES.map((name, index) => {
    const rng = makeRng(`user-${index}-${name}`);
    const uid = `seed-user-${String(index + 1).padStart(3, '0')}`;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    const location = LOCATIONS[index % LOCATIONS.length];
    // Accounts created between ~10 and ~200 days ago.
    const createdAt = now - Math.floor((10 + rng() * 190) * DAY_MS);
    return {
      uid,
      displayName: name,
      nameLower: name.toLowerCase(),
      email: `${slug}@example.com`,
      photoURL: null,
      phoneNumber: null,
      isAnonymous: false,
      bio: BIOS[(index * 7) % BIOS.length],
      country: location.country,
      region: location.region,
      createdAtMs: createdAt
    };
  });
}

// ---------------------------------------------------------------------------
// Realistic standalone polls (authored by roster users).
// ---------------------------------------------------------------------------
const POLL_TEMPLATES = [
  {
    category: 'Technology',
    title: 'Which everyday device could you least live without?',
    description: 'Be honest — which one would you struggle the most without for a week?',
    choices: ['Smartphone', 'Laptop', 'Headphones', 'Smartwatch']
  },
  {
    category: 'Technology',
    title: 'Should AI assistants be allowed to write news articles?',
    description: 'With editorial oversight or not at all?',
    choices: ['Yes, with oversight', 'No, humans only', 'Only for summaries', 'Unsure']
  },
  {
    category: 'Politics',
    title: 'What issue should your local government prioritise this year?',
    description: 'Pick the one you feel matters most where you live.',
    choices: ['Housing', 'Public transport', 'Healthcare', 'Education']
  },
  {
    category: 'Politics',
    title: 'Should voting be made mandatory?',
    description: 'A long-running debate — where do you land?',
    choices: ['Yes', 'No', 'Only in national elections']
  },
  {
    category: 'Sports',
    title: 'Best sport to watch live in a stadium?',
    description: 'Nothing beats being there — but which one?',
    choices: ['Football', 'Basketball', 'Tennis', 'Athletics']
  },
  {
    category: 'Sports',
    title: 'Morning or evening workouts?',
    description: 'When do you actually get your best training in?',
    choices: ['Early morning', 'Lunchtime', 'Evening', 'It varies']
  },
  {
    category: 'Lifestyle',
    title: 'Ideal way to spend a free Saturday?',
    description: 'Your perfect low-pressure day off.',
    choices: ['Outdoors', 'Reading at home', 'Meeting friends', 'A new hobby']
  },
  {
    category: 'Lifestyle',
    title: 'Coffee or tea to start the day?',
    description: 'The eternal morning question.',
    choices: ['Coffee', 'Tea', 'Neither', 'Both']
  },
  {
    category: 'Entertainment',
    title: 'What do you watch most these days?',
    description: 'Where does your screen time actually go?',
    choices: ['Streaming series', 'Films', 'Short videos', 'Live sport']
  },
  {
    category: 'Entertainment',
    title: 'Best format for discovering new music?',
    description: 'How do you find the songs you love?',
    choices: ['Playlists', 'Friends', 'Radio', 'Live shows']
  },
  {
    category: 'Business',
    title: 'Remote, hybrid, or in-office — what works best?',
    description: 'For the kind of work you do.',
    choices: ['Fully remote', 'Hybrid', 'In-office', 'Depends on the role']
  },
  {
    category: 'Business',
    title: 'What matters most when choosing where to work?',
    description: 'Beyond salary — what tips the balance?',
    choices: ['Pay', 'Flexibility', 'Growth', 'Team culture']
  },
  {
    category: 'News',
    title: 'Where do you get most of your news?',
    description: 'Your main source on a typical day.',
    choices: ['Social media', 'News apps', 'TV', 'Podcasts']
  },
  {
    category: 'Lifestyle',
    title: 'How many hours of sleep do you actually get?',
    description: 'On an average weeknight — no judgment.',
    choices: ['Under 6', '6–7', '7–8', 'More than 8']
  }
];

function makeChoices(labels) {
  return labels.map((label, index) => ({ id: `choice-${index + 1}`, label, count: 0 }));
}

// ---------------------------------------------------------------------------
// Vote synthesis: assign a real roster user to each vote, with its own time.
// Returns { voters:[{uid, choiceId, timeMs}], counts:[], buckets:Map }.
// ---------------------------------------------------------------------------
function synthesiseVotes(pollId, choices, createdAtMs, roster) {
  const rng = makeRng(`votes-${pollId}`);
  const now = Date.now();
  const start = Math.min(createdAtMs, now - DAY_MS);
  const span = Math.max(DAY_MS, now - start);

  // One vote per distinct user, so the ballot cannot exceed the roster size.
  const maxVoters = Math.min(roster.length, 55);
  const voteCount = Math.max(12, Math.min(maxVoters, 18 + Math.floor(rng() * (maxVoters - 18))));
  const voterPool = shuffle(roster, rng).slice(0, voteCount);

  // Each choice rises and falls on its own cycle so the lines cross over time.
  const profile = choices.map(() => ({
    base: 0.4 + rng() * 1.0,
    phase: rng() * Math.PI * 2,
    cycles: 1.2 + rng() * 2.3
  }));

  const counts = choices.map(() => 0);
  const buckets = new Map();
  const voters = [];
  const usedTimes = new Set();

  voterPool.forEach((user) => {
    // Skew vote times towards "now" so recent activity is denser.
    const u = Math.pow(rng(), 0.8);
    let time = Math.round(start + u * span);
    while (usedTimes.has(time)) time += 1000; // guarantee distinct timestamps
    usedTimes.add(time);

    let totalWeight = 0;
    const weights = profile.map((p) => {
      const w = p.base * (1 + 0.7 * Math.sin(p.cycles * u * Math.PI * 2 + p.phase));
      const clamped = Math.max(0.05, w);
      totalWeight += clamped;
      return clamped;
    });

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
    const choiceId = choices[choiceIdx].id;
    voters.push({ uid: user.uid, choiceId, timeMs: time });

    const id = bucketIdFor(time);
    const bucket = buckets.get(id) || { time, counts: {}, total: 0 };
    bucket.counts[choiceId] = (bucket.counts[choiceId] || 0) + 1;
    bucket.total += 1;
    bucket.time = Math.max(bucket.time, time);
    buckets.set(id, bucket);
  });

  return { voters, counts, buckets };
}

// ---------------------------------------------------------------------------
// A tiny batched-write queue (Firestore caps batches at 500 operations).
// ---------------------------------------------------------------------------
function createWriter(db) {
  let batch = db.batch();
  let ops = 0;
  const flushes = [];
  const maybeFlush = () => {
    if (ops >= 450) {
      flushes.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };
  return {
    set(ref, data, options) {
      if (options) batch.set(ref, data, options);
      else batch.set(ref, data);
      ops += 1;
      maybeFlush();
    },
    async done() {
      if (ops > 0) flushes.push(batch.commit());
      await Promise.all(flushes);
    }
  };
}

function initAdmin() {
  try {
    const keyPath = join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || PROJECT_ID });
  } catch (fileError) {
    if (fileError.code !== 'ENOENT') {
      throw fileError;
    }
    // Fall back to GOOGLE_APPLICATION_CREDENTIALS / application default creds.
    try {
      return initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    } catch (adcError) {
      throw new Error(
        'No admin credentials found. Add scripts/serviceAccountKey.json (Firebase ' +
          'console → Project settings → Service accounts → Generate new private key), ' +
          'or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.\n' +
          `Underlying error: ${adcError.message}`
      );
    }
  }
}

async function seed() {
  initAdmin();
  const db = getFirestore();
  const writer = createWriter(db);

  // 1) Realistic, searchable users.
  const roster = buildRoster();
  roster.forEach((user) => {
    const { createdAtMs, ...profile } = user;
    writer.set(
      db.collection('users').doc(user.uid),
      {
        ...profile,
        preferences: {},
        createdAt: Timestamp.fromDate(new Date(createdAtMs)),
        updatedAt: Timestamp.fromDate(new Date(createdAtMs + DAY_MS))
      },
      { merge: true }
    );
  });
  console.log(`Prepared ${roster.length} realistic users.`);

  // 2) Standalone polls authored by roster users, with varied creation times.
  const now = Date.now();
  const createdPolls = [];
  POLL_TEMPLATES.forEach((template, index) => {
    const rng = makeRng(`poll-${index}-${template.title}`);
    const author = roster[(index * 5 + 3) % roster.length];
    const createdAtMs = now - Math.floor((1 + rng() * 27) * DAY_MS);
    const pollRef = db.collection('polls').doc();
    createdPolls.push({
      ref: pollRef,
      id: pollRef.id,
      choices: makeChoices(template.choices),
      createdAtMs,
      base: {
        title: template.title,
        description: template.description,
        category: template.category,
        authorId: author.uid,
        authorName: author.displayName,
        createdAt: Timestamp.fromDate(new Date(createdAtMs)),
        allowMultiple: false,
        expiresAt: null,
        groupId: null,
        groupName: null
      }
    });
  });

  // 3) Pull in any pre-existing polls (e.g. group polls) so ALL data matches up.
  const existingSnap = await db.collection('polls').get();
  const existingPolls = existingSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAtMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : now - 14 * DAY_MS;
    return {
      ref: docSnap.ref,
      id: docSnap.id,
      choices: (data.choices || []).map((choice, i) => ({
        id: choice.id || `choice-${i + 1}`,
        label: choice.label,
        count: 0
      })),
      createdAtMs,
      base: null // already exists; only refresh counts/trends
    };
  });

  const allPolls = [...createdPolls, ...existingPolls];
  let totalVotesWritten = 0;

  for (const poll of allPolls) {
    if (poll.choices.length < 2) {
      if (poll.base) {
        // A brand-new poll must still be written even if it can't be voted on.
        writer.set(poll.ref, { ...poll.base, choices: poll.choices, totalVotes: 0 });
      }
      continue;
    }

    const { voters, counts, buckets } = synthesiseVotes(poll.id, poll.choices, poll.createdAtMs, roster);
    const totalVotes = counts.reduce((sum, value) => sum + value, 0);
    const votedChoices = poll.choices.map((choice, i) => ({ ...choice, count: counts[i] }));

    // Poll doc: create fresh ones fully; only update counts on existing ones.
    if (poll.base) {
      writer.set(poll.ref, { ...poll.base, choices: votedChoices, totalVotes });
    } else {
      writer.set(poll.ref, { choices: votedChoices, totalVotes }, { merge: true });
    }

    // One real vote document per real user, each with its own timestamp.
    voters.forEach((vote) => {
      writer.set(
        poll.ref.collection('votes').doc(vote.uid),
        {
          userId: vote.uid,
          choiceId: vote.choiceId,
          votedAt: Timestamp.fromDate(new Date(vote.timeMs))
        },
        { merge: true }
      );
    });

    // Hourly trend buckets (per-hour deltas), consistent with the vote totals.
    for (const [bucketId, bucket] of buckets) {
      writer.set(
        poll.ref.collection('trendSnapshots').doc(bucketId),
        {
          timestamp: Timestamp.fromDate(new Date(bucket.time)),
          totalVotes: bucket.total,
          counts: bucket.counts
        },
        { merge: true }
      );
    }

    totalVotesWritten += totalVotes;
    console.log(
      `Poll "${poll.base ? poll.base.title : poll.id}" — ${totalVotes} votes from ${voters.length} distinct users.`
    );
  }

  await writer.done();
  console.log(
    `\nDone. ${roster.length} users, ${createdPolls.length} new polls, ` +
      `${allPolls.length} polls total, ${totalVotesWritten} real votes (one user each).`
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
