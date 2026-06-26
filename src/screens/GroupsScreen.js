import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { auth } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { subscribeGroups } from '../utils/groups';

function groupColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export default function GroupsScreen({ navigation }) {
  const { theme } = useTheme();
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [me, setMe] = useState(auth.currentUser?.uid || null);

  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u?.uid || null)), []);
  useEffect(() => subscribeGroups(setGroups), []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) =>
      [g.name, g.topic, g.description].filter(Boolean).some((field) => field.toLowerCase().includes(term))
    );
  }, [groups, search]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
    >
      <View style={[styles.avatar, { backgroundColor: groupColor(item.name, theme.palette) }]}>
        <Text style={styles.avatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        {item.topic ? <Text style={[styles.topic, { color: theme.accent }]} numberOfLines={1}>{item.topic}</Text> : null}
        {item.description ? (
          <Text style={[styles.desc, { color: theme.subtext }]} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.subtext }]}>
          {(item.memberCount || 0).toLocaleString()} member{item.memberCount === 1 ? '' : 's'} · by {item.ownerName || 'Owner'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        contentContainerStyle={styles.container}
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <Text style={[styles.heading, { color: theme.text }]}>Groups</Text>
            <Text style={[styles.subheading, { color: theme.subtext }]}>
              Follow topics you care about and contribute posts. Admins keep each group on-topic.
            </Text>
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.accent }]}
              onPress={() => navigation.navigate('CreateGroup')}
            >
              <Text style={styles.createBtnText}>+ Create a group</Text>
            </TouchableOpacity>
            <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TextInput
                placeholder="Search groups"
                placeholderTextColor={theme.placeholder}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.subtext }]}>No groups yet. Be the first to create one.</Text>
        }
        showsVerticalScrollIndicator={false}
      />
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
  heading: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16
  },
  createBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  searchBar: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 18
  },
  searchInput: {
    fontSize: 15,
    paddingVertical: 9
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800'
  },
  name: {
    fontSize: 16,
    fontWeight: '800'
  },
  topic: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 30
  }
});
