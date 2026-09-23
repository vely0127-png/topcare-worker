/**
 * 알림 훅 — GET /api/safety/alerts 실데이터 + Supabase Realtime 구독.
 *
 * - React Query 30s polling 으로 기본 갱신
 * - Supabase URL 이 있으면 postgres_changes 로 즉시 반영
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { api, asItems } from '../api/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { useAuthStore } from '../auth/auth-store';

// ── 타입 ──────────────────────────────────────────────────────
export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertStatus = 'new' | 'acknowledged' | 'resolved';

export interface AlertItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  residentId?: string;
  residentName: string;
  roomName: string;
  createdAt: string;
}

interface PaginatedAlerts {
  items: AlertItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ── 정규화 ────────────────────────────────────────────────────
function normalizeSeverity(s: string): AlertSeverity {
  const lower = s?.toLowerCase() ?? '';
  if (lower === 'critical') return 'Critical';
  if (lower === 'high') return 'High';
  if (lower === 'low') return 'Low';
  return 'Medium';
}

function normalizeStatus(s: string): AlertStatus {
  const lower = s?.toLowerCase() ?? '';
  if (lower === 'acknowledged') return 'acknowledged';
  if (lower === 'resolved') return 'resolved';
  return 'new';
}

// ── 훅 ────────────────────────────────────────────────────────
export function useAlerts(options?: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  limit?: number;
}) {
  const qc = useQueryClient();
  // H-1(2026-09-23): 사용자 전환 시 캐시가 섞이지 않게 queryKey에 userId 포함.
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  // 쿼리 파라미터
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.severity) params.set('severity', options.severity.toLowerCase());
  if (options?.limit) params.set('limit', String(options.limit));
  params.set('limit', String(options?.limit ?? 50));
  const qs = `?${params.toString()}`;

  const query = useQuery<PaginatedAlerts, Error>({
    queryKey: ['alerts', userId, options],
    // P0-1(2026-07-27): 웹 paginated()는 data 자체가 배열 — {items}로 정규화 (이전엔 항상 빈 목록)
    queryFn: async () => {
      const data = await api.get<unknown>(`/api/safety/alerts${qs}`);
      const items = asItems<AlertItem>(data);
      return { items, total: items.length, page: 1, totalPages: 1 };
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 2,
  });

  // Supabase Realtime — DB 변경 즉시 반영 (폴링 보완)
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sb.channel('worker-alerts')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'Alert' },
        () => { void qc.invalidateQueries({ queryKey: ['alerts'] }); },
      )
      .subscribe();
    return () => { void sb.removeAllChannels(); };
  }, [qc]);

  const alerts: AlertItem[] = (query.data?.items ?? []).map((a) => ({
    ...a,
    severity: normalizeSeverity(String(a.severity)),
    status: normalizeStatus(String(a.status)),
  }));

  return {
    ...query,
    alerts,
    total: query.data?.total ?? 0,
  };
}

// ── 확인 mutation ──────────────────────────────────────────────
export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id: string) =>
      api.patch(`/api/safety/alerts/${id}`, { action: 'acknowledge' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

// ── H-7(2026-09-23) 경보 요약 — API-2 GET /api/alerts/summary ──────
// 계약: TopCare_워커앱_핫픽스_2.4.3_설계_20260923.md "2.4.4 착수 계약" API-2.
// 화면(alerts.tsx)은 카운트·배지를 이 응답만 읽는다(화면에서 따로 세지 않는다 — 반복 결함
// 차단 규약). groupBy='week'는 today/overdueUnhandled와 함께 주 단위 그룹을 준다(펼치기 전
// 요약), groupBy='resident'(+from/to)는 특정 주 범위를 펼쳤을 때 입소자별 카운트를 준다.
export interface AlertSummaryGroup {
  key: string; // groupBy='week'면 주 시작일(YYYY-MM-DD), 'resident'면 residentId
  label: string;
  total: number;
  unhandled: number;
  urgent: number;
}
/**
 * P1 크래시 수정(2026-09-23 PD 에뮬레이터 실측) — 이 타입은 애초에 실제 API-2 계약과
 * 달랐다. 웹 정본(`code/topcare-web/lib/alerts/summary.ts AlertOverdueItem`, 팀 AA
 * 커밋 c73289c)의 실제 필드는 `level`(원시 severity 문자열, 소문자)뿐이고 `severity`·
 * `status`·`type`·`description`·`roomName`은 아예 없다 — AlertCard가 `item.severity`로
 * 곧장 스타일 맵을 조회해 undefined.bg를 읽어 크래시했다. 화면(alerts.tsx)은 이 타입 그대로
 * 쓰지 않고 `normalizeOverdueItem()`으로 AlertItem 모양으로 변환한 뒤에만 카드에 넘긴다.
 */
export interface AlertSummaryOverdueItem {
  id: string;
  residentId: string | null;
  residentName: string | null;
  level: string; // 원시 severity 문자열(예: 'critical'|'high'|'medium'|'low', 대소문자 보장 없음)
  createdAt: string;
  title: string | null;
}

/** overdueUnhandled.items(API-2 원시 계약) → AlertCard가 쓰는 AlertItem 모양으로 정규화.
 *  overdueUnhandled는 서버가 이미 "미처리"만 골라 준 것이라 status는 항상 'new'로 둔다.
 *  알 수 없는/누락된 level·title도 절대 크래시하지 않고 기본값으로 떨어진다. */
export function normalizeOverdueItem(o: AlertSummaryOverdueItem): AlertItem {
  return {
    id: o.id,
    type: '', // 서버가 안 준다 — TYPE_LABELS 매핑 없이 title을 그대로 쓴다
    title: o.title ?? '경보',
    severity: normalizeSeverity(o.level ?? ''),
    status: 'new',
    residentId: o.residentId ?? undefined,
    residentName: o.residentName ?? '(수급자 미상)',
    roomName: '',
    createdAt: o.createdAt,
  };
}

export interface AlertSummary {
  today: { total: number; unhandled: number; urgent: number };
  overdueUnhandled: { count: number; items: AlertSummaryOverdueItem[] };
  groups: AlertSummaryGroup[];
}

export function useAlertSummary(params: { from?: string; to?: string; groupBy: 'day' | 'week' | 'resident'; enabled?: boolean }) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const qs = new URLSearchParams({ groupBy: params.groupBy });
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return useQuery<AlertSummary, Error>({
    queryKey: ['alert-summary', userId, params.groupBy, params.from ?? null, params.to ?? null],
    queryFn: () => api.get<AlertSummary>(`/api/alerts/summary?${qs}`),
    staleTime: 20_000,
    retry: 2,
    enabled: params.enabled ?? true,
  });
}

// ── 해결 mutation ──────────────────────────────────────────────
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; note?: string }>({
    mutationFn: ({ id, note }) =>
      api.patch(`/api/safety/alerts/${id}`, { action: 'resolve', resolutionNote: note }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
