/**
 * 워커앱 공용 디자인 토큰 — 50~70대 요양보호사 현장 기준.
 *
 * 2026-08-06 요양원 PoC 피드백: "전체 화면 폰트가 너무 작다",
 * "사용자층이 50~70대이니 1페이지 1작업으로" → 큰 글씨 고정 스케일을 정본으로 둔다.
 *
 * 규칙
 * - 화면에서 fontSize 를 숫자로 직접 쓰지 말고 여기 값을 쓴다.
 * - **14 미만 금지.** 현장에서 안 읽힌다. (기존 화면에 10~13pt 라벨이 다수 있었음)
 * - 누를 수 있는 것은 최소 높이 TOUCH.min(56). 장갑 낀 손·떨리는 손 기준.
 */

/** 글자 크기 — 이 스케일 밖의 값을 쓰지 않는다. */
export const FONT = {
  /** 입소자 이름 등 화면의 주인공 1개 */
  display: 34,
  /** 화면 제목 / 헤더 */
  title: 24,
  /** 섹션 제목 */
  heading: 20,
  /** 본문·버튼 라벨 기본값 */
  body: 18,
  /** 입력 항목 라벨, 보조 버튼 */
  label: 16,
  /** 최소 크기 — 단위(°C, bpm), 시각 등 보조 정보에만. 이보다 작게 쓰지 말 것 */
  caption: 14,
  /** 숫자 입력값 — 눈으로 확인하며 두드리는 값이라 가장 크게 */
  value: 30,
  /** 진행 수치(3/12명) 등 강조 숫자 */
  metric: 28,
} as const;

/** 터치 타깃 최소 크기(px) */
export const TOUCH = {
  /** 모든 누를 수 있는 요소의 최소 높이 */
  min: 56,
  /** 주요 동작 버튼(저장하고 다음 등) */
  large: 68,
  /** 홈 메뉴 큰 버튼 */
  menu: 84,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** 색 — 기존 화면에서 쓰던 값을 그대로 상수화(색 변경 아님) */
export const COLOR = {
  primary: '#1A5276',
  primaryDark: '#14405C',
  onPrimary: '#FFFFFF',

  bg: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  text: '#111827',
  textSub: '#4B5563',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',

  success: '#16A34A',
  successBg: '#DCFCE7',
  warning: '#CA8A04',
  warningBg: '#FEF9C3',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  caution: '#EA580C',
  cautionBg: '#FED7AA',
} as const;

/** 자주 쓰는 텍스트 스타일 조합 */
export const TEXT = {
  display: { fontSize: FONT.display, fontWeight: '700' as const, color: COLOR.text },
  title: { fontSize: FONT.title, fontWeight: '700' as const, color: COLOR.text },
  heading: { fontSize: FONT.heading, fontWeight: '700' as const, color: COLOR.text },
  body: { fontSize: FONT.body, color: COLOR.text },
  bodyStrong: { fontSize: FONT.body, fontWeight: '600' as const, color: COLOR.text },
  label: { fontSize: FONT.label, color: COLOR.textSub },
  caption: { fontSize: FONT.caption, color: COLOR.textMuted },
} as const;
