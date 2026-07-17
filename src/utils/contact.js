import { Linking, Platform } from 'react-native';

// Support / business inbox the contact form routes messages to.
export const SUPPORT_EMAIL = 'business@peopollapp.com';

// Opens the user's email client with a prefilled message. This works without a
// backend. When SUPPORT_EMAIL is set later, the form will route directly to it.
export async function sendContactEmail({ name, email, subject, message }) {
  const trimmedMessage = (message || '').trim();
  if (!trimmedMessage) {
    throw new Error('Please write a message before sending.');
  }
  if (!SUPPORT_EMAIL) {
    throw new Error('Support email is not configured yet. Please try again later.');
  }

  const lines = [message || '', '', '—', `From: ${name || 'Anonymous'}`, email ? `Reply-to: ${email}` : ''].filter(Boolean);
  const body = encodeURIComponent(lines.join('\n'));
  const encodedSubject = encodeURIComponent(subject?.trim() || 'Peopoll support request');
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodedSubject}&body=${body}`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.location.href = url;
      return;
    }
  }

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('No email app is available to send this message.');
  }
  await Linking.openURL(url);
}
