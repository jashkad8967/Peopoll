import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function PollCard({ poll, onPress }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{poll.title}</Text>
        <Text style={[styles.category, { color: theme.accent }]}>{poll.category || 'General'}</Text>
      </View>
      <Text style={[styles.description, { color: theme.subtext }]} numberOfLines={3}>{poll.description || 'Vote and see how public opinion shifts over time.'}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.subtext }]}>{poll.totalVotes || 0} votes</Text>
        <Text style={[styles.metaText, { color: theme.subtext }]}>{poll.choices?.length || 0} options</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    flex: 1,
    marginRight: 12,
    lineHeight: 26
  },
  category: {
    fontWeight: '700',
    fontSize: 12,
    marginTop: 4
  },
  description: {
    fontSize: 15,
    marginBottom: 16,
    lineHeight: 24
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500'
  }
});
