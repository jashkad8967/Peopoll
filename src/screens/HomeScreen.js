import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseApp';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import PollCard from '../components/PollCard';
import CategoryPill from '../components/CategoryPill';
import { useTheme } from '../theme/ThemeContext';

export default function HomeScreen({ navigation }) {
  const { theme } = useTheme();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    const pollsQuery = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      pollsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPolls(items);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load polls', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const categories = useMemo(() => {
    const available = new Set();
    polls.forEach((poll) => {
      const label = poll.category?.trim() || 'General';
      if (label) {
        available.add(label);
      }
    });
    return ['All', 'Trending', ...Array.from(available).filter((label) => label !== 'Trending')];
  }, [polls]);

  const filteredPolls = useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    return polls
      .filter((poll) => {
        if (selectedCategory === 'All') {
          return true;
        }
        if (selectedCategory === 'Trending') {
          return (poll.totalVotes || 0) >= 5;
        }
        return (poll.category || 'General').toLowerCase() === selectedCategory.toLowerCase();
      })
      .filter((poll) => {
        if (!queryText) return true;
        return [poll.title, poll.description, poll.category]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(queryText));
      })
      .sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
  }, [polls, searchQuery, selectedCategory]);

  const renderItem = ({ item }) => (
    <PollCard poll={item} onPress={() => navigation.navigate('PollDetail', { pollId: item.id })} />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <View style={styles.heroText}>
          <Text style={[styles.title, { color: theme.text }]}>Discover public opinion</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>Search polls, explore categories, and surface the most relevant conversations.</Text>
        </View>
        <TouchableOpacity style={[styles.heroButton, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('Featured')}>
          <Text style={[styles.heroButtonText, { color: theme.card }]}>Featured</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <TextInput
          placeholder="Search polls, categories, or topics"
          placeholderTextColor={theme.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
        {categories.map((category) => (
          <CategoryPill
            key={category}
            label={category}
            selected={category === selectedCategory}
            onPress={() => setSelectedCategory(category)}
          />
        ))}
      </ScrollView>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('CreatePoll')}>
          <Text style={[styles.actionButtonText, { color: theme.card }]}>Create poll</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: user ? theme.secondary : theme.accentSoft }]}
          onPress={async () => {
            if (user) {
              await signOut(auth);
              return;
            }
            try {
              const provider = new GoogleAuthProvider();
              await signInWithPopup(auth, provider);
            } catch (e) {
              console.error('Sign-in failed', e);
            }
          }}
        >
          <Text style={[styles.actionButtonText, { color: user ? theme.card : theme.accent }]}>{user ? 'Sign out' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : filteredPolls.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No matching polls</Text>
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>Try a broader category, remove the search term, or publish a new poll for your audience.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPolls}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18
  },
  hero: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  heroText: {
    flex: 1,
    paddingRight: 14
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24
  },
  heroButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  heroButtonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  searchBar: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  searchInput: {
    fontSize: 16,
    fontWeight: '500'
  },
  categoryList: {
    paddingBottom: 18,
    paddingHorizontal: 2
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  loader: {
    marginTop: 48
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8
  },
  emptySubtitle: {
    textAlign: 'center',
    maxWidth: 300,
    fontSize: 15,
    lineHeight: 22
  },
  list: {
    paddingBottom: 28
  }
});
