import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useDrawer } from '../navigation/DrawerContext';
import { navigate } from '../navigation/navigationRef';

const INFO_ITEMS = [
  { route: 'Groups', label: 'Groups', icon: '◎' },
  { route: 'About', label: 'About', icon: 'ℹ' },
  { route: 'Policy', label: 'Privacy policy', icon: '§' },
  { route: 'Help', label: 'Help & contact', icon: '?' }
];

export default function AppDrawer() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const { isOpen, closeDrawer, categories, selectedCategory, selectCategory } = useDrawer();

  const panelWidth = Math.min(320, width * 0.82);
  const translateX = useRef(new Animated.Value(-panelWidth)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: isOpen ? 0 : -panelWidth,
      duration: 220,
      useNativeDriver: true
    }).start();
  }, [isOpen, panelWidth, translateX]);

  const go = (route) => {
    closeDrawer();
    navigate(route);
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={closeDrawer}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={closeDrawer}>
        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, backgroundColor: theme.surface, borderRightColor: theme.border, transform: [{ translateX }] }
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <View style={[styles.brandRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.brandMark, { backgroundColor: theme.accent }]}>
                <Text style={styles.brandMarkText}>P</Text>
              </View>
              <Text style={[styles.brand, { color: theme.text }]}>Peopoll</Text>
              <TouchableOpacity onPress={closeDrawer} style={[styles.close, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[styles.closeText, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <Text style={[styles.sectionLabel, { color: theme.subtext }]}>Categories</Text>
              <View style={styles.categoryWrap}>
                {categories.map((category) => {
                  const active = category === selectedCategory;
                  return (
                    <TouchableOpacity
                      key={category}
                      onPress={() => selectCategory(category)}
                      style={[
                        styles.categoryPill,
                        { backgroundColor: active ? theme.accent : theme.surfaceMuted, borderColor: active ? theme.accent : theme.border }
                      ]}
                    >
                      <Text style={[styles.categoryText, { color: active ? '#fff' : theme.text }]}>{category}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, { color: theme.subtext, marginTop: 18 }]}>Settings</Text>
              {/* Appearance is stored locally, so guests can switch themes
                  without signing in. */}
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Dark mode</Text>
                  <Text style={[styles.settingHint, { color: theme.subtext }]}>Available without signing in</Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: theme.border, true: theme.accent }}
                  thumbColor="#ffffff"
                />
              </View>
              <TouchableOpacity style={styles.navItem} onPress={() => go('Settings')}>
                <Text style={[styles.navIcon, { color: theme.accentPurple }]}>{'\u2699'}</Text>
                <Text style={[styles.navLabel, { color: theme.text }]}>All settings</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, { color: theme.subtext, marginTop: 18 }]}>More</Text>
              {INFO_ITEMS.map((item) => (
                <TouchableOpacity key={item.route} style={styles.navItem} onPress={() => go(item.route)}>
                  <Text style={[styles.navIcon, { color: theme.accentPurple }]}>{item.icon}</Text>
                  <Text style={[styles.navLabel, { color: theme.text }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <Text style={[styles.footerText, { color: theme.subtext }]}>Peopoll · v1.1.0</Text>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row'
  },
  panel: {
    height: '100%',
    borderRightWidth: 1
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900'
  },
  brand: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700'
  },
  content: {
    padding: 14
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 6
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12
  },
  navIcon: {
    fontSize: 18,
    fontWeight: '800',
    width: 22,
    textAlign: 'center'
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '600'
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600'
  },
  settingHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2
  },
  categoryWrap: {
    flexDirection: 'column',
    gap: 8,
    paddingHorizontal: 6
  },
  categoryPill: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '700'
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600'
  }
});
