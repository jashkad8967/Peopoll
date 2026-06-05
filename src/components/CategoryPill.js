import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function CategoryPill({ label, selected, onPress }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        { backgroundColor: selected ? theme.accent : theme.surface, borderColor: selected ? theme.accent : theme.border }
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.card : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 2,
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3
  }
});
