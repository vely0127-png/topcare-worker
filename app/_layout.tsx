import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, type AppStateStatus } from 'react-native';
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
import { initMeasure, measure } from '@/lib/measure/client';
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

  // 실증 측정 — 홈(역할별 큰 버튼 메뉴) 진입 시 T1 과업 시작(ADR-001 §7).
  // 역할별 홈 화면 7개 각각에 심지 않고 여기 한 곳에서 잡는다 — segments[0] === '(home)'이면
  // 어떤 역할의 홈이든 항상 이 그룹으로 들어온다. 개인정보 없음(화면 진입 사실만).
  const segmentsRef = useRef(segments);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  useEffect(() => {
    if (status === 'authenticated' && segments[0] === '(home)') {
      measure.startTask('T1', 'care');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, segments]);

  useEffect(() => {
    // 앱 포그라운드 복귀 — "지금 홈 화면인" 경우에만 T1을 새로 잰다(다른 작업 화면 도중
    // 잠깐 앱을 껐다 켠 것까지 홈 진입으로 잘못 세지 않기 위해 segmentsRef로 현재 위치를 본다).
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && segmentsRef.current[0] === '(home)') {
        measure.startTask('T1', 'care');
      }
    });
    return () => sub.remove();
  }, []);

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
    <>
      {/* 인증 가드 안에서만 렌더 — 로그아웃·로그인 화면에서는 절대 보이지 않는다(S-16).
          큐 자체가 비어 있으면 배지는 어차피 아무것도 렌더링하지 않는다. */}
      {status === 'authenticated' && <OfflineQueueBadge />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="consent" />
        <Stack.Screen name="beacon-register" />
        <Stack.Screen name="(home)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
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

  // 실증 측정 — 백그라운드 전환 시 flush 감시만 여기서 초기화(과업 시작은 useAuthGuard가 담당).
  useEffect(() => {
    initMeasure();
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
          {/* 오프라인 큐 배지는 RootNavigator 안(인증 가드 통과 후)에서만 렌더한다(S-16) —
              여기 두면 로그아웃·로그인 화면에서도 보였다. */}
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
