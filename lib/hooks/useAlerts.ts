/**
 * 알림 훅 — GET /api/safety/alerts 실데이터 + Supabase Realtime 구독.
 *
 * - React Query 30s polling 으로 기본 갱신
 * - Supabase URL 이 있으면 postgres_changes 로 즉시 반영
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { api } from '../api/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

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
  // 쿼리 파라미터
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.severity) params.set('severity', options.severity.toLowerCase());
  if (options?.limit) params.set('limit', String(options.limit));
  params.set('limit', String(options?.limit ?? 50));
  const qs = `?${params.toString()}`;

  const query = useQuery<PaginatedAlerts, Error>({
    queryKey: ['alerts', options],
    queryFn: () => api.get<PaginatedAlerts>(`/api/safety/alerts${qs}`),
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

// ── 해결 mutation ──────────────────────────────────────────────
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; note?: string }>({
    mutationFn: ({ id, note }) =>
      api.patch(`/api/safety/alerts/${id}`, { action: 'resolve', resolutionNote: note }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
