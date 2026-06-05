import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { auth } from '../firebase/firebaseApp';
import { signOut, onAuthStateChanged } from 'firebase/auth';

export default function SettingsScreen() {
  const { theme, themeName, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return unsub;
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out failed', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>Customize the app experience, switch themes, and manage your profile options.</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>Appearance</Text>
        <View style={styles.optionRow}>
          <View>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>Switch the interface to a modern dark palette.</Text>
          </View>
          <Switch
            trackColor={{ false: '#9ca3af', true: '#38bdf8' }}
            thumbColor={themeName === 'dark' ? '#fff' : '#ffffff'}
            value={themeName === 'dark'}
            onValueChange={toggleTheme}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>Account</Text>
        <Text style={[styles.accountText, { color: theme.text }]}>{user?.displayName || 'Guest'}</Text>
        <Text style={[styles.accountMeta, { color: theme.subtext }]}>{user?.email || 'Not signed in'}</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={handleSignOut}>
          <Text style={styles.primaryButtonText}>{user ? 'Sign out' : 'Signed out'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.cardTitle, { color: theme.text }]}>About</Text>
        <Text style={[styles.aboutText, { color: theme.subtext }]}>Peopoll is designed to help communities discover popular opinion, compare trends, and keep conversations structured with intelligent filtering and curated featured content.</Text>
        <Text style={[styles.metaText, { color: theme.subtext }]}>App version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.5
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: 0.3
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700'
  },
  optionDescription: {
    fontSize: 14,
    marginTop: 4
  },
  accountText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  accountMeta: {
    fontSize: 14,
    marginBottom: 14
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12
  },
  metaText: {
    fontSize: 13
  }
});
