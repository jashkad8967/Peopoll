import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const FEATURES = [
  { icon: '📊', title: 'Live trends', text: 'Watch vote share move over time with charts you can filter by day, week, or all time.' },
  { icon: '💬', title: 'Real conversations', text: 'Comment, reply, and like to discuss the polls that matter to you.' },
  { icon: '👥', title: 'Connect with people', text: 'Follow others, become friends, and message friends directly.' },
  { icon: '⚡', title: 'Quick voting', text: 'Cast a vote from anywhere — the feed, your profile, or settings.' }
];

export default function AboutScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.mark, { backgroundColor: theme.accent }]}>
          <Text style={styles.markText}>P</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>About Peopoll</Text>
        <Text style={[styles.lead, { color: theme.subtext }]}>
          Peopoll is a social polling app that helps communities discover what people really think — and talk about it together.
        </Text>
      </View>

      {FEATURES.map((feature) => (
        <View key={feature.title} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.icon}>{feature.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{feature.title}</Text>
            <Text style={[styles.cardText, { color: theme.subtext }]}>{feature.text}</Text>
          </View>
        </View>
      ))}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardText, { color: theme.subtext }]}>
          Built with React Native and Firebase. Peopoll is a community project and is provided as-is.
        </Text>
        <Text style={[styles.version, { color: theme.subtext }]}>Version 1.1.0</Text>
      </View>
    </ScrollView>
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
  hero: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
    alignItems: 'flex-start'
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  markText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900'
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8
  },
  lead: {
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12
  },
  icon: {
    fontSize: 24
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21
  },
  version: {
    fontSize: 13,
    marginTop: 10
  }
});
