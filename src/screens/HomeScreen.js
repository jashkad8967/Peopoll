import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseApp';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import PollCard from '../components/PollCard';

export default function HomeScreen({ navigation }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const pollsQuery = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(pollsQuery, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPolls(items);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load polls', error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const renderItem = ({ item }) => (
    <PollCard poll={item} onPress={() => navigation.navigate('PollDetail', { pollId: item.id })} />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trending polls</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('CreatePoll')}>
            <Text style={styles.addButtonText}>Create</Text>
          </TouchableOpacity>
          {user ? (
            <TouchableOpacity style={[styles.addButton, { backgroundColor: '#ef4444' }]} onPress={() => signOut(auth)}>
              <Text style={styles.addButtonText}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: '#0ea5e9' }]}
              onPress={async () => {
                try {
                  const provider = new GoogleAuthProvider();
                  await signInWithPopup(auth, provider);
                } catch (e) {
                  console.error('Sign-in failed', e);
                  // Let the user continue as guest; show console message.
                }
              }}
            >
              <Text style={styles.addButtonText}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1d4ed8" style={styles.loader} />
      ) : polls.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No polls yet</Text>
          <Text style={styles.emptySubtitle}>Create the first public opinion poll and invite people to vote.</Text>
        </View>
      ) : (
        <FlatList
          data={polls}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f3f4f6'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  title: {
    fontSize: 24,
    fontWeight: '700'
  },
  addButton: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700'
  },
  loader: {
    marginTop: 48
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8
  },
  emptySubtitle: {
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 280
  },
  list: {
    paddingBottom: 24
  }
});
