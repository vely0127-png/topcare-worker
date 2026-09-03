/**
 * 위치 1회 획득 — GPS 출퇴근 판정용 (2026-09-01 대표 확정 설계, PoC2 피드백 #7)
 *
 * 확정 설계에서 온 제약 — 어기지 말 것
 *   - **포그라운드 위치만.** 백그라운드 권한(ACCESS_BACKGROUND_LOCATION)·위치 추적
 *     (watchPositionAsync·TaskManager)은 쓰지 않는다. 상시 추적 없음이 대표 확정 조건이다.
 *   - **버튼/실행 순간 1회만** 잰다. 폴링·주기 측정 금지.
 *   - **좌표는 서버에 보내고 판정만 남는다** — 서버가 거리를 계산한 뒤 좌표를 폐기한다
 *     (app/api/staff/attendance). 앱도 좌표를 저장하지 않는다.
 *   - **차단 금지.** 권한 거부·GPS 실패도 출근은 기록한다(좌표 없이 → 서버가 플래그).
 *     W2 교훈: 권한 강요 화면으로 앱을 막지 않는다.
 *
 * 실패를 성공으로 위장하지 않는다 — 실패 사유를 그대로 돌려주고 화면이 정직하게 안내한다.
 */
import * as Location from 'expo-location';

export type LocationFix = {
  lat: number;
  lng: number;
  /**
   * GPS 오차(m). 기기가 안 주면 **null = 모름**.
   * ⚠ 모를 때 0 이나 큰 수로 지어내지 않는다 — 서버 판정(judgeGeoVerdict)이 오차만큼
   *   관대해지므로, 0 이면 거짓 '확인됨', 9999 면 어디서 눌러도 '근접'이 된다.
   *   출퇴근은 오차 키를 아예 빼서 보내고(엄격 판정), 시설 등록은 거부한다.
   */
  accuracyM: number | null;
  mockFlag: boolean;
};

export type LocationFailReason =
  /** 사용자가 위치 권한을 주지 않음 */
  | 'denied'
  /** 기기 위치 기능(GPS)이 꺼져 있음 */
  | 'disabled'
  /** 정해진 시간 안에 좌표를 못 받음(실내·지하 등) */
  | 'timeout'
  /** 그 외 오류 */
  | 'error';

export type LocationResult =
  | { ok: true; fix: LocationFix }
  | { ok: false; reason: LocationFailReason; message: string };

/** 좌표 획득 제한 시간 — 실내에서 무한 대기하지 않게. 넘으면 좌표 없이 진행한다. */
const FIX_TIMEOUT_MS = 12_000;

const FAIL_MESSAGE: Record<LocationFailReason, string> = {
  denied: '위치 권한이 없어 위치를 확인하지 못했습니다',
  disabled: '기기의 위치(GPS) 기능이 꺼져 있습니다',
  timeout: '위치를 찾지 못했습니다 — 창가나 실외에서 다시 시도해 주세요',
  error: '위치를 확인하는 중 오류가 발생했습니다',
};

const fail = (reason: LocationFailReason, message?: string): LocationResult => ({
  ok: false,
  reason,
  message: message ?? FAIL_MESSAGE[reason],
});

/**
 * 포그라운드 위치 권한 확인 — 필요할 때만 1회 요청한다.
 * `promptIfNeeded=false` 면 물어보지 않고 현재 상태만 본다(조용한 자동 출근용).
 */
export async function ensureForegroundPermission(promptIfNeeded = true): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (!promptIfNeeded || !current.canAskAgain) return false;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * 지금 위치 1회 획득. 실패해도 throw 하지 않는다 — 호출부가 좌표 없이 진행할 수 있어야 한다.
 *
 * @param promptIfNeeded 권한이 없을 때 OS 권한 창을 띄울지. 자동 출근은 true(하루 1회뿐),
 *                       화면 표시용 재조회 등은 false 로 조용히 건너뛴다.
 */
export async function acquireLocationOnce(promptIfNeeded = true): Promise<LocationResult> {
  const granted = await ensureForegroundPermission(promptIfNeeded);
  if (!granted) return fail('denied');

  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) return fail('disabled');
  } catch {
    /* 조회 실패는 곧바로 실패로 보지 않는다 — 아래에서 실제로 재본다 */
  }

  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (!position) return fail('timeout');

    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fail('error');

    return {
      ok: true,
      fix: {
        lat: latitude,
        lng: longitude,
        accuracyM: typeof accuracy === 'number' && accuracy >= 0 ? Math.round(accuracy) : null,
        mockFlag: position.mocked === true,
      },
    };
  } catch (e) {
    return fail('error', e instanceof Error ? e.message : undefined);
  }
}
