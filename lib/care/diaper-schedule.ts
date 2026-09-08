// ============================================================
// 균등 배분 시각 산식 — 웹 lib/care/diaper-schedule.ts 이식 (2026-09-08)
// expectedCount(횟수)로 등록된 반복 계획(기저귀 교체 등)은 intervalMin 등차 누적이 아니라
// 시작~종료를 count개로 균등 배분해야 한다 — 이 함수 하나만 쓴다(계산 로직 복붙 금지).
//
// 왜 필요한가 (6차 QA 관찰, 2026-09-08 정정)
//   웹은 균등 배분으로 04:30·08:53·13:15·17:38·22:00을 그리지만, 저장된
//   intervalMin=262(내림)를 등차로 쓰는 소비자는 08:52·13:14·17:36·21:58이 되어 시각이 어긋난다.
//   워커앱도 웹과 같은 산식을 써야 같은 계획이 같은 시각으로 보인다.
// ============================================================

export interface DiaperConfig {
  start: string; // 'HH:MM'
  end: string;   // 'HH:MM'
  count: number; // 1~12
}

export const DEFAULT_DIAPER: DiaperConfig = { start: '04:30', end: '22:00', count: 5 };

const MIN_COUNT = 1;
const MAX_COUNT = 12;

function toMin(hhmm: unknown): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function toHHMM(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeCount(count: unknown): number {
  const n = Math.round(Number(count));
  if (!Number.isFinite(n)) return DEFAULT_DIAPER.count;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, n));
}

/** 균등 배분된 시각 목록 ('HH:MM'[]). 설정이 없거나 잘못되면 기본값(04:30~22:00, 5회)으로 대체. */
export function diaperSlots(cfg?: Partial<DiaperConfig> | null): string[] {
  const c: DiaperConfig = { ...DEFAULT_DIAPER, ...(cfg ?? {}) };
  const n = normalizeCount(c.count);
  const s = toMin(c.start);
  const e = toMin(c.end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return diaperSlots(DEFAULT_DIAPER);
  if (n === 1) return [toHHMM(s)];
  const interval = (e - s) / (n - 1);
  return Array.from({ length: n }, (_, i) => toHHMM(s + i * interval));
}
