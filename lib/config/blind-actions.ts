// 역할 홈 카드 블라인드 정본 — 웹 nav-config의 블라인드와 같은 방식(정본 1곳, 복원 = 키 제거).
// 설계: 01_기획_설계/TopCare_IoT_데이터수집경로_원칙_20260926.md I-3 보강 · SCREENS.md '블라인드' 절.
//
// 2026-10-07 대표 "종사자 앱에서 활동확인은 블라인드로 처리해줘" → 확인 결과 '내 행적'만.
//   'trail' = (tabs)/trail 내 행적(비콘 방문 이력에 무얼 했는지 고르는 화면) — 박달재에 비콘이 없어
//   항상 빈 화면이고, 폰 BLE 스캔의 지위(I-3)가 결정 전이다. 화면·훅·라우트는 삭제하지 않는다.
//   복원 트리거 = 비콘 실설치 또는 I-3 결정.
// 규칙: 블라인드 카드는 '그 외 업무는 아직 앱에 없습니다' 안내 개수에 세지 않는다(없는 기능이 아니라 숨긴 기능).
export const BLIND_ACTION_KEYS: readonly string[] = ['trail'];

export function isBlindAction(key: string): boolean {
  return BLIND_ACTION_KEYS.includes(key);
}
