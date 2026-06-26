import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import PollCard from '../components/PollCard';
import PollModal from '../components/PollModal';
import { useTheme } from '../theme/ThemeContext';

function rankPoll(poll) {
  const createdAt = poll.createdAt?.toDate ? poll.createdAt.toDate() : null;
  const ageHours = createdAt ? Math.max(1, (Date.now() - createdAt.getTime()) / 3600000) : 72;
  return (poll.totalVotes || 0) * 2 + Math.max(0, 72 - ageHours);
}

export default function ForYouScreen({ navigation }) {
  const { theme } = useTheme();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePoll, setActivePoll] = useState(null);

  useEffect(() => {
    const pollsQuery = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      pollsQuery,
      (snapshot) => {
        setPolls(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('For You polls failed to load', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const rankedPolls = useMemo(() => [...polls].sort((left, right) => rankPoll(right) - rankPoll(left)), [polls]);

  const renderPollBlock = (item) => (
    <PollCard poll={item} onPress={() => setActivePoll(item)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        data={loading ? [] : rankedPolls}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderPollBlock(item)}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>For you</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>A ranked feed that prioritizes active polls, fresh topics, and conversations picking up momentum.</Text>
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator size="large" color={theme.accent} style={styles.loader} /> : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
      <PollModal
        pollId={activePoll?.id}
        initialPoll={activePoll}
        visible={!!activePoll}
        onClose={() => setActivePoll(null)}
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
  header: {
    marginBottom: 18
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22
  },
  loader: {
    marginTop: 48
  },
  separator: {
    height: 2
  }
});