/**
 * 소급 기록 note 접두 규약 — `[소급: 사유] 원래 note` (기본서비스 설계 B-9, 26차-a R8)
 *
 * 서버(웹 lib/care/service-provision-service.ts createServiceProvisionCore)가 D-2 이상 소급 저장 때 사유를 note 앞에 붙인다.
 * 앱은 note로 가상행(시설 일과표 파생)·예외 기록을 되찾으므로, 비교 전에 이 접두를 걷어야 소급 저장분이 같은 행으로 읽힌다.
 * 웹 lib/care/backfill-window.ts stripBackfillNotePrefix / backfillReasonOfNote 와 같은 규칙(문자열 접두 규칙만 — 날짜 판정은
 * 서버가 day-keys의 backfilled로 내려 주므로 앱에는 없다).
 */
const PREFIX_RE = /^\[소급: [^\]]*\]\s*/;

/** note 앞의 `[소급: 사유]`를 걷어 낸 원문(없으면 그대로, null은 null) */
export function stripBackfillNotePrefix(note: string | null | undefined): string | null {
  if (note == null) return null;
  return note.replace(PREFIX_RE, '');
}

/** note에서 소급 사유만(없으면 null) — 칩 보조 문구용 */
export function backfillReasonOfNote(note: string | null | undefined): string | null {
  const m = /^\[소급: ([^\]]*)\]/.exec(note ?? '');
  return m ? m[1] : null;
}
