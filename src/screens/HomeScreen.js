import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, FlatList, useWindowDimensions } from 'react-native';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import PollCard from '../components/PollCard';
import PollModal from '../components/PollModal';
import { useTheme } from '../theme/ThemeContext';
import { useDrawer } from '../navigation/DrawerContext';
import { DAY_MS } from '../utils/trendSimulation';
import { subscribeFriends, subscribeRecentFeed } from '../utils/social';

function rankPoll(poll) {
  const createdAt = poll.createdAt?.toDate ? poll.createdAt.toDate() : null;
  const ageHours = createdAt ? Math.max(1, (Date.now() - createdAt.getTime()) / 3600000) : 72;
  return (poll.totalVotes || 0) * 2 + Math.max(0, 72 - ageHours);
}

function timeAgo(value) {
  const date = value?.toDate ? value.toDate() : null;
  if (!date) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function avatarColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export default function HomeScreen({ navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;
  const { openDrawer, selectedCategory, selectCategory } = useDrawer();

  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePoll, setActivePoll] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [me, setMe] = useState(auth.currentUser?.uid || null);
  const [friends, setFriends] = useState([]);
  const [recentFeed, setRecentFeed] = useState([]);

  useEffect(() => {
    // Cap the feed so we don't download the entire polls collection on every
    // load — fewer Firestore reads, less bandwidth, and a lighter render.
    const pollsQuery = query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(
      pollsQuery,
      (snapshot) => {
        setPolls(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load polls', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u?.uid || null)), []);

  useEffect(() => subscribeRecentFeed(DAY_MS, setRecentFeed), []);

  useEffect(() => {
    if (!me) {
      setFriends([]);
      return undefined;
    }
    return subscribeFriends(me, setFriends);
  }, [me]);

  const pollsById = useMemo(() => {
    const map = {};
    polls.forEach((poll) => { map[poll.id] = poll; });
    return map;
  }, [polls]);

  const forYouPolls = useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    return polls
      .filter((poll) => !poll.groupId)
      .filter((poll) => {
        if (selectedCategory === 'All') return true;
        if (selectedCategory === 'Trending') return (poll.totalVotes || 0) >= 5;
        return (poll.category || 'General').toLowerCase() === selectedCategory.toLowerCase();
      })
      .filter((poll) => {
        if (!queryText) return true;
        return [poll.title, poll.description, poll.category].filter(Boolean).some((field) => field.toLowerCase().includes(queryText));
      })
      .sort((a, b) => rankPoll(b) - rankPoll(a));
  }, [polls, searchQuery, selectedCategory]);

  const trendingPolls = useMemo(
    () => polls.filter((poll) => !poll.groupId).sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0)).slice(0, 8),
    [polls]
  );

  // Most interacted-with creators today: aggregate the global activity feed by
  // the author of the poll each interaction targeted.
  const topCreators = useMemo(() => {
    const counts = {};
    recentFeed.forEach((entry) => {
      const authorId = pollsById[entry.pollId]?.authorId;
      if (!authorId) return;
      counts[authorId] = (counts[authorId] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => {
        const sample = polls.find((p) => p.authorId === id);
        const name = sample?.authorName || `User ${id.slice(0, 4)}`;
        return { id, count, name };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [recentFeed, pollsById, polls]);

  const friendPolls = useMemo(() => {
    const friendSet = new Set(friends);
    return polls
      .filter((poll) => friendSet.has(poll.authorId))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      .slice(0, 5);
  }, [polls, friends]);

  const renderRail = () => (
    <View style={[styles.rightRail, isWide ? styles.rightRailWide : styles.rightRailNarrow]}>
      {/* Trending */}
      <View style={[styles.railCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.railOverline, { color: theme.accentPink }]}>🔥 Trending now</Text>
        <Text style={[styles.railTitle, { color: theme.text }]}>Most voted polls</Text>
        {trendingPolls.length === 0 ? (
          <Text style={[styles.railEmpty, { color: theme.subtext }]}>No polls yet.</Text>
        ) : (
          trendingPolls.map((poll, index) => (
            <TouchableOpacity key={poll.id} style={styles.trendRow} onPress={() => setActivePoll(poll)}>
              <Text style={[styles.trendRank, { color: theme.accent }]}>{index + 1}</Text>
              <Text style={[styles.trendTitle, { color: theme.text }]} numberOfLines={2}>{poll.title}</Text>
              <Text style={[styles.trendVotes, { color: theme.subtext }]}>{(poll.totalVotes || 0).toLocaleString()}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Top creators today */}
      <View style={[styles.railCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.railOverline, { color: theme.accentTeal }]}>⭐ Top creators today</Text>
        <Text style={[styles.railTitle, { color: theme.text }]}>Most interacted with</Text>
        {topCreators.length === 0 ? (
          <Text style={[styles.railEmpty, { color: theme.subtext }]}>No activity in the last 24 hours yet.</Text>
        ) : (
          topCreators.map((creator, index) => (
            <TouchableOpacity key={creator.id} style={styles.creatorRow} onPress={() => navigation.navigate('Profile', { uid: creator.id })}>
              <Text style={[styles.trendRank, { color: theme.accentTeal }]}>{index + 1}</Text>
              <View style={[styles.creatorAvatar, { backgroundColor: avatarColor(creator.name, theme.palette) }]}>
                <Text style={styles.creatorAvatarText}>{creator.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[styles.creatorName, { color: theme.text }]} numberOfLines={1}>{creator.name}</Text>
              <Text style={[styles.creatorCount, { color: theme.subtext }]}>{creator.count}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* New from friends */}
      <View style={[styles.railCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.railOverline, { color: theme.accentPurple }]}>👥 From your friends</Text>
        <Text style={[styles.railTitle, { color: theme.text }]}>New friend polls</Text>
        {friendPolls.length === 0 ? (
          <View>
            <Text style={[styles.railEmpty, { color: theme.subtext }]}>
              {friends.length === 0 ? 'Connect with people to see their newest polls here.' : 'No new polls from friends yet.'}
            </Text>
            <TouchableOpacity style={[styles.railLink, { borderColor: theme.border }]} onPress={() => navigation.navigate('Groups')}>
              <Text style={[styles.railLinkText, { color: theme.accent }]}>Browse groups →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          friendPolls.map((poll) => (
            <TouchableOpacity key={poll.id} style={styles.friendPollRow} onPress={() => setActivePoll(poll)}>
              <View style={[styles.creatorAvatar, { backgroundColor: avatarColor(poll.authorName, theme.palette) }]}>
                <Text style={styles.creatorAvatarText}>{(poll.authorName || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.friendPollTitle, { color: theme.text }]} numberOfLines={2}>{poll.title}</Text>
                <Text style={[styles.friendPollMeta, { color: theme.subtext }]}>{poll.authorName || 'Friend'} · {timeAgo(poll.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );

  const renderFeed = () => (
    <View style={[styles.leftColumn, isWide && styles.leftColumnWide]}>
      <View style={styles.feedHeadingRow}>
        <Text style={[styles.sectionOverline, { color: theme.accent }]}>For you</Text>
        <Text style={[styles.feedHeading, { color: theme.text }]}>Your ranked feed</Text>
        <Text style={[styles.feedSubheading, { color: theme.subtext }]}>{forYouPolls.length} poll{forYouPolls.length === 1 ? '' : 's'} prioritized by momentum.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : forYouPolls.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No matching polls</Text>
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>Try a broader category, clear the search, or publish a new poll.</Text>
        </View>
      ) : (
        forYouPolls.map((poll) => <PollCard key={poll.id} poll={poll} onPress={() => setActivePoll(poll)} />)
      )}
    </View>
  );

  const headerControls = (
    <>
      <TouchableOpacity
        style={[styles.menuButton, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
        onPress={openDrawer}
      >
        <Text style={[styles.menuButtonIcon, { color: theme.text }]}>☰</Text>
        <Text style={[styles.menuButtonText, { color: theme.text }]}>Menu</Text>
      </TouchableOpacity>

      <View style={styles.categoryBadgeRow}>
        <Text style={[styles.categoryBadgeLabel, { color: theme.subtext }]}>Showing</Text>
        <View style={[styles.categoryBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
          <Text style={[styles.categoryBadgeText, { color: theme.accent }]}>{selectedCategory}</Text>
          {selectedCategory !== 'All' ? (
            <TouchableOpacity onPress={() => selectCategory('All')} style={styles.categoryBadgeClear}>
              <Text style={[styles.categoryBadgeClearText, { color: theme.accent }]}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={[styles.searchShell, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
          <Text style={[styles.searchIcon, { color: theme.subtext }]}>⌕</Text>
          <TextInput
            placeholder="Search polls in your feed"
            placeholderTextColor={theme.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Text style={[styles.searchClearText, { color: theme.subtext }]}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </>
  );

  // Wide/desktop keeps the two-column ScrollView layout. On phones we virtualize
  // the feed with FlatList so only a handful of PollCards (and their Firestore
  // listeners) are ever mounted at once — this is the main fix for the freezing.
  if (isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <ScrollView contentContainerStyle={[styles.page, { paddingHorizontal: 18 }]} showsVerticalScrollIndicator={false}>
          {headerControls}
          <View style={[styles.body, styles.bodyWide]}>
            {renderFeed()}
            {renderRail()}
          </View>
        </ScrollView>

        <PollModal
          pollId={activePoll?.id}
          initialPoll={activePoll}
          visible={!!activePoll}
          onClose={() => setActivePoll(null)}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={loading ? [] : forYouPolls}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PollCard poll={item} onPress={() => setActivePoll(item)} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.page, { paddingHorizontal: width < 400 ? 14 : 18 }]}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            {headerControls}
            <View style={styles.feedHeadingRow}>
              <Text style={[styles.sectionOverline, { color: theme.accent }]}>For you</Text>
              <Text style={[styles.feedHeading, { color: theme.text }]}>Your ranked feed</Text>
              <Text style={[styles.feedSubheading, { color: theme.subtext }]}>{forYouPolls.length} poll{forYouPolls.length === 1 ? '' : 's'} prioritized by momentum.</Text>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
            ) : forYouPolls.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No matching polls</Text>
                <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>Try a broader category, clear the search, or publish a new poll.</Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={renderRail()}
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
    flex: 1
  },
  page: {
    padding: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center'
  },
  body: {
    width: '100%'
  },
  bodyWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20
  },
  leftColumn: {
    width: '100%'
  },
  leftColumnWide: {
    flex: 1,
    minWidth: 0
  },
  rightRail: {
    gap: 16
  },
  rightRailWide: {
    width: 340
  },
  rightRailNarrow: {
    width: '100%',
    marginTop: 8
  },
  railCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16
  },
  railOverline: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4
  },
  railTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12
  },
  railEmpty: {
    fontSize: 13,
    lineHeight: 19
  },
  railLink: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center'
  },
  railLinkText: {
    fontSize: 13,
    fontWeight: '700'
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8
  },
  trendRank: {
    fontSize: 15,
    fontWeight: '900',
    width: 20,
    textAlign: 'center'
  },
  trendTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19
  },
  trendVotes: {
    fontSize: 12,
    fontWeight: '700'
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7
  },
  creatorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  creatorAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  creatorName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700'
  },
  creatorCount: {
    fontSize: 12,
    fontWeight: '700'
  },
  friendPollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8
  },
  friendPollTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19
  },
  friendPollMeta: {
    fontSize: 12,
    marginTop: 2
  },
  searchPeopleLink: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12
  },
  hero: {
    borderWidth: 1,
    borderRadius: 30,
    padding: 22,
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  menuButtonIcon: {
    fontSize: 18,
    fontWeight: '900'
  },
  menuButtonText: {
    fontSize: 15,
    fontWeight: '700'
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  categoryBadgeLabel: {
    fontSize: 13,
    fontWeight: '600'
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14
  },
  categoryBadgeText: {
    fontSize: 14,
    fontWeight: '800'
  },
  categoryBadgeClear: {
    paddingHorizontal: 2
  },
  categoryBadgeClearText: {
    fontSize: 13,
    fontWeight: '800'
  },
  heroBackdropRow: {
    position: 'absolute',
    right: -24,
    top: -18
  },
  heroBlobLarge: {
    width: 150,
    height: 150,
    borderRadius: 999,
    opacity: 0.9
  },
  heroBlobSmall: {
    width: 92,
    height: 92,
    borderRadius: 999,
    position: 'absolute',
    top: 76,
    left: -20,
    opacity: 0.85
  },
  heroContent: {
    position: 'relative',
    zIndex: 1
  },
  heroEyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 16
  },
  heroEyebrowText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
    letterSpacing: -0.8,
    maxWidth: '84%'
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: '88%'
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 18
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4
  },
  heroStatLabel: {
    fontSize: 13,
    fontWeight: '600'
  },
  featuredLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start'
  },
  featuredLinkText: {
    fontSize: 14,
    fontWeight: '800',
    marginRight: 6
  },
  featuredLinkArrow: {
    fontSize: 16,
    fontWeight: '800'
  },
  searchShell: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  searchLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1
  },
  searchIcon: {
    fontSize: 20,
    fontWeight: '700'
  },
  searchClear: {
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  searchClearText: {
    fontSize: 14,
    fontWeight: '700'
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    outlineStyle: 'none'
  },
  categoryList: {
    paddingBottom: 18,
    paddingHorizontal: 2
  },
  feedHeadingRow: {
    marginBottom: 16
  },
  sectionOverline: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6
  },
  feedHeading: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4
  },
  feedSubheading: {
    fontSize: 14,
    fontWeight: '500'
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
    padding: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  }
});