import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import {
  subscribeFollowers,
  subscribeFollowing,
  subscribeFriends,
  followUser,
  unfollowUser,
  upsertUserProfile
} from '../utils/social';

function avatarColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export default function UserListScreen({ route, navigation }) {
  const { theme } = useTheme();
  const uid = route?.params?.uid || null;
  const type = route?.params?.type || 'followers';

  const [me, setMe] = useState(auth.currentUser?.uid || null);
  const [ids, setIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState([]);

  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u?.uid || null)), []);

  useEffect(() => {
    if (!me) {
      setMyFollowing([]);
      return undefined;
    }
    return subscribeFollowing(me, setMyFollowing);
  }, [me]);

  useEffect(() => {
    if (!uid) return undefined;
    const subscribe = type === 'following' ? subscribeFollowing : type === 'friends' ? subscribeFriends : subscribeFollowers;
    return subscribe(uid, setIds);
  }, [uid, type]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'users', id));
            return snap.exists() ? { id, ...snap.data() } : { id, displayName: `User ${id.slice(0, 4)}` };
          } catch {
            return { id, displayName: `User ${id.slice(0, 4)}` };
          }
        })
      );
      if (!cancelled) {
        setUsers(results);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const toggleFollow = async (targetUid) => {
    try {
      if (me) await upsertUserProfile(auth.currentUser);
      if (myFollowing.includes(targetUid)) await unfollowUser(targetUid);
      else await followUser(targetUid);
    } catch (error) {
      console.warn('Follow failed', error?.message || error);
    }
  };

  const renderItem = ({ item }) => {
    const name = item.displayName || `User ${item.id.slice(0, 4)}`;
    const isFollowing = myFollowing.includes(item.id);
    const isMe = item.id === me;
    return (
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity style={styles.rowMain} onPress={() => navigation.navigate('Profile', { uid: item.id })}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(name, theme.palette) }]}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{name}{isMe ? ' (you)' : ''}</Text>
            <Text style={[styles.sub, { color: theme.subtext }]} numberOfLines={1}>
              {item.bio || (item.isAnonymous ? 'Guest' : 'Tap to view profile')}
            </Text>
          </View>
        </TouchableOpacity>
        {!isMe && (
          <TouchableOpacity
            style={[styles.followBtn, { backgroundColor: isFollowing ? theme.surfaceMuted : theme.accent, borderColor: theme.border }]}
            onPress={() => toggleFollow(item.id)}
          >
            <Text style={[styles.followText, { color: isFollowing ? theme.text : '#fff' }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        contentContainerStyle={styles.container}
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 30 }} />
          ) : (
            <Text style={[styles.empty, { color: theme.subtext }]}>No people to show yet.</Text>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  name: {
    fontSize: 15,
    fontWeight: '700'
  },
  sub: {
    fontSize: 12,
    marginTop: 2
  },
  followBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1
  },
  followText: {
    fontSize: 13,
    fontWeight: '700'
  },
  empty: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14
  }
});
