/**
 * "오늘 자동 출근을 이미 보냈다" 로컬 기억 — 하루 1회 전송 보장 (GPS 출퇴근, vc9)
 *
 * 서버도 같은 날 두 번째 checkin 을 무시하지만(대표 확정: 최초 1건만), 앱이 매번 보내면
 * 포그라운드로 돌아올 때마다 위치를 재는 셈이 된다 — 설계 조건("버튼/실행 순간 1회")에 어긋난다.
 *
 * 저장은 expo-secure-store, 웹 QA 빌드는 localStorage (lib/auth/storage.ts 와 같은 규약).
 * 값은 날짜 문자열 하나뿐이다 — 좌표·판정은 저장하지 않는다.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '../config';

const secureStoreAvailable = typeof SecureStore.getItemAsync === 'function';
const webStore =
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as any).localStorage
    ? ((globalThis as any).localStorage as Storage)
    : null;

let memory: string | null = null;

/** 자동 출근을 마지막으로 보낸 날짜(KST 'YYYY-MM-DD'). 없으면 null. */
export async function loadAutoCheckinDate(): Promise<string | null> {
  if (memory) return memory;
  if (webStore) {
    try { return webStore.getItem(STORAGE_KEYS.autoCheckinDate); } catch { return null; }
  }
  if (!secureStoreAvailable) return null;
  try {
    return await SecureStore.getItemAsync(STORAGE_KEYS.autoCheckinDate);
  } catch {
    return null;
  }
}

export async function saveAutoCheckinDate(date: string): Promise<void> {
  memory = date;
  if (webStore) {
    try { webStore.setItem(STORAGE_KEYS.autoCheckinDate, date); } catch { /* 메모리에는 저장됨 */ }
    return;
  }
  if (!secureStoreAvailable) return;
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.autoCheckinDate, date);
  } catch {
    /* 메모리에는 저장됨 — 앱 재시작 시 한 번 더 보낼 수 있으나 서버가 중복을 무시한다 */
  }
}
