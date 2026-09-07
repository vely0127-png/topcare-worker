/**
 * 홈 위젯 v1(표시형) — RN <-> 네이티브 브리지 (W1 네이티브 팀, 2026-09-07)
 *
 * 정본: `01_기획_설계/ADR-001_워커앱_홈위젯_표시형_20260907.md` §4-1·§4-4.
 * 네이티브 구현: android/app/src/main/java/kr/topcare/worker/widget/WidgetSnapshotModule.kt
 * (+ 등록: MainApplication.kt에 WidgetSnapshotPackage 추가).
 *
 * 이 파일이 하는 일은 정확히 두 가지뿐이다 — 스냅샷을 네이티브(SharedPreferences)에
 * 쓰거나 지우는 것. 위젯이 서버에 쓰지 않는다는 ADR 결정을 지키려면 이 파일도
 * 네트워크 호출을 하지 않아야 한다(하지 않음).
 *
 * ⚠ 통합 지점(보고 대상): `lib/widget/write-snapshot.ts`(W2 팀의 임시 구현)가
 *   이 파일이 생기면 자기 함수 본문을 이 파일 호출로 바꾸겠다고 주석에 남겨 뒀다.
 *   이 세션은 write-snapshot.ts·useWidgetSync.ts를 수정하지 않는다(다른 팀 파일,
 *   동시 작업 중) — 함수 시그니처(writeWidgetSnapshot(snapshot), clearWidgetSnapshot())를
 *   똑같이 맞춰 뒀으니 교체는 그쪽에서 이 파일 import로 바꾸기만 하면 된다.
 *
 * Android 외 플랫폼(iOS/web) 및 모듈 미탑재 환경(웹 QA 빌드 등)에서는 전부 no-op —
 * v1은 Android 우선(ADR §4-5)이고, 위젯 갱신 실패가 현장 업무(기록·측정)를 막으면 안 된다.
 */
import { NativeModules, Platform } from 'react-native';
import type { WidgetSnapshotV1 } from './snapshot-builder';
import { emptyWidgetSnapshot } from './snapshot-builder';

interface WidgetSnapshotNativeModule {
  write?: (json: string) => Promise<boolean> | boolean | void;
  clear?: () => Promise<boolean> | boolean | void;
  requestPin?: () => Promise<boolean> | boolean;
}

function nativeModule(): WidgetSnapshotNativeModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  return (NativeModules as Record<string, WidgetSnapshotNativeModule | undefined>).WidgetSnapshot;
}

/** 스냅샷을 네이티브(SharedPreferences)에 기록 — 실패해도 throw 하지 않는다.
 *  네이티브 쪽(WidgetSnapshotModule.write)이 최소 스키마 검증을 한 번 더 하므로,
 *  손상된 JSON은 저장되지 않고 promise가 reject되지만 여기서 삼킨다. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshotV1): Promise<void> {
  try {
    const mod = nativeModule();
    if (mod?.write) await mod.write(JSON.stringify(snapshot));
  } catch {
    /* 조용히 무시 — 위젯은 부가 기능, 현장 업무를 막지 않는다 */
  }
}

/** 로그아웃·계정 전환·세션 만료 시 즉시 호출(C-10). 네이티브 모듈이 clear를 노출하면
 *  그것을 쓰고, 없으면(구버전 등) 빈 스냅샷을 write해 "로그인 필요" 상태로 대체한다. */
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
