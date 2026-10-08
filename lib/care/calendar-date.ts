/**
 * 시간표 행의 실제 달력 날짜 — 서버가 내려 준 규칙을 문자열로 비교만 한다 (QA37 N01, 26차-a-h R3)
 *
 * 왜: 야간 띠의 '익일 새벽' 행(plannedStart 05:00 미만)은 선택일 화면에 있지만 실제 제공일은 선택일 다음 날이다.
 *   이 규칙(경계 시각·다음 날 날짜)의 정본은 웹 서버다 — GET /api/care/service-provisions/day-keys?withNextDawn=1이
 *   응답 최상위에 nextDawn { date: '<선택일+1>', boundary: '05:00' }을 함께 내려 준다.
 *   앱은 날짜 산술(+1일)도 경계값(05:00) 하드코딩도 하지 않는다 — 행 시각이 boundary보다 이르면 nextDawn.date, 아니면 선택일.
 * 웹 대응: lib/care/today-schedule-rows.ts calendarDateOf · isFutureRow · FUTURE_ROW_NOTICE(같은 판정, 같은 문구).
 */

/** day-keys 응답의 nextDawn 규칙 — 서버 정본값 그대로 */
export interface NextDawnRule { date: string; boundary: string }

/** 내일 날짜 행 안내 문구(웹 FUTURE_ROW_NOTICE와 같은 문장) */
export const FUTURE_ROW_NOTICE = '내일 날짜 기록은 내일 할 수 있습니다';

/**
 * 행의 실제 달력 날짜(KST 'YYYY-MM-DD').
 * plannedStart가 있고 'HH:MM' 문자열 비교로 rule.boundary보다 이르면 rule.date(= 선택일 다음 날), 그 외(시각 없음·규칙 없음 포함)는 선택일.
 */
export function calendarDateOfStart(
  selectedDate: string,
  plannedStart: string | null | undefined,
  rule: NextDawnRule | null | undefined,
): string {
  return rule && plannedStart && plannedStart < rule.boundary ? rule.date : selectedDate;
}

/** 아직 오지 않은 날짜인가 — 'YYYY-MM-DD' 문자열 비교(오늘 화면의 '익일 새벽' 행 = 내일). 서버도 미래 serviceDate는 422로 막는다. */
export function isFutureCalendarDate(calendarDate: string | null | undefined, today: string): boolean {
  return !!calendarDate && calendarDate > today;
}
