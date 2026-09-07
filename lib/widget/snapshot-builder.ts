/**
 * 홈 위젯 v1(표시형) — 스냅샷 생성 (W2, 2026-09-07)
 *
 * 정본: `01_기획_설계/ADR-001_워커앱_홈위젯_표시형_20260907.md` §4-1·A2,
 *       `TopCare_워커앱_위젯_요구사항_측정명세_20260907.md` A2·A3.
 *
 * 왜 이 파일이 있나
 *   위젯(네이티브 RemoteViews)은 서버에 쓰지도, 네트워크 호출도 하지 않는다(ADR §2·A1).
 *   앱이 이미 갖고 있는 React Query 캐시(작업판 행·알림·업무 지시·큐)에서 **표시에
 *   필요한 최소 필드만** 뽑아 위젯이 읽을 스냅샷을 만드는 게 이 파일의 유일한 책임이다.
 *
 * ⚠ 개인정보 규칙(ADR §6-1, 명세 A3) — 반드시 지킬 것
 *   - 측정값·메모·평가 내용은 스냅샷에 절대 담지 않는다(그릴 필드 자체가 없다).
 *   - `name`(성명)은 `displayLevel === 'name'`일 때만 채운다. 그 외(count/roomInitial)는
 *     항상 undefined — "위젯이 마스킹을 잊어도 노출 불가"가 되도록 스냅샷 자체에서 제거한다.
 *   - `roomInitial`도 count 모드에서는 채우지 않는다(건수만).
 *
 * ⚠ W1 네이티브 팀이 `lib/widget/snapshot-schema.ts`를 작성 중이다(아직 없음, 읽기 전용
 *   파일 — 이 세션은 만들지 않는다). 그래서 아래 타입은 이 파일 안에 임시로 둔다.
 *   **schema.ts가 생기면 아래 `WidgetSnapshotV1` 등 타입을 그쪽 export로 교체할 것**
 *   (필드 이름은 ADR §4-1 스냅샷 스키마 문구와 동일하게 맞춰 뒀다 — snapshotAtKst, alerts,
 *   services, serviceCounts, directivesPending, queuePending, displayLevel).
 *
 * 시간대 블록(KST, A2): 기상 05~08 / 오전 08~11 / 점심 11~14 / 오후 14~17 / 저녁 17~20 / 야간 20~05.
 * 경계·"오늘" 판정은 KST 벽시계로만 한다(야간 블록이 자정을 넘는다) — UTC 슬라이스 금지.
 */
import type { ServiceSchedule } from '../hooks/useServiceSchedules';
import type { ServiceProvision } from '../hooks/useServiceProvisions';
import type { AlertItem } from '../hooks/useAlerts';
import { buildRoutineSchedules, findVirtualProvision, isVirtualSchedule, type RoutineItem } from '../care/routine-rows';
import { hhmmToMin } from '../hooks/useServiceSchedules';

// ── 표시 수준 (시설 설정, ADR §4-3 · 명세 A3) ──────────────────────────────
export type DisplayLevel = 'count' | 'roomInitial' | 'name';

// ── 임시 타입(W1 snapshot-schema.ts 로 교체 예정) ───────────────────────────
export interface WidgetAlertRow {
  id: string;
  /** displayLevel이 count면 이 필드 자체를 만들지 않는다(호출부에서 배열을 비움) */
  roomNo?: string;
  initial?: string;
  name?: string;
  /** 화면에 보일 유형 라벨(측정값 없이 "혈압 위험"처럼 사실만, 진단·예방 표현 금지) */
  kind: string;
  atKst: string;
}

export interface WidgetServiceRow {
  scheduleId: string;
  residentId: string;
  roomNo?: string;
  initial?: string;
  name?: string;
  serviceType: string;
  plannedAtKst: string;
  /** 이전 블록에서 넘어온 미완료(지연) — A2 "이전 블록 미완료(지연 배지)" */
  delayed?: boolean;
}

export interface WidgetSnapshotV1 {
  snapshotAtKst: string;
  loggedIn: boolean;
  displayLevel: DisplayLevel;
  alerts: WidgetAlertRow[];
  services: WidgetServiceRow[];
  serviceCounts: { block: string; done: number; total: number };
  directivesPending: number;
  queuePending: number;
}

/** 위젯이 아무것도 표시하지 않을 때(로그아웃 등) — clear()가 쓰는 최소 형태. */
export function emptyWidgetSnapshot(nowIso: string): WidgetSnapshotV1 {
  return {
    snapshotAtKst: nowIso,
    loggedIn: false,
    displayLevel: 'roomInitial',
    alerts: [],
    services: [],
    serviceCounts: { block: '', done: 0, total: 0 },
    directivesPending: 0,
    queuePending: 0,
  };
}

// ── 시간대 블록 (ADR §4-1, 명세 A2) ─────────────────────────────────────────
export interface TimeBlockDef {
  /** 표시 라벨 */
  label: string;
  /** 시작 시(KST, 0~23) */
  startHour: number;
}

/** 경계 05/08/11/14/17/20 — 야간(20시)은 다음날 05시까지(자정을 넘는다). */
export const TIME_BLOCKS: TimeBlockDef[] = [
  { label: '기상', startHour: 5 },
  { label: '오전', startHour: 8 },
  { label: '점심', startHour: 11 },
  { label: '오후', startHour: 14 },
  { label: '저녁', startHour: 17 },
  { label: '야간', startHour: 20 },
];

/** KST 벽시계 분(0~1439) 기준으로 지금 블록의 인덱스(TIME_BLOCKS 기준)를 구한다.
 *  자정을 넘는 야간 블록(20:00~04:59)도 이 함수 하나로 옳게 판정된다 —
 *  05:00 이전(00:00~04:59)은 여전히 "야간"(인덱스 5, 전날에서 이어짐)이다. */
export function currentBlockIndex(nowMinutesKst: number): number {
  const hour = Math.floor(nowMinutesKst / 60);
  if (hour < 5) return TIME_BLOCKS.length - 1; // 00:00~04:59 → 전날 야간의 연장
  let idx = 0;
  TIME_BLOCKS.forEach((b, i) => { if (hour >= b.startHour) idx = i; });
  return idx;
}

/** 블록 시작~끝 'HH:MM' 범위(표시용, 필요 시). */
export function blockRangeLabel(idx: number): string {
  const start = TIME_BLOCKS[idx];
  const next = TIME_BLOCKS[(idx + 1) % TIME_BLOCKS.length];
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${fmt(start.startHour)}~${fmt(next.startHour)}`;
}

// ── 호실·이니셜 계산 (명세 A3 "호실+이니셜(기본)") ──────────────────────────

/** 흔한 2자 성(복성) — 이 목록에 있으면 성 2자로 본다. 목록에 없으면 1자로 본다.
 *  완전한 사전은 아니다(휴리스틱) — 성씨 사전을 새로 들이지 않는다(비용 규율). */
const COMPOUND_SURNAMES = new Set(['남궁', '황보', '제갈', '사공', '선우', '서문', '독고', '동방', '황목', '어금']);

/** 이름 → 이니셜(성 1자+○○, 성이 2자로 흔한 복성이면 성 2자+○).
 *  이름이 성 길이 이하로 짧으면(예: 외자) 성만 그대로 반환(마스킹 대상 없음). */
export function computeInitial(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const surnameLen = COMPOUND_SURNAMES.has(trimmed.slice(0, 2)) ? 2 : 1;
  if (trimmed.length <= surnameLen) return trimmed;
  const surname = trimmed.slice(0, surnameLen);
  const maskLen = trimmed.length - surnameLen;
  return `${surname}${'○'.repeat(maskLen)}`;
}

/** 입소자 room 필드를 위젯 표시용으로(이미 "101호"면 그대로, 숫자만이면 "호" 접미사). */
export function formatRoomNo(room: string | null | undefined): string {
  const r = (room ?? '').trim();
  if (!r) return '';
  return /호\s*$/.test(r) ? r : `${r}호`;
}

// ── 알림 구역 (A2 "미해결(new·acknowledged)을 발생 시각 내림차순", 최대 3건) ──

export interface ResidentDirectory {
  id: string;
  name: string;
  room: string;
}

function buildAlertRow(
  a: AlertItem,
  displayLevel: DisplayLevel,
  byResidentId: Map<string, ResidentDirectory>,
): WidgetAlertRow {
  const dir = a.residentId ? byResidentId.get(a.residentId) : undefined;
  const roomNo = dir ? formatRoomNo(dir.room) : formatRoomNo(a.roomName);
  const name = dir?.name ?? a.residentName;
  const row: WidgetAlertRow = { id: a.id, kind: a.type || a.title, atKst: a.createdAt };
  if (displayLevel === 'count') return row; // 건수만 — 필드 자체를 채우지 않는다
  row.roomNo = roomNo;
  row.initial = name ? computeInitial(name) : undefined;
  if (displayLevel === 'name') row.name = name; // name은 이 모드에서만 존재한다(A3)
  return row;
}

export function buildAlertRows(args: {
  alerts: AlertItem[];
  displayLevel: DisplayLevel;
  residents: ResidentDirectory[];
  limit?: number;
}): WidgetAlertRow[] {
  const { alerts, displayLevel, residents, limit = 3 } = args;
  const byResidentId = new Map(residents.map((r) => [r.id, r]));
  return alerts
    .filter((a) => a.status === 'new' || a.status === 'acknowledged')
    .slice() // 내림차순 정렬(발생 시각) — 원본 배열 변형 방지
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, limit)
    .map((a) => buildAlertRow(a, displayLevel, byResidentId));
}

// ── 서비스 구역 (A2 "현재 블록 미완료 → 없으면 이전 블록(지연) → 없으면 완료 N/N") ──

interface ScheduleRow {
  schedule: ServiceSchedule;
  done: ServiceProvision | null;
}

/** 워크보드와 동일 규약으로 오늘의 계획(실계획 + 시설 일과표 가상행)을 만들고
 *  제공기록과 매칭한다 — 정본은 lib/care/routine-rows(복붙 금지). */
export function buildTodayScheduleRows(args: {
  allSchedules: ServiceSchedule[]; // isActive 필터는 호출부에서 이미 했다고 가정하지 않는다 — 여기서 한 번 더 건다
  todayDow: number;
  routine: RoutineItem[];
  residents: ResidentDirectory[];
  provisions: ServiceProvision[];
}): ScheduleRow[] {
  const { allSchedules, todayDow, routine, residents, provisions } = args;
  const real = allSchedules.filter(
    (s) => s.isActive && s.plannedStart && (s.dayOfWeek === null || s.dayOfWeek === todayDow),
  );
  const virtual = buildRoutineSchedules({
    routine,
    residents: residents.map((r) => ({ id: r.id, name: r.name })),
    realSchedules: real,
    allSchedules,
  });
  const schedules = [...real, ...virtual];

  const byScheduleId = new Map<string, ServiceProvision>();
  for (const p of provisions) {
    if (p.scheduleId && !byScheduleId.has(p.scheduleId)) byScheduleId.set(p.scheduleId, p);
  }

  return schedules.map((s) => {
    const done = isVirtualSchedule(s)
      ? findVirtualProvision(s, provisions, (iso) => {
          if (!iso) return null;
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return null;
          const mins = (d.getUTCHours() * 60 + d.getUTCMinutes() + 9 * 60) % (24 * 60);
          return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        })
      : (byScheduleId.get(s.id) ?? null);
    return { schedule: s, done };
  });
}

/** 스케줄 행 → 블록 인덱스(plannedStart 기준). */
function blockIndexOfSchedule(row: ScheduleRow): number {
  const hhmm = row.schedule.plannedStart;
  if (!hhmm) return currentBlockIndex(0);
  return currentBlockIndex(hhmmToMin(hhmm));
}

function buildServiceRow(
  row: ScheduleRow,
  displayLevel: DisplayLevel,
  byResidentId: Map<string, ResidentDirectory>,
  delayed: boolean,
): WidgetServiceRow {
  const dir = byResidentId.get(row.schedule.residentId);
  const name = dir?.name ?? row.schedule.residentName ?? undefined;
  const out: WidgetServiceRow = {
    scheduleId: row.schedule.id,
    residentId: row.schedule.residentId,
    serviceType: row.schedule.serviceType,
    plannedAtKst: row.schedule.plannedStart ?? '',
    ...(delayed ? { delayed: true } : {}),
  };
  if (displayLevel === 'count') return out;
  out.roomNo = dir ? formatRoomNo(dir.room) : undefined;
  out.initial = name ? computeInitial(name) : undefined;
  if (displayLevel === 'name') out.name = name;
  return out;
}

export function buildServiceSection(args: {
  rows: ScheduleRow[];
  nowMinutesKst: number;
  displayLevel: DisplayLevel;
  residents: ResidentDirectory[];
  limit?: number;
}): { services: WidgetServiceRow[]; serviceCounts: { block: string; done: number; total: number } } {
  const { rows, nowMinutesKst, displayLevel, residents, limit = 3 } = args;
  const byResidentId = new Map(residents.map((r) => [r.id, r]));
  const curIdx = currentBlockIndex(nowMinutesKst);

  const inBlock = (idx: number) => rows.filter((r) => blockIndexOfSchedule(r) === idx);
  const currentRows = inBlock(curIdx);
  const total = currentRows.length;
  const done = currentRows.filter((r) => r.done).length;
  const serviceCounts = { block: TIME_BLOCKS[curIdx].label, done, total };

  const incompleteSorted = (arr: ScheduleRow[]) =>
    arr
      .filter((r) => !r.done)
      .sort((a, b) => hhmmToMin(a.schedule.plannedStart ?? '99:99') - hhmmToMin(b.schedule.plannedStart ?? '99:99'));

  let picked = incompleteSorted(currentRows);
  let delayed = false;
  if (picked.length === 0) {
    // 현재 블록 전부 완료 → 이전 블록 미완료(지연 배지). 다음 블록 예정은 보여주지 않는다(A2).
    const prevIdx = (curIdx - 1 + TIME_BLOCKS.length) % TIME_BLOCKS.length;
    const prevRows = incompleteSorted(inBlock(prevIdx));
    if (prevRows.length > 0) {
      picked = prevRows;
      delayed = true;
    }
  }

  const services = picked.slice(0, limit).map((r) => buildServiceRow(r, displayLevel, byResidentId, delayed));
  return { services, serviceCounts };
}

// ── 종합 조립 ────────────────────────────────────────────────────────────

export function buildWidgetSnapshot(args: {
  nowIsoKst: string; // getKSTNowWallClockIso() 결과 그대로
  nowMinutesKst: number; // 벽시계 분(0~1439)
  todayDow: number;
  allSchedules: ServiceSchedule[];
  routine: RoutineItem[];
  residents: ResidentDirectory[];
  provisions: ServiceProvision[];
  alerts: AlertItem[];
  directivesPending: number;
  queuePending: number;
  displayLevel: DisplayLevel;
}): WidgetSnapshotV1 {
  const rows = buildTodayScheduleRows({
    allSchedules: args.allSchedules,
    todayDow: args.todayDow,
    routine: args.routine,
    residents: args.residents,
    provisions: args.provisions,
  });
  const { services, serviceCounts } = buildServiceSection({
    rows,
    nowMinutesKst: args.nowMinutesKst,
    displayLevel: args.displayLevel,
    residents: args.residents,
  });
  const alerts = buildAlertRows({
    alerts: args.alerts,
    displayLevel: args.displayLevel,
    residents: args.residents,
  });

  return {
    snapshotAtKst: args.nowIsoKst,
    loggedIn: true,
    displayLevel: args.displayLevel,
    alerts,
    services,
    serviceCounts,
    directivesPending: args.directivesPending,
    queuePending: args.queuePending,
  };
}
