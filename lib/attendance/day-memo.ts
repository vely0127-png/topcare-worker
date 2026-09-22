/**
 * "오늘 자동 출근을 이미 보냈다" 로컬 기억 — 하루 1회 전송 보장 (GPS 출퇴근, vc9)
 *
 * 서버도 같은 날 두 번째 checkin 을 무시하지만(대표 확정: 최초 1건만), 앱이 매번 보내면
 * 포그라운드로 돌아올 때마다 위치를 재는 셈이 된다 — 설계 조건("버튼/실행 순간 1회")에 어긋난다.
 *
 * 저장은 expo-secure-store, 웹 QA 빌드는 localStorage (lib/auth/storage.ts 와 같은 규약).
 * 값은 날짜 문자열 하나뿐이다 — 좌표·판정은 저장하지 않는다.
 *
 * 핫픽스 H-2(2026-09-23, Q19-15 P2)
 *   키가 기기 단위(STORAGE_KEYS.autoCheckinDate 고정 문자열 하나)였다 — 공용 폰에서 교대
 *   로그인하는 시설은 같은 기기·같은 날짜라서 두 번째 직원이 memo===today 로 자동 출근이
 *   생략됐다(수동 경로도 없어 출근 불가). staffId 로 키를 나눈다. 기존 키와 값이 충돌하지
 *   않으므로 마이그레이션은 필요 없다 — 새 키로 처음 조회하면 null 이 나와 그날 첫 실행에서
 *   자동 출근을 1회 다시 시도하는 게 정상 동작이다(서버가 같은 날 중복 checkin 을 무시한다).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '../config';

const secureStoreAvailable = typeof SecureStore.getItemAsync === 'function';
const webStore =
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as any).localStorage
    ? ((globalThis as any).localStorage as Storage)
    : null;

/** staffId 별 메모리 캐시 — 사용자 전환 시 이전 직원 값이 새 직원에게 새지 않게 키로 가른다. */
const memory = new Map<string, string>();

function keyFor(staffId: string): string {
  return `${STORAGE_KEYS.autoCheckinDate}:${staffId}`;
}

/** 자동 출근을 마지막으로 보낸 날짜(KST 'YYYY-MM-DD'). 없으면 null. staffId 필수(H-2). */
export async function loadAutoCheckinDate(staffId: string): Promise<string | null> {
  const cached = memory.get(staffId);
  if (cached) return cached;
  const key = keyFor(staffId);
  if (webStore) {
    try { return webStore.getItem(key); } catch { return null; }
  }
  if (!secureStoreAvailable) return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function saveAutoCheckinDate(staffId: string, date: string): Promise<void> {
  memory.set(staffId, date);
  const key = keyFor(staffId);
  if (webStore) {
    try { webStore.setItem(key, date); } catch { /* 메모리에는 저장됨 */ }
    return;
  }
  if (!secureStoreAvailable) return;
  try {
    await SecureStore.setItemAsync(key, date);
  } catch {
    /* 메모리에는 저장됨 — 앱 재시작 시 한 번 더 보낼 수 있으나 서버가 중복을 무시한다 */
  }
}
