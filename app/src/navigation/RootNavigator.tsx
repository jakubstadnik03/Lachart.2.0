import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { TestingScreen } from '../screens/TestingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LoadingScreen } from '../screens/LoadingScreen';
import { TrainingDetailScreen } from '../screens/TrainingDetailScreen';
import type { RootStackParamList } from './types';

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Calendar"
      screenOptions={{
        headerShown: true,
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Calendar" component={CalendarScreen} />
      <Drawer.Screen name="Testing" component={TestingScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  const { initializing, token } = useAuth();

  if (initializing) return <LoadingScreen label="Loading…" />;

  if (!token) return <LoginScreen />;

  return (
    <Stack.Navigator>
      <Stack.Screen name="MainDrawer" component={MainDrawer} options={{ headerShown: false }} />
      <Stack.Screen
        name="TrainingDetail"
        component={TrainingDetailScreen}
        options={({ route }) => ({
          title: route.params?.title || 'Training detail',
          headerBackTitle: 'Back',
        })}
      />
    </Stack.Navigator>
  );
}


