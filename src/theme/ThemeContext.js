import React, { createContext, useContext, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';

const baseThemes = {
  light: {
    background: '#fafafa',
    surface: '#ffffff',
    card: '#ffffff',
    surfaceMuted: '#fafafa',
    header: '#ffffff',
    text: '#262626',
    subtext: '#8e8e8e',
    border: '#dbdbdb',
    accent: '#0095f6',
    accentSoft: '#e7f3ff',
    accentPurple: '#7048e8',
    accentPink: '#e64980',
    accentTeal: '#0ca678',
    accentOrange: '#f76707',
    gradientStart: '#0095f6',
    gradientEnd: '#7048e8',
    palette: ['#0095f6', '#e64980', '#0ca678', '#f76707', '#7048e8', '#00b8d9'],
    secondary: '#ed4956',
    success: '#2fb35c',
    warning: '#f5a623',
    danger: '#ed4956',
    placeholder: '#c7c7c7',
    chip: '#efefef',
    shadow: '#000000',
    overlay: 'rgba(38, 38, 38, 0.55)',
    heroAccent: '#e7f3ff',
    heroSecondary: '#fce8ea',
    graphTrack: '#efefef'
  },
  dark: {
    background: '#000000',
    surface: '#121212',
    card: '#1a1a1a',
    surfaceMuted: '#1a1a1a',
    header: '#000000',
    text: '#fafafa',
    subtext: '#a8a8a8',
    border: '#262626',
    accent: '#0095f6',
    accentSoft: '#0b2942',
    accentPurple: '#9775fa',
    accentPink: '#f783ac',
    accentTeal: '#38d9a9',
    accentOrange: '#ff922b',
    gradientStart: '#0095f6',
    gradientEnd: '#9775fa',
    palette: ['#4dabf7', '#f783ac', '#38d9a9', '#ffa94d', '#9775fa', '#3bc9db'],
    secondary: '#ff5a6e',
    success: '#2fd39a',
    warning: '#ffb020',
    danger: '#ff5a6e',
    placeholder: '#5c5c5c',
    chip: '#262626',
    shadow: '#000000',
    overlay: 'rgba(0, 0, 0, 0.65)',
    heroAccent: '#0b2942',
    heroSecondary: '#2a1418',
    graphTrack: '#262626'
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
