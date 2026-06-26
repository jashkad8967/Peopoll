import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { verifiedTypeLabel } from '../utils/social';

// Small "verified" checkmark badge shown next to verified account names.
// Pass showLabel to render the account type (e.g. "News outlet") alongside.
export default function VerifiedBadge({ type, size = 16, showLabel = false, style }) {
  const { theme } = useTheme();
  const tick = Math.round(size * 0.62);
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.badge, { width: size, height: size, borderRadius: size, backgroundColor: theme.accent }]}>
        <Text style={[styles.check, { fontSize: tick }]}>✓</Text>
      </View>
      {showLabel ? (
        <Text style={[styles.label, { color: theme.accent }]} numberOfLines={1}>
          {verifiedTypeLabel(type)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  check: {
    color: '#ffffff',
    fontWeight: '900',
    lineHeight: undefined
  },
  label: {
    fontSize: 12,
    fontWeight: '700'
  }
});
