/**
 * 위젯 딥링크 로그인 복귀 (W2, 2026-09-07)
 *
 * 왜 필요한가
 *   위젯 탭 → 딥링크로 앱이 열렸는데 세션이 없으면(유휴 잠금·만료 등) 루트 가드
 *   (app/_layout.tsx의 useAuthGuard)가 /login으로 보낸다. 그 순간 원래 가려던 목적지
 *   (예: /alerts/123)를 잃어버리면 로그인 후 항상 홈으로만 가게 된다 — 명세 A4
 *   "세션 만료면 로그인 후 딥링크 유지" 요구를 못 지킨다.
 *
 * 어떻게
 *   - capturePendingDeepLink(path): 현재 경로가 위젯발 딥링크(entry=widget 쿼리 포함)일
 *     때만 메모리 + SecureStore 1키에 저장한다. 위젯이 아닌 일반 탐색까지 저장하면
 *     "로그인 후 아무 때나 딴 화면으로 튐" 부작용이 생기므로 위젯 진입만 대상으로 좁힌다.
 *   - usePendingDeepLinkRedirect(): 인증 상태가 authenticated로 바뀌는 순간 저장된
 *     경로가 있으면 그리로 replace하고 지운다(1회 소비).
 *
 * ⚠ 통합 지점(PD가 넣을 것, 둘 다 app/_layout.tsx — 이번 작업 수정 금지 대상이라
 *   이 세션은 직접 넣지 않는다) —
 *   ① useAuthGuard의 `router.replace('/login')` 직전에
 *      `void capturePendingDeepLink(현재 경로 문자열)`을 호출한다. 현재 경로는
 *      `usePathname()`(expo-router) 또는 `'/' + segments.join('/')`로 구성하면 된다.
 *   ② `RootNavigator`(또는 useAuthGuard) 안에서 `usePendingDeepLinkRedirect();` 한 줄을
 *      호출한다. 로그인 화면(app/login.tsx)의 `router.replace(homeRouteForRole(...))`
 *      자체는 건드릴 필요 없다 — 이 훅이 인증 전환을 감지해 그 뒤에 한 번 더 옮긴다.
 */
import { useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../auth/auth-store';

const KEY = 'topcare.worker.pendingWidgetDeepLink';
let memory: string | null = null;

const webStore =
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage
    ? (globalThis as unknown as { localStorage: Storage }).localStorage
    : null;

/** 딥링크 쿼리에 entry=widget이 있는 경로만 위젯발로 본다 — 일반 탐색 경로는 저장하지 않는다. */
export function isWidgetEntryPath(path: string): boolean {
  return /[?&]entry=widget(&|$)/.test(path);
}

/** 위젯발 딥링크 경로만 저장한다(그 외는 무시). */
export async function capturePendingDeepLink(path: string): Promise<void> {
  if (!isWidgetEntryPath(path)) return;
  memory = path;
  try {
    if (webStore) { webStore.setItem(KEY, path); return; }
    if (typeof SecureStore.setItemAsync === 'function') await SecureStore.setItemAsync(KEY, path);
  } catch {
    /* 메모리에는 이미 있다 — 앱을 종료하면 사라질 뿐, 지금 세션 안에서는 살아있다 */
  }
}

async function readStored(): Promise<string | null> {
  try {
    if (webStore) return webStore.getItem(KEY);
    if (typeof SecureStore.getItemAsync === 'function') return await SecureStore.getItemAsync(KEY);
  } catch {
    /* noop */
  }
  return null;
}

async function clearStored(): Promise<void> {
  try {
    if (webStore) { webStore.removeItem(KEY); return; }
    if (typeof SecureStore.deleteItemAsync === 'function') await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* noop */
  }
}

/** 저장된 목적지를 1회 소비(꺼내고 지움). 없으면 null. */
export async function consumePendingDeepLink(): Promise<string | null> {
  const target = memory ?? (await readStored());
  memory = null;
  if (target) await clearStored();
  return target;
}

/** 인증 상태가 authenticated로 전환되는 순간 저장된 목적지가 있으면 그리로 이동한다. */
export function usePendingDeepLinkRedirect(): void {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current !== 'authenticated' && status === 'authenticated') {
      void consumePendingDeepLink().then((target) => {
        if (target) router.replace(target);
      });
    }
    prevStatus.current = status;
  }, [status, router]);
}
