/**
 * One-off seed script: populates a few demo groups with members, posts and
 * group polls so the Groups feature has content to show.
 *
 * Run with one of:
 *   # Use an existing email/password account (recommended, no console changes):
 *   $env:SEED_EMAIL="you@example.com"; $env:SEED_PASSWORD="yourpassword"; npm run seed:groups
 *
 *   # Or, if Anonymous sign-in is enabled in Firebase Auth:
 *   npm run seed:groups
 *
 * Notes:
 *  - The signed-in account becomes each group's owner, which is what the
 *    Firestore rules require to write the member docs.
 *  - To create an email/password user: Firebase console → Authentication →
 *    Users → Add user (and enable the Email/Password provider).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  serverTimestamp
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

const GROUPS = [
  {
    name: 'Tech Talk',
    topic: 'Technology',
    description: 'Daily discussion about gadgets, software, and the future of computing.',
    members: [
      { name: 'Ava Chen', role: 'admin' },
      { name: 'Marcus Webb', role: 'member' },
      { name: 'Priya Nair', role: 'member' },
      { name: 'Diego Santos', role: 'coOwner' }
    ],
    posts: [
      { author: 'Ava Chen', text: 'Just tried the new on-device AI features — battery impact is smaller than expected.' },
      { author: 'Marcus Webb', text: 'What laptop is everyone using for travel these days? Looking for something light.' },
      { author: 'Diego Santos', text: 'Reminder: weekly build-in-public thread goes up every Friday. Share what you shipped!' }
    ],
    polls: [
      {
        author: 'Priya Nair',
        title: 'Which language should we use for the next community project?',
        description: 'Trying to pick a stack for the open-source weekend build.',
        choices: ['TypeScript', 'Python', 'Rust', 'Go']
      }
    ]
  },
  {
    name: 'Trail Runners',
    topic: 'Sports',
    description: 'For people who love hitting the trails — routes, gear, and race prep.',
    members: [
      { name: 'Noah Kim', role: 'admin' },
      { name: 'Sofia Rossi', role: 'member' },
      { name: 'Liam Patel', role: 'member' }
    ],
    posts: [
      { author: 'Noah Kim', text: 'Sunrise run on the ridge this morning was unreal. 12k and felt great.' },
      { author: 'Sofia Rossi', text: 'Any recommendations for trail shoes with good grip on wet rock?' }
    ],
    polls: [
      {
        author: 'Liam Patel',
        title: 'Best distance for our next group race?',
        description: 'Planning the autumn meetup run.',
        choices: ['5K', '10K', 'Half marathon', 'Ultra']
      }
    ]
  },
  {
    name: 'Home Cooks',
    topic: 'Lifestyle',
    description: 'Share recipes, swap tips, and show off what you made for dinner.',
    members: [
      { name: 'Grace Lee', role: 'coOwner' },
      { name: 'Tom Becker', role: 'member' },
      { name: 'Yuki Tanaka', role: 'admin' },
      { name: 'Omar Haddad', role: 'member' }
    ],
    posts: [
      { author: 'Grace Lee', text: 'Made a one-pot lemon orzo tonight — adding the recipe in the comments.' },
      { author: 'Yuki Tanaka', text: 'Weekly challenge: cook something using only 5 ingredients. Post your results!' },
      { author: 'Omar Haddad', text: 'My sourdough finally got a proper ear. Two years of trying paid off.' }
    ],
    polls: [
      {
        author: 'Tom Becker',
        title: 'What should the monthly cook-along theme be?',
        description: 'Vote for the cuisine we all cook together next month.',
        choices: ['Italian', 'Thai', 'Mexican', 'Indian']
      }
    ]
  }
];

function makeChoices(labels) {
  return labels.map((label, index) => ({ id: `choice-${index + 1}`, label, count: 0 }));
}

async function seed() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  let cred;
  if (email && password) {
    cred = await signInWithEmailAndPassword(auth, email, password);
  } else {
    try {
      cred = await signInAnonymously(auth);
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
  const ownerUid = cred.user.uid;
  const ownerName = 'Community Seeder';
  console.log(`Signed in as ${ownerUid}`);

  for (const group of GROUPS) {
    const groupRef = await addDoc(collection(db, 'groups'), {
      name: group.name,
      description: group.description,
      topic: group.topic,
      ownerId: ownerUid,
      ownerName,
      memberCount: 1 + group.members.length,
      createdAt: serverTimestamp()
    });
    const groupId = groupRef.id;

    // The seeder is the owner (required so it can write the other member docs).
    await setDoc(doc(db, 'groups', groupId, 'members', ownerUid), {
      uid: ownerUid,
      displayName: ownerName,
      role: 'owner',
      blocked: false,
      canComment: true,
      commentRequest: false,
      joinedAt: serverTimestamp()
    });

    // Demo members. Non-managers get comment access so the chat looks active.
    let memberIndex = 0;
    for (const member of group.members) {
      memberIndex += 1;
      const memberUid = `seed-${groupId}-${memberIndex}`;
      await setDoc(doc(db, 'groups', groupId, 'members', memberUid), {
        uid: memberUid,
        displayName: member.name,
        role: member.role,
        blocked: false,
        canComment: true,
        commentRequest: false,
        joinedAt: serverTimestamp()
      });
    }

    // Demo chat messages (authored by the seeder per security rules, but
    // labelled with the member's display name so the chat looks lively).
    for (const post of group.posts) {
      await addDoc(collection(db, 'groups', groupId, 'chat'), {
        authorId: ownerUid,
        authorName: post.author,
        text: post.text,
        createdAt: serverTimestamp()
      });
    }

    // Demo polls attached to this group.
    for (const poll of group.polls) {
      await addDoc(collection(db, 'polls'), {
        title: poll.title,
        description: poll.description,
        category: group.topic,
        choices: makeChoices(poll.choices),
        totalVotes: 0,
        authorId: ownerUid,
        authorName: poll.author,
        createdAt: serverTimestamp(),
        allowMultiple: false,
        expiresAt: null,
        groupId,
        groupName: group.name
      });
    }

    console.log(`Seeded group "${group.name}" (${groupId})`);
  }

  console.log('Done seeding groups.');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
