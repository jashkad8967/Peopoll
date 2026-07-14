import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import TrendChart from './TrendChart';
import QuickVote from './QuickVote';
import { subscribeTrendSnapshots } from '../utils/pollVoting';

function PollCard({ poll, onPress }) {
  const { theme } = useTheme();
  const totalVotes = poll.totalVotes || 0;
  const options = poll.choices || [];
  const [snapshots, setSnapshots] = useState([]);

  useEffect(() => subscribeTrendSnapshots(poll.id, setSnapshots), [poll.id]);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        <View style={styles.topRow}>
          <View style={[styles.categoryPill, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.category, { color: theme.accent }]} numberOfLines={1}>{poll.category || 'General'}</Text>
          </View>
          <Text style={[styles.metaBadge, { color: theme.subtext }]}>{totalVotes.toLocaleString()} votes</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{poll.title}</Text>
        {poll.description ? (
          <Text style={[styles.description, { color: theme.subtext }]} numberOfLines={2}>{poll.description}</Text>
        ) : null}

        <View style={[styles.chartShell, { borderColor: theme.border }]}>
          {options.length ? (
            <TrendChart poll={poll} options={options} snapshots={snapshots} variant="compact" />
          ) : (
            <Text style={[styles.graphEmpty, { color: theme.subtext }]}>Add options to see vote trends.</Text>
          )}
        </View>
      </TouchableOpacity>

      {options.length ? (
        <View style={styles.quickVoteShell}>
          <Text style={[styles.quickVoteLabel, { color: theme.subtext }]}>Quick vote</Text>
          <QuickVote poll={poll} compact />
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.metaRow, { borderTopColor: theme.border }]}>
        <Text style={[styles.metaText, { color: theme.subtext }]}>{options.length} options</Text>
        <Text style={[styles.metaLink, { color: theme.accent }]}>View details →</Text>
      </TouchableOpacity>
    </View>
  );
}

// Memoized so a card only re-renders when its own poll data actually changes,
// not every time the parent feed updates — avoids redundant renders and the
// per-card trend listener churning in long lists.
export default React.memo(PollCard, (prev, next) => (
  prev.poll.id === next.poll.id &&
  prev.poll.totalVotes === next.poll.totalVotes &&
  prev.poll.title === next.poll.title &&
  prev.onPress === next.onPress
));

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    maxWidth: '65%'
  },
  category: {
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.2
  },
  metaBadge: {
    fontSize: 12,
    fontWeight: '600'
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 23
  },
  description: {
    fontSize: 14,
    marginBottom: 14,
    lineHeight: 20
  },
  chartShell: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12
  },
  graphEmpty: {
    fontSize: 13,
    fontWeight: '500'
  },
  quickVoteShell: {
    marginBottom: 12
  },
  quickVoteLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500'
  },
  metaLink: {
    fontSize: 13,
    fontWeight: '700'
  }
});