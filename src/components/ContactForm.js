import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { auth } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { displayNameFor } from '../utils/account';
import { sendContactEmail, SUPPORT_EMAIL } from '../utils/contact';

// Reusable contact form used by both the Help screen and Settings. Composes an
// email to the support inbox.
export default function ContactForm({ embedded = false }) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user) {
      setName((current) => current || (user.isAnonymous ? '' : displayNameFor(user)));
      setEmail((current) => current || user.email || '');
    }
  }), []);

  const handleSend = async () => {
    if (!message.trim()) {
      Alert.alert('Message required', 'Please write a message before sending.');
      return;
    }
    setSending(true);
    try {
      await sendContactEmail({ name, email, subject, message });
      Alert.alert('Thanks!', 'Your message has been prepared in your email app.');
      setSubject('');
      setMessage('');
    } catch (error) {
      Alert.alert('Unable to send', error?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={embedded ? null : [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {!embedded && <Text style={[styles.title, { color: theme.text }]}>Contact support</Text>}
      <Text style={[styles.helper, { color: theme.subtext }]}>
        Have a question or found a bug? Send us a message and we'll get back to you.
        {!SUPPORT_EMAIL ? ' (Support inbox is being set up.)' : ''}
      </Text>

      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
        placeholder="Your name"
        placeholderTextColor={theme.placeholder}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
        placeholder="Your email (so we can reply)"
        placeholderTextColor={theme.placeholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
        placeholder="Subject"
        placeholderTextColor={theme.placeholder}
        value={subject}
        onChangeText={setSubject}
      />
      <TextInput
        style={[styles.input, styles.multiline, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
        placeholder="How can we help?"
        placeholderTextColor={theme.placeholder}
        value={message}
        onChangeText={setMessage}
        multiline
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.accent, opacity: sending ? 0.6 : 1 }]}
        onPress={handleSend}
        disabled={sending}
      >
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Send message</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 10
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top'
  },
  button: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  }
});
