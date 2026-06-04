import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PollDetailScreen from '../screens/PollDetailScreen';
import CreatePollScreen from '../screens/CreatePollScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Peopoll' }} />
      <Stack.Screen name="PollDetail" component={PollDetailScreen} options={{ title: 'Poll details' }} />
      <Stack.Screen name="CreatePoll" component={CreatePollScreen} options={{ title: 'Create poll' }} />
    </Stack.Navigator>
  );
}
