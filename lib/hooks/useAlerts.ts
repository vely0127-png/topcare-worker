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
export interface AlertSummaryOverdueItem {
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
