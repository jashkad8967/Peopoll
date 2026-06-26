import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Platform } from 'react-native';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseApp';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import PollCard from '../components/PollCard';
import PollModal from '../components/PollModal';
import {
  followUser,
  unfollowUser,
  subscribeFollowing,
  subscribeFollowers,
  subscribeUserProfile,
  subscribeMyActivity,
  upsertUserProfile
} from '../utils/social';
import { ensureChat } from '../utils/chat';
import { displayNameFor } from '../utils/account';
import { verifiedTypeLabel } from '../utils/social';
import VerifiedBadge from '../components/VerifiedBadge';

const SELF_TABS = [
  { key: 'created', label: 'Polls' },
  { key: 'voted', label: 'Voted' },
  { key: 'commented', label: 'Commented' },
  { key: 'liked', label: 'Liked' }
];

const ACTIVITY_TYPES = {
  voted: ['vote'],
  commented: ['comment', 'reply'],
  liked: ['like']
};

function avatarColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export default function ProfileScreen({ route, navigation }) {
  const { theme } = useTheme();
  const [me, setMe] = useState(auth.currentUser?.uid || null);
  const paramUid = route?.params?.uid || null;
  const uid = paramUid || me;
  const isSelf = !!uid && uid === me;

  const [profile, setProfile] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [myFollowing, setMyFollowing] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('created');
  const [activity, setActivity] = useState([]);
  const [pollCache, setPollCache] = useState({});

  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u?.uid || null)), []);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeUserProfile(uid, setProfile);
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    const unsubFollowers = subscribeFollowers(uid, setFollowers);
    const unsubFollowing = subscribeFollowing(uid, setFollowing);
    return () => {
      unsubFollowers();
      unsubFollowing();
    };
  }, [uid]);

  useEffect(() => {
    if (!me) {
      setMyFollowing([]);
      return undefined;
    }
    return subscribeFollowing(me, setMyFollowing);
  }, [me]);

  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'polls'), where('authorId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setPolls(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  const amFollowing = useMemo(() => myFollowing.includes(uid), [myFollowing, uid]);
  const totalVotes = useMemo(() => polls.reduce((sum, p) => sum + (p.totalVotes || 0), 0), [polls]);

  // Activity (votes/comments/likes) is private, only available for the signed-in user's own profile.
  useEffect(() => {
    if (!isSelf || !uid) {
      setActivity([]);
      return undefined;
    }
    return subscribeMyActivity(uid, setActivity);
  }, [isSelf, uid]);

  // For non-self profiles only the created tab is meaningful.
  useEffect(() => {
    if (!isSelf && activeTab !== 'created') setActiveTab('created');
  }, [isSelf, activeTab]);

  const interactionIds = useMemo(() => {
    const map = { voted: [], commented: [], liked: [] };
    const seen = { voted: new Set(), commented: new Set(), liked: new Set() };
    activity.forEach((a) => {
      Object.keys(ACTIVITY_TYPES).forEach((tab) => {
        if (ACTIVITY_TYPES[tab].includes(a.type) && a.pollId && !seen[tab].has(a.pollId)) {
          seen[tab].add(a.pollId);
          map[tab].push(a.pollId);
        }
      });
    });
    return map;
  }, [activity]);

  // Resolve poll docs referenced by interactions into a cache.
  useEffect(() => {
    const needed = new Set([...interactionIds.voted, ...interactionIds.commented, ...interactionIds.liked]);
    const missing = [...needed].filter((id) => !(id in pollCache));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'polls', id));
            return [id, snap.exists() ? { id, ...snap.data() } : null];
          } catch {
            return [id, null];
          }
        })
      );
      if (!cancelled) {
        setPollCache((prev) => {
          const next = { ...prev };
          entries.forEach(([id, val]) => {
            next[id] = val;
          });
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [interactionIds, pollCache]);

  const visiblePolls = useMemo(() => {
    if (activeTab === 'created') return polls;
    const ids = interactionIds[activeTab] || [];
    return ids.map((id) => pollCache[id]).filter(Boolean);
  }, [activeTab, polls, interactionIds, pollCache]);

  const name = profile?.displayName || (isSelf ? displayNameFor(auth.currentUser) : 'User');

  const handleFollowToggle = async () => {
    if (!uid || isSelf) return;
    setBusy(true);
    try {
      if (me) await upsertUserProfile(auth.currentUser);
      if (amFollowing) await unfollowUser(uid);
      else await followUser(uid);
    } catch (error) {
      console.warn('Follow toggle failed', error?.message || error);
    } finally {
      setBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!uid || isSelf) return;
    try {
      const chatId = await ensureChat(uid);
      navigation.navigate('Friends', { chatId, peerId: uid, peerName: name });
    } catch (error) {
      console.warn('Open chat failed', error?.message || error);
    }
  };

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (Platform.OS !== 'web') {
        await signInWithRedirect(auth, provider);
        return;
      }
      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        await signInWithRedirect(auth, provider);
      }
    } catch (error) {
      console.warn('Profile sign-in failed', error?.message || error);
    }
  };

  if (!uid) {
    return (
      <View style={[styles.gateWrap, { backgroundColor: theme.background }]}>
        <View style={[styles.gateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.gateTitle, { color: theme.text }]}>Sign in to view your profile</Text>
          <Text style={[styles.gateText, { color: theme.subtext }]}>
            Your profile shows the polls you create and the people you connect with. Sign in to get started.
          </Text>
          <TouchableOpacity style={[styles.gateBtn, { backgroundColor: theme.accent }]} onPress={handleSignIn}>
            <Text style={styles.gateBtnText}>Sign in with Google</Text>
          </TouchableOpacity>
          <View style={styles.gateLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('Home')}>
              <Text style={[styles.gateLink, { color: theme.accent }]}>Go to home</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Groups')}>
              <Text style={[styles.gateLink, { color: theme.accent }]}>Browse groups</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const header = (
    <View>
      <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.identityRow}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(name, theme.palette) }]}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: theme.text }]}>{polls.length}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>Polls</Text>
            </View>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => navigation.navigate('UserList', { uid, type: 'followers', title: 'Followers' })}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>{followers.length}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => navigation.navigate('UserList', { uid, type: 'following', title: 'Following' })}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>{following.length}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
          {profile?.verified ? <VerifiedBadge type={profile.verifiedType || profile.verificationType} size={20} /> : null}
        </View>
        {profile?.verified ? (
          <Text style={[styles.verifiedLabel, { color: theme.accent }]}>
            ✓ Verified {verifiedTypeLabel(profile.verifiedType || profile.verificationType).toLowerCase()}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.subtext }]}>
          {totalVotes.toLocaleString()} votes across {polls.length} poll{polls.length === 1 ? '' : 's'}
        </Text>
        {(profile?.country || profile?.region) ? (
          <Text style={[styles.meta, { color: theme.subtext }]}>
            📍 {[profile?.region, profile?.country].filter(Boolean).join(', ')}
          </Text>
        ) : null}
        {profile?.bio ? <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text> : null}

        {isSelf ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.messageBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => navigation.navigate('Settings')}>
              <Text style={[styles.messageText, { color: theme.text }]}>⚙ Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.followBtn, { backgroundColor: theme.accent, borderColor: theme.border }]} onPress={() => navigation.navigate('CreatePoll')}>
              <Text style={[styles.followText, { color: '#fff' }]}>+ New poll</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.followBtn, { backgroundColor: amFollowing ? theme.surfaceMuted : theme.accent, borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
              onPress={handleFollowToggle}
              disabled={busy}
            >
              <Text style={[styles.followText, { color: amFollowing ? theme.text : '#fff' }]}>
                {amFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.messageBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={handleMessage}>
              <Text style={[styles.messageText, { color: theme.text }]}>Message</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isSelf && (
        <View style={styles.tabRow}>
          {SELF_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accent : theme.surface }]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : theme.text }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {!isSelf ? 'Polls' : activeTab === 'created' ? 'Your polls' : activeTab === 'voted' ? 'Polls you voted on' : activeTab === 'commented' ? 'Polls you commented on' : 'Polls you liked'}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        contentContainerStyle={styles.container}
        data={loading ? [] : visiblePolls}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <PollCard poll={item} onPress={() => setActivePoll(item)} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={[styles.empty, { color: theme.subtext }]}>
              {activeTab === 'created' ? 'No polls created yet.' : 'Nothing here yet.'}
            </Text>
          )
        }
        showsVerticalScrollIndicator={false}
      />
      <PollModal pollId={activePoll?.id} initialPoll={activePoll} visible={!!activePoll} onClose={() => setActivePoll(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18
  },
  gateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  gateCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center'
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10
  },
  gateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20
  },
  gateBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  gateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  gateLinks: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 18
  },
  gateLink: {
    fontSize: 14,
    fontWeight: '700'
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 14
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800'
  },
  statsRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around'
  },
  stat: {
    alignItems: 'center'
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800'
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2
  },
  name: {
    fontSize: 20,
    fontWeight: '800'
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  verifiedLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  meta: {
    fontSize: 13,
    marginTop: 4
  },
  bio: {
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  followBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  followText: {
    fontWeight: '700',
    fontSize: 14
  },
  messageBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  messageText: {
    fontWeight: '700',
    fontSize: 14
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700'
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 30
  }
});
