/**
 * useTrail — "내 행적": 오늘 내가 다녀온 곳을 방문 단위로 접어서 돌려준다.
 *
 * 왜 방문 단위인가 (2026-08-06 대표 지시)
 *   "누구한테 몇시몇분에 갔었는데 무얼 했는지 물어볼 것. **횟수 그대로** 물어봐야 함.
 *    1회 작성된 이후에도 계속 물어봐야 함 — 카운트된 횟수만큼."
 *   → 같은 어르신을 5번 찾아갔으면 **질문도 5건**이다. 사람 단위로 묶지 않는다.
 *     한 건을 기록했다고 나머지가 사라지면 안 된다.
 *
 * 자동 작성(묻지 않고 채우기)은 데이터가 쌓여 행동 패턴 분석이 가능해진 뒤의 일이다.
 * 그때까지는 **전부 사람이 고른다.**
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAuthStore } from '../auth/auth-store';
import { postPresenceEvent } from './usePresence';
import { getKSTToday } from '../utils/date';

/** 짧은 방문 기준 — 이보다 짧으면 목록에서 접어둔다(숨기지 않고 건수는 보여줌) */
export const SHORT_VISIT_SEC = 60;

interface PresenceRow {
  id: string;
  eventType: 'enter' | 'exit' | string;
  residentId: string | null;
  residentName: string | null;
  staffId: string | null;
  staffName: string | null;
  roomNumber: string | null;
  beaconUuid?: string | null;
  occurredAt: string | null;
  provision: { id: string; serviceType: string; status: string } | null;
}

/** 방문 1건 = 질문 1건 */
export interface Visit {
  /** enter 이벤트 id — 초안을 이 방문에 붙이는 키 */
  enterEventId: string;
  residentId: string;
  residentName: string;
  roomNumber: string | null;
  enterAt: number;
  exitAt: number | null;
  /** 초 단위 체류. exit 없으면 null(진행 중) */
  durationSec: number | null;
  /** 이미 기록된 서비스(있으면). null = 아직 안 물어본 방문 */
  provision: { id: string; serviceType: string; status: string } | null;
}

function foldVisits(rows: PresenceRow[]): Visit[] {
  // 같은 어르신 안에서 시간순으로 enter→exit 짝을 만든다.
  const byResident = new Map<string, PresenceRow[]>();
  for (const r of rows) {
    if (!r.residentId || !r.occurredAt) continue;
    const list = byResident.get(r.residentId) ?? [];
    list.push(r);
    byResident.set(r.residentId, list);
  }

  const out: Visit[] = [];
  for (const [residentId, list] of byResident) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.occurredAt!).getTime() - new Date(b.occurredAt!).getTime(),
    );
    let open: Visit | null = null;
    for (const e of sorted) {
      const t = new Date(e.occurredAt!).getTime();
      if (e.eventType === 'enter') {
        // 짝 없는 이전 enter 는 닫지 않고 그대로 둔다(시간을 지어내지 않음)
        if (open) out.push(open);
        open = {
          enterEventId: e.id,
          residentId,
          residentName: e.residentName ?? '(이름 없음)',
          roomNumber: e.roomNumber,
          enterAt: t,
          exitAt: null,
          durationSec: null,
          provision: e.provision,
        };
      } else if (e.eventType === 'exit' && open) {
        open.exitAt = t;
        open.durationSec = Math.max(0, Math.round((t - open.enterAt) / 1000));
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
  }
  // 최근 방문이 위로
  return out.sort((a, b) => b.enterAt - a.enterAt);
}

export function useTrail(date?: string) {
  const staffId = useAuthStore((s) => s.session?.user.staffId ?? null);
  const day = date ?? getKSTToday();
  const qc = useQueryClient();

  const query = useQuery<PresenceRow[], Error>({
    queryKey: ['trail', day, staffId],
    enabled: !!staffId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams({
        staffId: staffId!,
        dateFrom: `${day}T00:00:00+09:00`,
        dateTo: `${day}T23:59:59+09:00`,
        limit: '500',
      });
      const data = await apiFetch<unknown>(`/api/presence/events?${qs}`);
      return (Array.isArray(data) ? data : (data as any)?.items ?? []) as PresenceRow[];
    },
  });

  const visits = useMemo(() => foldVisits(query.data ?? []), [query.data]);

  /**
   * 1분 이상 머문 방문 — **물어볼 대상**.
   * exit 이 아직 없는(진행 중) 방문도 여기 포함한다(짧게 끝날지 알 수 없으므로).
   */
  const mainVisits = useMemo(
    () => visits.filter((v) => v.durationSec == null || v.durationSec >= SHORT_VISIT_SEC),
    [visits],
  );

  /**
   * 1분 미만 = **짧은 접촉**. 대표 지시(2026-08-06):
   *   "1분 미만은 숨기고 1분 이상은 물어보는 걸로. 대신 1분 미만도 카운트에는 포함."
   *   "접촉 카운트만 생성되고 업무 내용은 안 물어보는 걸로."
   * → 접촉 사실(횟수)로만 세고 **무얼 했는지 묻지 않는다.** 목록에서도 등록 버튼 없음.
   *   (원장 presence_event 에는 그대로 남아 있으므로 웹 체류 현황에서는 보인다)
   */
  const shortVisits = useMemo(
    () => visits.filter((v) => v.durationSec != null && v.durationSec < SHORT_VISIT_SEC),
    [visits],
  );

  /** 오늘 접촉한 총 횟수 — 짧은 접촉 포함(사실이므로 센다) */
  const contactCount = visits.length;

  /**
   * 아직 무얼 했는지 안 고른 방문 수 = 홈 배지 숫자.
   * **짧은 접촉은 제외한다** — 물어보지 않을 건을 배지에 넣으면 영원히 0이 안 된다.
   */
  const pendingCount = useMemo(
    () => mainVisits.filter((v) => !v.provision).length,
    [mainVisits],
  );

  const isToday = day === getKSTToday();

  /** 방문 1건에 서비스 지정 → 서버가 초안 생성 */
  const register = useCallback(
    async (visit: Visit, serviceType: string) => {
      await postPresenceEvent({
        eventType: 'enter',
        mode: 'provision-only',
        residentId: visit.residentId,
        enterEventId: visit.enterEventId,
        serviceType,
        occurredAt: new Date(visit.enterAt).toISOString(),
        endAt: visit.exitAt != null ? new Date(visit.exitAt).toISOString() : null,
      });
      await qc.invalidateQueries({ queryKey: ['trail'] });
      await qc.invalidateQueries({ queryKey: ['service-provisions'] });
    },
    [qc],
  );

  return {
    visits,
    mainVisits,
    shortVisits,
    contactCount,
    pendingCount,
    isToday,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    register,
  };
}
