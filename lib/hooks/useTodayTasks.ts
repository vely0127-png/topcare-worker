/**
 * useTodayTasks — 오늘 할 일 행 구성·체크 로직 (2026-08-05, index.tsx에서 추출)
 *
 * 웹 ServiceTodoList와 동일 규약:
 *  - 행 = 개인 계획(ServiceSchedule, 반복주기 전개) + 시설 일과표 × 입소자(개인화 유형은 계획 보유자만)
 *  - 체크 = POST service-provisions (startAt=계획 시각 — H8), 해제 = DELETE
 *  - 서버 경고(C5·H4)는 호출측에 onWarning으로 전달해 반드시 노출
 *
 * ⚠ 사용처 주의 (2026-08-31 정정)
 *   원래 주석은 사용처를 "(tabs)/index.tsx + (tabs)/proximity.tsx" 로 적어두었지만,
 *   탭바 제거 UX 개편(2026-08-06) 이후 **어떤 화면도 이 훅을 호출하지 않는다.**
 *   그 사이 워커앱에서 서비스 시간표를 보여주는 화면은 [공동 작업판] 하나뿐이었는데
 *   그 화면은 시설 일과표를 읽지 않아, 웹에는 610건이 뜨는데 앱만 비어 있는 사고가 났다.
 *   일과표 병합 로직은 lib/care/routine-rows 로 뽑아 공동 작업판과 공유한다 —
 *   이 훅을 되살리든 지우든, **병합 구현을 여기에 다시 복사하지 말 것.**
 */
import { useCallback, useMemo, useState } from 'react';
import { useServiceSchedules } from './useServiceSchedules';
import {
  useServiceProvisions, useCreateServiceProvision, useDeleteServiceProvision,
  type ServiceProvision,
} from './useServiceProvisions';
import { useResidents } from './useResidents';
import { useApiQuery } from './useApi';
import { buildRoutineSchedules } from '../care/routine-rows';
import { diaperSlots } from '../care/diaper-schedule';

// ── KST 헬퍼 ──
// 정본은 lib/utils/date. 여기서는 기존 사용처 호환을 위해 재수출만 한다(이원화 금지).
import { getKSTToday } from '../utils/date';
export const kstToday = getKSTToday;
export function kstHHMM(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = (d.getUTCHours() * 60 + d.getUTCMinutes() + 9 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
export function kstNowHHMM(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
export function expandInterval(start: string, end: string, intervalMin: number): string[] {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const s = toMin(start), e = toMin(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || intervalMin < 30) return [start];
  const times: string[] = [];
  for (let t = s; t <= e && times.length < 24; t += intervalMin) {
    times.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return times;
}

// Q5-03 (웹 components/care/ServiceTodoList.tsx 이식, 2026-09-08): expectedCount>=2 +
// plannedStart/End가 있으면 intervalMin 등차 누적이 아니라 diaperSlots(균등 배분, 마지막
// 슬롯=종료 시각 보장)로 전개한다. expectedCount가 없거나 1이면(체위변경 2시간 등 순수 고정
// 주기) 기존 expandInterval 등차 전개를 유지한다 — 이쪽은 "횟수"가 아니라 "주기"가 정본이다.
export function expandSchedule(
  start: string,
  end: string,
  intervalMin: number | null | undefined,
  expectedCount: number | null | undefined,
): string[] {
  if (expectedCount != null && expectedCount >= 2) return diaperSlots({ start, end, count: expectedCount });
  if (!intervalMin || intervalMin < 30) return [start];
  return expandInterval(start, end, intervalMin);
}

export interface DisplayRow {
  key: string;
  residentId: string;
  residentName: string;
  serviceType: string;
  plannedStart: string | null;
  note: string | null;
  scheduleId: string | null; // null = 일과표 파생(가상)
  dayLabel: string;
}

interface FacilityConfig {
  scheduleConfig?: { dailyRoutine?: { time: string; activity: string }[] } | null;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface UseTodayTasksResult {
  today: string;
  rows: DisplayRow[];
  residents: { id: string; name: string }[];
  provisionFor: (row: DisplayRow) => ServiceProvision | undefined;
  toggle: (row: DisplayRow, onWarning: (msg: string) => void, onError: (msg: string) => void) => Promise<void>;
  pendingKeys: Set<string>;
  doneCount: number;
  loading: boolean;
  fetchError: string | null;
  refetchAll: () => void;
}

export function useTodayTasks(): UseTodayTasksResult {
  const today = kstToday();
  const todayDow = new Date(`${today}T12:00:00+09:00`).getUTCDay();

  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 500 });
  const residentsQ = useResidents({ status: 'admitted', limit: 200 });
  const facilityQ = useApiQuery<FacilityConfig>(['facility'], '/api/settings/facility', {
    query: { staleTime: 5 * 60_000 },
  });

  const createProvision = useCreateServiceProvision();
  const deleteProvision = useDeleteServiceProvision();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const schedules = schedulesQ.data ?? [];
  const provisions = provisionsQ.data?.items ?? [];
  const residents = residentsQ.data?.items ?? [];
  const routine = (facilityQ.data?.scheduleConfig?.dailyRoutine ?? []).filter((r) => r.time && r.activity);

  const loading = schedulesQ.isLoading || provisionsQ.isLoading || residentsQ.isLoading;
  const fetchError = schedulesQ.error?.message || provisionsQ.error?.message || residentsQ.error?.message || null;

  // ── 행 구성 — 웹 ServiceTodoList와 동일 규약 ──
  const rows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    const nameOf = new Map(residents.map((r) => [r.id, r.name]));

    // 1) 실제 개인 계획 (오늘 요일, 반복주기 전개)
    const real = schedules.filter((s) => s.dayOfWeek == null || s.dayOfWeek === todayDow);
    for (const s of real) {
      const isInterval = Boolean(
        (s.intervalMin || (s.expectedCount != null && s.expectedCount >= 2)) && s.plannedStart && s.plannedEnd,
      );
      const times = isInterval
        ? expandSchedule(s.plannedStart!, s.plannedEnd!, s.intervalMin, s.expectedCount)
        : [s.plannedStart];
      for (const t of times) {
        out.push({
          key: isInterval ? `${s.id}|${t}` : s.id,
          residentId: s.residentId,
          residentName: s.residentName ?? nameOf.get(s.residentId) ?? '-',
          serviceType: s.serviceType,
          plannedStart: t,
          note: s.note ?? null,
          scheduleId: s.id,
          dayLabel: isInterval
            ? (s.expectedCount != null && s.expectedCount >= 2
                ? `${s.expectedCount}회 균등 배분`
                : `${s.intervalMin! >= 60 ? `${Math.floor(s.intervalMin! / 60)}시간` : `${s.intervalMin}분`} 주기`)
            : s.dayOfWeek == null ? '매일' : `${DAY_LABELS[s.dayOfWeek]}요일`,
        });
      }
    }

    // 2) 시설 일과표 × 입소자 — 정본은 lib/care/routine-rows (공동 작업판과 같은 구현을 쓴다).
    //    2026-08-31: 여기와 공동 작업판이 각자 병합하다가 앱만 비어 보이는 사고가 났다. 복사 금지.
    for (const v of buildRoutineSchedules({
      routine,
      residents: residents.map((r) => ({ id: r.id, name: r.name })),
      realSchedules: real,
      allSchedules: schedules,
    })) {
      out.push({
        key: v.id, // routine-rows 가 만드는 'v|<residentId>|<time>|<activity>'
        residentId: v.residentId,
        residentName: v.residentName ?? '-',
        serviceType: v.serviceType,
        plannedStart: v.plannedStart,
        note: v.note,
        scheduleId: null,
        dayLabel: '일과표',
      });
    }

    return out.sort((a, b) =>
      (a.plannedStart ?? '99:99').localeCompare(b.plannedStart ?? '99:99')
      || a.residentName.localeCompare(b.residentName, 'ko'));
  }, [schedules, routine, residents, todayDow]);

  // ── 행 ↔ 제공기록 매칭 (실계획=scheduleId(+주기행은 시각), 파생=note→시각 폴백) ──
  const provisionFor = useCallback((row: DisplayRow): ServiceProvision | undefined => {
    if (row.scheduleId) {
      const candidates = provisions.filter((p) => p.scheduleId === row.scheduleId);
      if (row.key.includes('|')) {
        return candidates.find((p) => row.plannedStart != null && kstHHMM(p.startAt) === row.plannedStart);
      }
      return candidates[0];
    }
    const virtuals = provisions.filter((p) => p.scheduleId == null && p.residentId === row.residentId);
    return virtuals.find((p) => p.note === row.note)
      ?? virtuals.find((p) => p.serviceType === row.serviceType && row.plannedStart != null && kstHHMM(p.startAt) === row.plannedStart);
  }, [provisions]);

  const doneCount = rows.filter((r) => provisionFor(r)).length;

  const toggle = useCallback(async (row: DisplayRow, onWarning: (msg: string) => void, onError: (msg: string) => void) => {
    if (pendingKeys.has(row.key)) return;
    setPendingKeys((prev) => new Set(prev).add(row.key));
    try {
      const existing = provisionFor(row);
      if (existing) {
        await deleteProvision.mutateAsync({ id: existing.id });
      } else {
        const created = await createProvision.mutateAsync({
          residentId: row.residentId,
          serviceType: row.serviceType,
          serviceDate: today,
          scheduleId: row.scheduleId ?? undefined,
          note: row.scheduleId ? undefined : row.note,
          // H8: 슬롯 판정은 계획 시각 기준
          startAt: row.plannedStart
            ? new Date(`${today}T${row.plannedStart}:00+09:00`).toISOString()
            : new Date().toISOString(),
          source: 'manual',
        });
        if (created?.warning) onWarning(created.warning);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : '네트워크 오류 — 다시 시도하세요');
    } finally {
      setPendingKeys((prev) => { const n = new Set(prev); n.delete(row.key); return n; });
    }
  }, [pendingKeys, provisionFor, createProvision, deleteProvision, today]);

  const refetchAll = useCallback(() => {
    void schedulesQ.refetch(); void provisionsQ.refetch(); void residentsQ.refetch(); void facilityQ.refetch();
  }, [schedulesQ, provisionsQ, residentsQ, facilityQ]);

  return { today, rows, residents, provisionFor, toggle, pendingKeys, doneCount, loading, fetchError, refetchAll };
}
