import React, { createContext, useContext, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';

const baseThemes = {
  light: {
    background: '#f9fafb',
    surface: '#ffffff',
    card: '#ffffff',
    header: '#1f2937',
    text: '#111827',
    subtext: '#6b7280',
    border: '#e5e7eb',
    accent: '#6366f1',
    accentSoft: '#eef2ff',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f97316',
    danger: '#ef4444',
    placeholder: '#9ca3af'
  },
  dark: {
    background: '#0f172a',
    surface: '#1a202c',
    card: '#2d3748',
    header: '#111827',
    text: '#f8fafc',
    subtext: '#cbd5e1',
    border: '#404855',
    accent: '#818cf8',
    accentSoft: '#312e81',
    secondary: '#a78bfa',
    success: '#34d399',
    warning: '#fb923c',
    danger: '#f87171',
    placeholder: '#a0aec0'
  }
};

const ThemeContext = createContext({});

export function ThemeProvider({ children }) {
  const systemPreference = Appearance.getColorScheme();
  const [themeName, setThemeName] = useState(systemPreference === 'dark' ? 'dark' : 'light');

  const value = useMemo(() => {
    const theme = baseThemes[themeName];
    const navTheme = themeName === 'dark'
      ? {
          ...NavigationDarkTheme,
          colors: {
            ...NavigationDarkTheme.colors,
            background: theme.background,
            card: theme.card,
            text: theme.text,
            border: theme.border,
            primary: theme.accent
          }
        }
      : {
          ...NavigationDefaultTheme,
          colors: {
            ...NavigationDefaultTheme.colors,
            background: theme.background,
            card: theme.card,
            text: theme.text,
            border: theme.border,
            primary: theme.accent
          }
        };

    return {
      themeName,
      theme,
      navTheme,
      isDark: themeName === 'dark',
      setThemeName,
      toggleTheme: () => setThemeName((current) => (current === 'light' ? 'dark' : 'light'))
    };
  }, [themeName]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
