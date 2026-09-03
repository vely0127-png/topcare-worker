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

/**
 * 지금(한국 시각)의 **벽시계 ISO** — 'YYYY-MM-DDTHH:MM:SS+09:00'
 *
 * ⛔ CareRecord.recordTime 등 **시각만 담는 컬럼**(`@db.Time`)에는
 *    `new Date().toISOString()`(=UTC 벽시계) 을 보내지 말 것.
 *    UTC 시:분이 컬럼에 그대로 들어가 07:00 기록이 22:00으로 남았다
 *    (2026-09-03 외부 QA P2 — 서버 normalizeWallClockTimeInput 로 방어 중이지만
 *     여기가 근본 원인이라 앱에서 벽시계를 보내 제거한다).
 *
 * 오프셋(+09:00)을 명시해 보낸다 — 서버가 존 접미사를 보고 KST 벽시계로 정규화한다.
 * 오프셋을 빼면(floating) 서버 타임존에 결과가 좌우된다.
 * 작업판이 startAt 에 쓰는 `${today}T${hhmm}:00+09:00` 규약과 같은 형식이다.
 */
export function getKSTNowWallClockIso(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${kst.toISOString().slice(0, 10)}T${hh}:${mm}:${ss}+09:00`;
}
