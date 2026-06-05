import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PollDetailScreen from '../screens/PollDetailScreen';
import CreatePollScreen from '../screens/CreatePollScreen';
import FeaturedScreen from '../screens/FeaturedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: theme.header, shadowColor: 'transparent' },
        headerTitleStyle: { color: theme.text, fontWeight: '700' },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background }
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Peopoll',
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ padding: 6 }}>
              <Text style={{ color: theme.accent, fontWeight: '700' }}>Settings</Text>
            </TouchableOpacity>
          )
        })}
      />
      <Stack.Screen name="Featured" component={FeaturedScreen} options={{ title: 'Featured polls' }} />
      <Stack.Screen name="PollDetail" component={PollDetailScreen} options={{ title: 'Poll detail' }} />
      <Stack.Screen name="CreatePoll" component={CreatePollScreen} options={{ title: 'Create poll' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}
