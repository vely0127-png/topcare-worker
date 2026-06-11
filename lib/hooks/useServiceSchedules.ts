/**
 * 서비스 시간표(ServiceSchedule) 조회 훅 — S4c.
 *
 * 비콘 enter 이벤트 발생 시 오늘 이 직원에게 예약된 서비스를
 * 시간 기준으로 매칭하는 데 사용한다.
 */
import { useApiQuery } from './useApi';

export interface ServiceSchedule {
  id: string;
  residentId: string;
  residentName: string | null;
  staffId: string | null;
  serviceType: string;
  dayOfWeek: number | null;
  plannedStart: string | null; // 'HH:MM'
  plannedEnd: string | null;   // 'HH:MM'
  expectedCount: number;
  expectedDurationMin: number | null;
  toleranceMin: number;
  severity: string;
  isActive: boolean;
  note: string | null;
}

export interface ServiceScheduleListParams {
  residentId?: string;
  serviceType?: string;
  isActive?: boolean;
}

export function useServiceSchedules(params?: ServiceScheduleListParams) {
  const qs = new URLSearchParams();
  if (params?.residentId) qs.set('residentId', params.residentId);
  if (params?.serviceType) qs.set('serviceType', params.serviceType);
  if (params?.isActive !== undefined) qs.set('isActive', String(params.isActive));

  return useApiQuery<ServiceSchedule[]>(
    ['service-schedules', params ?? {}],
    `/api/care/service-schedules?${qs}`,
    { query: { staleTime: 5 * 60_000 } }, // 5분 캐시
  );
}

// ── 시간 매칭 헬퍼 ────────────────────────────────────────────

/** 'HH:MM' 문자열 → 자정 기준 분. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** epoch ms → KST 자정 기준 분. */
export function epochToKstMin(ms: number): number {
  const kst = new Date(ms + 9 * 60 * 60_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/**
 * enter 시각(epoch ms)에 가장 잘 맞는 시간표를 반환.
 * - dayOfWeek 필터: null(매일) 또는 오늘 요일 일치
 * - plannedStart ± toleranceMin 이내
 * - 여러 개 있으면 시작 시각이 가장 가까운 것
 */
export function matchScheduleByTime(
  schedules: ServiceSchedule[],
  atMs: number,
  todayDow: number, // 0=일, 1=월, …, 6=토
  staffId: string,
): ServiceSchedule | null {
  const nowMin = epochToKstMin(atMs);

  const candidates = schedules.filter((s) => {
    if (!s.isActive) return false;
    if (s.staffId && s.staffId !== staffId) return false;
    if (s.dayOfWeek !== null && s.dayOfWeek !== todayDow) return false;
    if (!s.plannedStart) return false;
    const startMin = hhmmToMin(s.plannedStart);
    return Math.abs(nowMin - startMin) <= s.toleranceMin;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, cur) => {
    const dBest = Math.abs(nowMin - hhmmToMin(best.plannedStart!));
    const dCur  = Math.abs(nowMin - hhmmToMin(cur.plannedStart!));
    return dCur < dBest ? cur : best;
  });
}
