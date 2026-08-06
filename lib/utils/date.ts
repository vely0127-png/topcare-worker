/**
 * 날짜 유틸 — 웹 `lib/utils/date.ts` 규약과 동일.
 *
 * ⛔ `new Date().toISOString().slice(0, 10)` 금지.
 * 그건 UTC 날짜라 새벽 0~9시(KST)에 **전날로 기록된다.**
 * 요양원 야간 근무 시간대에 정확히 걸리는 버그라 반드시 이 함수를 쓴다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 오늘(한국 시각) 'YYYY-MM-DD' */
export function getKSTToday(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 임의 시각을 한국 기준 'YYYY-MM-DD' 로 */
export function toKSTDate(value: Date | string | number): string {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국 기준 'HH:MM' */
export function toKSTTime(value: Date | string | number): string {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}
