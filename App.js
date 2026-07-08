import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import AppDrawer from './src/components/AppDrawer';
import { navigationRef } from './src/navigation/navigationRef';
import { DrawerProvider } from './src/navigation/DrawerContext';
import { auth } from './src/firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import ErrorBoundary from './src/components/ErrorBoundary';

function MainNavigator() {
  const { navTheme } = useTheme();
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <DrawerProvider>
        <AppNavigator />
        <AppDrawer />
      </DrawerProvider>
    </NavigationContainer>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      setIsReady(true);
    });

    return unsub;
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MainNavigator />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  }
});
