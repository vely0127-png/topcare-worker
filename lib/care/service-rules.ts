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
  // 2026-08-31: 웹과 동일 — 목욕은 요일 배정자에게만(일과표에 넣어도 전원 매일이 되지 않게)
  'bathing',
]);

// ⚠ 2026-08-31: 웹(2026-08-26 수정)과 미러가 어긋나 있었다 — 앱에는 '세면=목욕' 버그가
//   그대로 살아 있었다. 목욕은 횟수가 관리되는 급여라 세면을 목욕으로 기록하면
//   목욕 횟수가 매일 부풀려진다. 웹과 동일 규칙으로 맞춘다.
//   (이 파일은 웹 lib/care/service-rules.ts 의 미러다 — 한쪽만 고치지 말 것)
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
