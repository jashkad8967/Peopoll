import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const SECTIONS = [
  {
    heading: 'Information we collect',
    body: 'When you sign in, we store your display name, email (if provided by your sign-in provider), and an optional bio. We also store the polls you create, your votes, comments, likes, and the people you follow.'
  },
  {
    heading: 'How we use your information',
    body: 'Your data powers the core features of Peopoll: showing your polls, ranking feeds, enabling conversations, and connecting you with other people. Aggregated, anonymized vote counts are shown publicly on each poll.'
  },
  {
    heading: 'What is public',
    body: 'Polls, vote tallies, comments, and your public profile (name and bio) are visible to other users. Direct messages are private to the participants of a conversation.'
  },
  {
    heading: 'Guest accounts',
    body: 'You can use Peopoll as an anonymous guest. Guest activity is tied to a temporary account and may be lost if you clear your browser or sign out.'
  },
  {
    heading: 'Data retention & deletion',
    body: 'You can edit your profile at any time in Settings. To request deletion of your account and associated data, contact us through the Help page.'
  },
  {
    heading: 'Third-party services',
    body: 'Peopoll uses Google Firebase for authentication and data storage. Their handling of data is governed by Google’s privacy policy.'
  },
  {
    heading: 'Changes to this policy',
    body: 'We may update this policy as the app evolves. Material changes will be reflected here with an updated date.'
  }
];

export default function PolicyScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.text }]}>Privacy Policy</Text>
      <Text style={[styles.updated, { color: theme.subtext }]}>Last updated: June 2026</Text>

      {SECTIONS.map((section) => (
        <View key={section.heading} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.heading, { color: theme.text }]}>{section.heading}</Text>
          <Text style={[styles.body, { color: theme.subtext }]}>{section.body}</Text>
        </View>
      ))}

      <Text style={[styles.footer, { color: theme.subtext }]}>
        Questions about this policy? Reach out through the Help page.
      </Text>
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
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4
  },
  updated: {
    fontSize: 13,
    marginBottom: 18
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12
  },
  heading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8
  },
  body: {
    fontSize: 14,
    lineHeight: 22
  },
  footer: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'center'
  }
});
