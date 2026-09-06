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
import { useConsentGate } from '@/lib/hooks/useConsentGate';
import { homeRouteForRole } from '@/lib/auth/roles';
import { initPushNotifications, unregisterPushToken } from '@/lib/notifications';
import { BeaconProvider } from '@/lib/beacon/provider';
import { WebQaBanner } from '@/components/WebQaBanner';
import { OfflineQueueBadge } from '@/components/OfflineQueueBadge';
import { initOfflineQueue } from '@/lib/queue/offline-queue';
import { keepBaseUrl } from '@/lib/ui/keep-base-url';

// 웹 주소창의 /worker 접두사 유지 — expo-router 가 부팅 때 떼어버려서
// 새로고침하면 404 가 났다. 네이티브에서는 no-op. 모듈 로드 시 1회.
keepBaseUrl();

function useAuthGuard() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const segments = useSegments();
  const router = useRouter();

  // 첫 접속 동의 게이트 (2026-08-05) — 개인정보 동의 미서명이면 /consent로.
  // 문안 버전이 개정되면 서버가 required:true를 돌려줘 자동 재동의된다.
  // 정의는 lib/hooks/useConsentGate (근태 카드도 같은 쿼리를 본다 — 동의 전 위치 측정 금지)
  const consentGate = useConsentGate();

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    const inAuthScreen = group === 'login';
    if (status === 'unauthenticated' && !inAuthScreen) {
      router.replace('/login');
    } else if (status === 'authenticated' && consentGate.data?.required && group !== 'consent') {
      router.replace('/consent');
    } else if (status === 'authenticated' && (inAuthScreen || group === undefined)) {
      router.replace(homeRouteForRole(session?.user.role));
    }
  }, [status, session, segments, router, consentGate.data]);

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
      <Stack.Screen name="consent" />
      <Stack.Screen name="beacon-register" />
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

  // 오프라인 큐 — 앱 전체에서 한 번만 초기화(저장소 로드 + 즉시 flush 1회 + 포그라운드 복귀 감시).
  // 로그인 여부와 무관하게 시작해도 안전하다: 큐에 항목이 없으면 아무 일도 하지 않는다.
  useEffect(() => {
    initOfflineQueue();
  }, []);

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
          {/* 웹 QA 빌드에서만 보이는 안내 (실기기에선 렌더링 안 함) */}
          <WebQaBanner />
          {/* 오프라인 큐에 대기 중인 기록이 있을 때만 보임 — 없으면 렌더링 안 함 */}
          <OfflineQueueBadge />
          {/* 비콘 스캐너는 앱 전체에서 하나. 로그인 상태 + 포그라운드면 자동으로 돈다
              (2026-08-06 대표 지시: "스캔은 앱 사용시 기본 설정") */}
          <BeaconProvider>
            <RootNavigator />
          </BeaconProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
