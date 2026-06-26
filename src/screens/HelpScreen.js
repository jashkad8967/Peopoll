import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import ContactForm from '../components/ContactForm';

const FAQS = [
  { q: 'How do I vote?', a: 'Open any poll and tap a choice — or use the quick-vote bars right on a poll card. You can change your vote at any time.' },
  { q: 'How do I become friends with someone?', a: 'Follow each other. When you both follow one another you become friends and can message each other from the Messages page.' },
  { q: 'Why can’t I message someone?', a: 'Messaging is available between friends (mutual follows). Follow them and ask them to follow you back.' },
  { q: 'Can I use Peopoll without an account?', a: 'Yes. You can browse and interact as a guest, though some social features work best when signed in with Google.' },
  { q: 'How is the trend chart calculated?', a: 'It uses the real timestamps of votes where available, filtered to the time range you pick (day, week, all time).' }
];

export default function HelpScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.text }]}>Help & Support</Text>
      <Text style={[styles.lead, { color: theme.subtext }]}>Find quick answers below, or send us a message and we’ll help you out.</Text>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Frequently asked</Text>
      {FAQS.map((item) => (
        <View key={item.q} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.q, { color: theme.text }]}>{item.q}</Text>
          <Text style={[styles.a, { color: theme.subtext }]}>{item.a}</Text>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>Get in touch</Text>
      <ContactForm />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12
  },
  q: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6
  },
  a: {
    fontSize: 14,
    lineHeight: 21
  }
});
