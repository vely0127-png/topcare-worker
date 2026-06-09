import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';

import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { homeRouteForRole } from '@/lib/auth/roles';
import { initPushNotifications, unregisterPushToken } from '@/lib/notifications';

function useAuthGuard() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    const inAuthScreen = group === 'login';
    if (status === 'unauthenticated' && !inAuthScreen) {
      router.replace('/login');
    } else if (status === 'authenticated' && (inAuthScreen || group === undefined)) {
      router.replace(homeRouteForRole(session?.user.role));
    }
  }, [status, session, segments, router]);

  return status;
}

function RootNavigator() {
  const status = useAuthGuard();
  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#1A5276" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(home)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

type NotifSub = { remove(): void };

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const status = useAuthStore((s) => s.status);
  const notifRef = useRef<NotifSub | null>(null);
  const responseRef = useRef<NotifSub | null>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void initPushNotifications();
    notifRef.current = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });
    responseRef.current = Notifications.addNotificationResponseReceivedListener((_r) => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });
    return () => {
      notifRef.current?.remove();
      responseRef.current?.remove();
    };
  }, [status]);

  useEffect(() => {
    if (prevStatusRef.current === 'authenticated' && status === 'unauthenticated') {
      void unregisterPushToken();
    }
    prevStatusRef.current = status;
  }, [status]);

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
