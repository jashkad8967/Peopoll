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
        { backgroundColor: selected ? theme.accentSoft : theme.chip, borderColor: selected ? theme.accent : theme.chip }
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.accent : theme.subtext }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2
  }
});
