// ============================================================
// 서비스 개인화 규칙 — 웹 lib/care/service-rules.ts 미러 (P0-4, 2026-07-27)
// serviceType은 반드시 이 코드값을 쓴다. 한글 라벨을 값으로 보내면
// 웹의 관찰·식사·투약 자동 연동과 개인계획 경고(C5)가 전부 미발동된다.
// 웹 쪽이 바뀌면 이 파일도 함께 갱신할 것 (단일 정본은 웹).
// ============================================================

export const SERVICE_TYPES: { value: string; label: string }[] = [
  { value: 'meal', label: '식사도움' },
  { value: 'medication', label: '투약' },
  { value: 'vital', label: '바이탈 측정' },
  { value: 'bathing', label: '목욕' },
  { value: 'position', label: '체위변경' },
  { value: 'defecation', label: '배변 케어' },
  { value: 'program', label: '프로그램' },
  { value: 'therapy', label: '기능회복훈련' },
  { value: 'nursing', label: '간호처치' },
  { value: 'routine', label: '일과' },
];

export const serviceTypeLabel = (t: string): string =>
  SERVICE_TYPES.find((s) => s.value === t)?.label ?? t;

export const PERSONAL_TYPES: ReadonlySet<string> = new Set([
  'defecation',
  'position',
  'medication',
  'therapy',
  'nursing',
]);

// 시설 일과표(설정>일과표) 항목 → 서비스 유형 추론
//
// ⚠ 2026-08-26 웹에서 수정된 내용이 앱에는 반영되지 않아 2026-08-31 뒤늦게 옮긴다.
//   '세면'이 목욕(bathing) 패턴에 있어서 기본 일과 '기상 · 세면'이 **목욕 급여**로
//   기록되고 있었다. 목욕은 횟수가 관리되는 급여이고 기록지·청구의 근거가 되므로,
//   세면(일상 위생)을 목욕으로 기록하면 목욕 횟수가 매일 부풀려진다.
//   → 세면·양치·구강은 목욕이 아니라 '일과(routine)'로 떨어뜨린다.
//   목욕은 목욕·샤워·입욕처럼 명시된 경우에만 인정한다(추측 금지).
//
//   앱이 공동 작업판에서 일과표를 읽기 시작한 2026-08-31 이전에는 이 함수가 앱에서
//   거의 쓰이지 않아 드러나지 않았다. 일과표를 붙이는 순간 입소자 61명 × 매일
//   목욕 기록이 생길 뻔했다.
//
// ⚠ 이 규칙은 웹 topcare-web/lib/care/service-rules.ts 와 **같은 값이어야 한다.**
//   한쪽만 고치면 웹과 앱이 같은 일과를 다른 급여로 기록한다 — 이번이 그 사고였다.
export function inferTypeFromActivity(activity: string): string {
  if (/식사|아침\s*식|점심|저녁\s*식|간식/.test(activity)) return 'meal';
  if (/기저귀|배변|화장실/.test(activity)) return 'defecation';
  if (/투약|복약/.test(activity)) return 'medication';
  // 세면·양치·구강위생은 목욕이 아니다 — 목욕 급여 횟수를 부풀리지 않기 위해 먼저 걸러낸다
  if (/세면|양치|구강|손\s*씻/.test(activity)) return 'routine';
  if (/목욕|샤워|입욕/.test(activity)) return 'bathing';
  if (/체위|자세/.test(activity)) return 'position';
  if (/프로그램|여가|레크/.test(activity)) return 'program';
  if (/바이탈|혈압|혈당|체온|측정/.test(activity)) return 'vital';
  if (/재활|물리치료|운동/.test(activity)) return 'therapy';
  if (/간호|처치|소독/.test(activity)) return 'nursing';
  return 'routine';
}
