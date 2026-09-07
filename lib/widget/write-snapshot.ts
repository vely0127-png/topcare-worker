/**
 * 네이티브 브리지 최소 래퍼 (W2, 2026-09-07)
 *
 * W1이 `lib/widget/native.ts`(정식 WidgetSnapshot 모듈, write/clear — ADR §4-4)를
 * 작성 중이다. 아직 없으므로(읽기 전용 파일 — 이 세션은 만들지 않는다) 이 파일이
 * `NativeModules.WidgetSnapshot`을 직접 호출한다. **native.ts가 생기면 이 두 함수의
 * 본문만 그 모듈 호출로 바꾸면 된다** — 호출부(useWidgetSync.ts·pin.ts·auth-store.ts)는
 * 이 파일의 함수 시그니처만 알면 되므로 교체가 국소적이다(통합 지점, 보고 대상).
 *
 * Android 외 플랫폼(iOS/web)은 no-op — v1은 Android 우선(ADR §4-5).
 * 실패는 전부 조용히 삼킨다 — 위젯 갱신 실패가 현장 업무(기록·측정)를 막으면 안 된다.
 */
import { NativeModules, Platform } from 'react-native';
import type { WidgetSnapshotV1 } from './snapshot-builder';
import { emptyWidgetSnapshot } from './snapshot-builder';

interface WidgetSnapshotNativeModule {
  write?: (json: string) => void | Promise<void>;
  clear?: () => void | Promise<void>;
}

/** requestPin()은 여기 두지 않는다 — [홈 화면에 위젯 추가] 전용 래퍼는 lib/widget/pin.ts. */
function nativeModule(): WidgetSnapshotNativeModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  return (NativeModules as Record<string, WidgetSnapshotNativeModule | undefined>).WidgetSnapshot;
}

/** 스냅샷을 네이티브(SharedPreferences)에 기록 — 실패해도 throw 하지 않는다. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshotV1): Promise<void> {
  try {
    const mod = nativeModule();
    if (mod?.write) await mod.write(JSON.stringify(snapshot));
  } catch {
    /* 조용히 무시 — 위젯은 부가 기능, 현장 업무를 막지 않는다 */
  }
}

/** 로그아웃·계정 전환·세션 만료 시 즉시 호출 (C-10). clear가 없는 모듈이면
 *  빈 스냅샷을 write해 "로그인 필요" 상태로 대체한다. */
export async function clearWidgetSnapshot(): Promise<void> {
  try {
    const mod = nativeModule();
    if (mod?.clear) {
      await mod.clear();
      return;
    }
    if (mod?.write) await mod.write(JSON.stringify(emptyWidgetSnapshot(new Date().toISOString())));
  } catch {
    /* 조용히 무시 */
  }
}
