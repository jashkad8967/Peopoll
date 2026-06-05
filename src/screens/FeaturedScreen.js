import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import PollCard from '../components/PollCard';
import { useTheme } from '../theme/ThemeContext';

export default function FeaturedScreen({ navigation }) {
  const { theme } = useTheme();
  const [featuredPolls, setFeaturedPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pollsQuery = query(collection(db, 'polls'), orderBy('totalVotes', 'desc'), limit(8));
    const unsubscribe = onSnapshot(
      pollsQuery,
      (snapshot) => {
        setFeaturedPolls(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Featured polls failed to load', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const topCategories = useMemo(() => {
    const counts = featuredPolls.reduce((acc, poll) => {
      const key = poll.category || 'General';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([category, value]) => ({ category, value })).slice(0, 4);
  }, [featuredPolls]);

  const renderItem = ({ item }) => (
    <PollCard poll={item} onPress={() => navigation.navigate('PollDetail', { pollId: item.id })} />
  );

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.hero}>
        <Text style={[styles.heroTitle, { color: theme.text }]}>Featured polls</Text>
        <Text style={[styles.heroSubtitle, { color: theme.subtext }]}>Curated by community activity and public interest.</Text>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.summaryHeading, { color: theme.text }]}>Your pulse check</Text>
        <Text style={[styles.summaryBody, { color: theme.subtext }]}>Top-ranked polls are shown here to make exploration fast and intuitive.</Text>
      </View>

      <View style={styles.categoryOverview}>
        {topCategories.map((item) => (
          <View key={item.category} style={[styles.categoryBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={[styles.categoryLabel, { color: theme.text }]}>{item.category}</Text>
            <Text style={[styles.categoryValue, { color: theme.accent }]}>{item.value} poll{item.value === 1 ? '' : 's'}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : featuredPolls.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No featured polls yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>Start by publishing polls and watch the community elevate the best topics.</Text>
        </View>
      ) : (
        <FlatList
          data={featuredPolls}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 28
  },
  hero: {
    marginBottom: 20
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18
  },
  summaryHeading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6
  },
  summaryBody: {
    lineHeight: 22,
    fontSize: 15
  },
  categoryOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 14
  },
  categoryBadge: {
    flexGrow: 1,
    minWidth: '45%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4
  },
  categoryValue: {
    fontSize: 22,
    fontWeight: '800'
  },
  loader: {
    marginTop: 60
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
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22
  },
  list: {
    paddingBottom: 30
  },
  separator: {
    height: 16
  }
});
