/**
 * useBeaconProximity — 앱 전역 단일 스캐너(BeaconProvider)를 읽는 훅.
 *
 * 2026-08-06: 이 파일에 있던 엔진·스캐너 생성 로직을 `lib/beacon/provider.tsx` 로 옮겼다.
 * 훅이 호출될 때마다 스캐너가 새로 생기던 구조(근접·자동기록·비콘등록 3곳 = 스캐너 3개)가
 * 중복 이벤트·배터리 낭비·화면별 상이한 '현재 위치'의 원인이었다.
 *
 * 반환 형태는 그대로라 기존 사용처는 수정 없이 동작한다.
 */
export {
  useBeaconContext as useBeaconProximity,
  syncRegistryFromServer,
  type BeaconAttendanceState,
  type UseBeaconProximityResult,
} from '../beacon/provider';
