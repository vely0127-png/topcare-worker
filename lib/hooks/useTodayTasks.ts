/**
 * useTodayTasks — 오늘 할 일 행 구성·체크 로직 (2026-08-05, index.tsx에서 추출)
 *
 * 웹 ServiceTodoList와 동일 규약:
 *  - 행 = 개인 계획(ServiceSchedule, 반복주기 전개) + 시설 일과표 × 입소자(개인화 유형은 계획 보유자만)
 *  - 체크 = POST service-provisions (startAt=계획 시각 — H8), 해제 = DELETE
 *  - 서버 경고(C5·H4)는 호출측에 onWarning으로 전달해 반드시 노출
 *
 * 사용처: (tabs)/index.tsx(전체 목록) + (tabs)/proximity.tsx(비콘 현재 위치 업무).
 */
import { useCallback, useMemo, useState } from 'react';
import { useServiceSchedules } from './useServiceSchedules';
import {
  useServiceProvisions, useCreateServiceProvision, useDeleteServiceProvision,
  type ServiceProvision,
} from './useServiceProvisions';
import { useResidents } from './useResidents';
import { useApiQuery } from './useApi';
import { PERSONAL_TYPES, inferTypeFromActivity } from '../care/service-rules';

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
      const isInterval = Boolean(s.intervalMin && s.plannedStart && s.plannedEnd);
      const times = isInterval ? expandInterval(s.plannedStart!, s.plannedEnd!, s.intervalMin!) : [s.plannedStart];
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
            ? `${s.intervalMin! >= 60 ? `${Math.floor(s.intervalMin! / 60)}시간` : `${s.intervalMin}분`} 주기`
            : s.dayOfWeek == null ? '매일' : `${DAY_LABELS[s.dayOfWeek]}요일`,
        });
      }
    }

    // 2) 시설 일과표 × 입소자 — 개인화 유형은 개인 계획 보유자에게만 (기저귀 비사용자 제외 규칙)
    const realKeys = new Set(real.map((s) => `${s.residentId}|${s.plannedStart}|${s.note ?? ''}`));
    const personalByResident = new Map<string, Set<string>>();
    for (const s of schedules) {
      if (!personalByResident.has(s.residentId)) personalByResident.set(s.residentId, new Set());
      personalByResident.get(s.residentId)!.add(s.serviceType);
    }
    for (const item of routine) {
      const itemType = inferTypeFromActivity(item.activity);
      for (const r of residents) {
        if (PERSONAL_TYPES.has(itemType) && !personalByResident.get(r.id)?.has(itemType)) continue;
        if (realKeys.has(`${r.id}|${item.time}|${item.activity}`)) continue;
        out.push({
          key: `v|${r.id}|${item.time}|${item.activity}`,
          residentId: r.id,
          residentName: r.name,
          serviceType: itemType,
          plannedStart: item.time,
          note: item.activity,
          scheduleId: null,
          dayLabel: '일과표',
        });
      }
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
