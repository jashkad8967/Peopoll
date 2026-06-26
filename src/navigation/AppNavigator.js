import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Alert, Text, Platform, ScrollView } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CreatePollScreen from '../screens/CreatePollScreen';
import FriendsScreen from '../screens/FriendsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import UserListScreen from '../screens/UserListScreen';
import GroupsScreen from '../screens/GroupsScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import AboutScreen from '../screens/AboutScreen';
import PolicyScreen from '../screens/PolicyScreen';
import HelpScreen from '../screens/HelpScreen';
import { useTheme } from '../theme/ThemeContext';
import { auth } from '../firebase/firebaseApp';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { upsertUserProfile } from '../utils/social';
import { isPhoneVerified } from '../utils/account';
import PhoneVerifyModal from '../components/PhoneVerifyModal';

const Stack = createNativeStackNavigator();

function HeaderTextButton({ label, color, onPress, bordered = false, borderColor = 'transparent', backgroundColor = 'transparent' }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: bordered ? 1 : 0,
        borderColor,
        backgroundColor
      }}
    >
      <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [authInFlight, setAuthInFlight] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Keep the public profile document fresh for search/social features.
        upsertUserProfile(authUser).catch(() => {});
        // Real (email-backed) accounts must be tied to a verified phone number
        // at creation so every account maps to exactly one number. Anonymous
        // guests still verify later, at vote time.
        setNeedsPhone(!authUser.isAnonymous && !isPhoneVerified(authUser));
      } else {
        setNeedsPhone(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }

    let isMounted = true;
    getRedirectResult(auth).catch((error) => {
      if (!isMounted) return;
      console.error('Redirect sign-in resolution failed', error);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const showAuthError = (error) => {
    const code = error?.code || '';
    if (code.includes('auth/unauthorized-domain')) {
      Alert.alert(
        'Authentication blocked',
        'This domain is not authorized in Firebase Auth. Add localhost (and your deployed domain) in Firebase Console -> Authentication -> Settings -> Authorized domains.'
      );
      return;
    }

    if (code.includes('auth/popup-blocked') || code.includes('auth/popup-closed-by-user')) {
      Alert.alert('Sign-in canceled', 'The sign-in popup was blocked or closed. Please retry and allow popups.');
      return;
    }

    Alert.alert('Authentication error', error?.message || 'Please try again.');
  };

  const handleAuthAction = async () => {
    if (authInFlight) {
      return;
    }

    try {
      if (user) {
        setAuthInFlight(true);
        await signOut(auth);
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      setAuthInFlight(true);
      if (Platform.OS !== 'web') {
        await signInWithRedirect(auth, provider);
        return;
      }

      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const popupCode = popupError?.code || '';
        if (popupCode.includes('auth/popup-blocked') || popupCode.includes('auth/popup-closed-by-user') || popupCode.includes('auth/operation-not-supported-in-this-environment')) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (error) {
      console.error('Header auth action failed', error);
      showAuthError(error);
    } finally {
      setAuthInFlight(false);
    }
  };

  const handlePhoneVerified = async (verifiedUser) => {
    try {
      await verifiedUser?.reload?.();
    } catch (error) {
      // Ignore reload failures; the auth listener still refreshes state.
    }
    const current = auth.currentUser;
    setUser(current);
    if (current) {
      upsertUserProfile(current).catch(() => {});
    }
    setNeedsPhone(false);
  };

  const handlePhoneGateCancel = async () => {
    // Verification is mandatory when setting up an email account — backing out
    // signs the user out rather than leaving an unverified account active.
    try {
      await signOut(auth);
    } catch (error) {
      // Ignore sign-out failures.
    }
    setNeedsPhone(false);
  };

  const renderHeaderActions = (navigation) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}
      style={{ maxWidth: 560 }}
    >
      <HeaderTextButton label="Home" color={theme.text} onPress={() => navigation.navigate('Home')} bordered borderColor={theme.border} backgroundColor={theme.background} />
      <HeaderTextButton label="Groups" color={theme.text} onPress={() => navigation.navigate('Groups')} bordered borderColor={theme.border} backgroundColor={theme.background} />
      <HeaderTextButton label="Messages" color={theme.text} onPress={() => navigation.navigate('Friends')} bordered borderColor={theme.border} backgroundColor={theme.background} />
      <HeaderTextButton label="Create" color={theme.text} onPress={() => navigation.navigate('CreatePoll')} bordered borderColor={theme.border} backgroundColor={theme.background} />
      {user ? (
        <>
          <HeaderTextButton label="Profile" color={theme.text} onPress={() => navigation.navigate('Profile')} bordered borderColor={theme.border} backgroundColor={theme.background} />
          <HeaderTextButton label="Sign out" color={theme.text} onPress={handleAuthAction} bordered borderColor={theme.border} backgroundColor={theme.background} />
        </>
      ) : (
        <HeaderTextButton label="Sign in" color={theme.text} onPress={handleAuthAction} bordered borderColor={theme.border} backgroundColor={theme.background} />
      )}
    </ScrollView>
  );

  const renderBackLeft = (navigation) => (
    <View style={{ marginLeft: 8 }}>
      <HeaderTextButton label="← Back" color={theme.text} onPress={() => navigation.goBack()} bordered borderColor={theme.border} backgroundColor={theme.background} />
    </View>
  );

  return (
    <>
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerShadowVisible: true,
        headerTitleStyle: { color: theme.text, fontWeight: '800', fontSize: 22, marginLeft: 8 },
        headerTintColor: theme.text,
        headerTitle: 'Peopoll',
        headerTitleAlign: 'left',
        animation: 'slide_from_right',
        gestureEnabled: true,
        contentStyle: { backgroundColor: theme.background }
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          headerLeft: () => null,
          headerRight: () => renderHeaderActions(navigation)
        })}
      />
      <Stack.Screen name="Friends" component={FriendsScreen} options={({ navigation }) => ({ headerTitle: 'Messages', headerLeft: () => null, headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="Groups" component={GroupsScreen} options={({ navigation }) => ({ headerTitle: 'Groups', headerLeft: () => null, headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={({ navigation, route }) => ({ headerTitle: route.params?.groupName || 'Group', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={({ navigation }) => ({ headerTitle: 'Create group', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={({ navigation }) => ({ headerTitle: 'Profile', headerLeft: () => null, headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="UserList" component={UserListScreen} options={({ navigation, route }) => ({ headerTitle: route.params?.title || 'People', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="CreatePoll" component={CreatePollScreen} options={({ navigation, route }) => ({ headerTitle: 'Create poll', headerLeft: route.params?.fromSettings ? () => renderBackLeft(navigation) : () => null, headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={({ navigation }) => ({ headerTitle: 'Settings', headerLeft: () => null, headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="About" component={AboutScreen} options={({ navigation }) => ({ headerTitle: 'About', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="Policy" component={PolicyScreen} options={({ navigation }) => ({ headerTitle: 'Privacy policy', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
      <Stack.Screen name="Help" component={HelpScreen} options={({ navigation }) => ({ headerTitle: 'Help', headerLeft: () => renderBackLeft(navigation), headerRight: () => renderHeaderActions(navigation) })} />
    </Stack.Navigator>
    <PhoneVerifyModal
      visible={needsPhone}
      onClose={handlePhoneGateCancel}
      onVerified={handlePhoneVerified}
      reason="Finish setting up your account: verify a phone number so your email is always linked to one verified number. One verified number = one vote."
    />
    </>
  );
}
