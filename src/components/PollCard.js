import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function PollCard({ poll, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>{poll.title}</Text>
        <Text style={styles.category}>{poll.category || 'General'}</Text>
      </View>
      <Text style={styles.description}>{poll.description || 'Vote and see how public opinion shifts over time.'}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{poll.totalVotes || 0} votes</Text>
        <Text style={styles.metaText}>{poll.choices?.length || 0} options</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12
  },
  category: {
    color: '#2563eb',
    fontWeight: '700'
  },
  description: {
    color: '#374151',
    marginBottom: 12
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metaText: {
    color: '#6b7280',
    fontSize: 14
  }
});
