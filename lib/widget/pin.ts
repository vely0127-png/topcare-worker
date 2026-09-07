/**
 * [홈 화면에 위젯 추가] 요청 래퍼 (W2, 2026-09-07)
 *
 * Android 8(API 26)+ `AppWidgetManager.requestPinAppWidget()`을 감싼다. 네이티브 구현은
 * W1 후속(`lib/widget/native.ts`가 생기면 그쪽 모듈로 교체 — 통합 지점, 보고 대상)이라
 * 지금은 `NativeModules.WidgetSnapshot.requestPin()`을 직접 부르고, 없으면 no-op+false다.
 *
 * 첫 로그인 후 1회만 안내 카드(WidgetPromoCard)를 보여주기 위한 "이미 봤는지" 플래그도
 * 여기서 관리한다 — SecureStore 1키, 다른 위젯 파일과 저장소 규약을 맞췄다
 * (offline-queue.ts·auth/storage.ts와 동일하게 웹 빌드는 localStorage로 폴백).
 */
import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

interface WidgetSnapshotPinModule {
  requestPin?: () => Promise<boolean> | boolean;
}

function nativeModule(): WidgetSnapshotPinModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  return (NativeModules as Record<string, WidgetSnapshotPinModule | undefined>).WidgetSnapshot;
}

/** 홈 화면에 위젯 추가를 OS에 요청한다. 성공 여부는 OS 콜백이 아니라 요청 접수 여부만
 *  반환한다(실제 추가는 사용자가 시스템 다이얼로그에서 확정해야 함 — Android 표준 동작). */
export async function requestPinWidget(): Promise<boolean> {
  try {
    const mod = nativeModule();
    if (!mod?.requestPin) return false;
    return await mod.requestPin();
  } catch {
    return false;
  }
}

/** 위젯이 지원되는 플랫폼인가(Android뿐, ADR §4-5 iOS 후순위) — 안내 카드 노출 여부 판단용. */
export function isWidgetPlatformSupported(): boolean {
  return Platform.OS === 'android';
}

// ── 안내 카드 1회 노출 플래그 ────────────────────────────────────────────
const PROMO_SHOWN_KEY = 'topcare.worker.widgetPromoShown';

const webStore =
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage
    ? (globalThis as unknown as { localStorage: Storage }).localStorage
    : null;

export async function hasSeenWidgetPromo(): Promise<boolean> {
  try {
    if (webStore) return webStore.getItem(PROMO_SHOWN_KEY) === '1';
    if (typeof SecureStore.getItemAsync !== 'function') return true; // 저장 불가 환경 — 반복 노출보다 안전한 쪽
    return (await SecureStore.getItemAsync(PROMO_SHOWN_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markWidgetPromoShown(): Promise<void> {
  try {
    if (webStore) { webStore.setItem(PROMO_SHOWN_KEY, '1'); return; }
    if (typeof SecureStore.setItemAsync !== 'function') return;
    await SecureStore.setItemAsync(PROMO_SHOWN_KEY, '1');
  } catch {
    /* 조용히 무시 — 다시 한 번 보이는 정도는 치명적이지 않다 */
  }
}
