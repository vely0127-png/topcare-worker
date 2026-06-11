/**
 * 서비스 제공 기록(ServiceProvision) CRUD 훅 — S4c.
 *
 * 엔드포인트:
 *   GET  /api/care/service-provisions  — 목록(draft/confirmed/rejected)
 *   POST /api/care/service-provisions  — 초안 생성(beacon 또는 수기)
 *   PATCH /api/care/service-provisions/[id] — 확정·반려·시각 수정
 *
 * ★ 자동 확정 없음. confirm/reject 은 반드시 사람이 수행.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';
import type { Paginated } from './useResidents';

// ── 타입 ──────────────────────────────────────────────────────
export type ProvisionStatus = 'draft' | 'confirmed' | 'rejected';
export type ProvisionSource = 'beacon' | 'manual';

export interface ServiceProvision {
  id: string;
  residentId: string;
  residentName: string | null;
  staffId: string | null;
  staffName: string | null;
  scheduleId: string | null;
  serviceType: string;
  serviceDate: string;
  startAt: string | null;
  endAt: string | null;
  durationMin: number | null;
  count: number;
  source: ProvisionSource;
  status: ProvisionStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  reviewNote: string | null;
  note: string | null;
  createdAt: string | null;
}

export interface ServiceProvisionListParams {
  residentId?: string;
  staffId?: string;
  status?: ProvisionStatus;
  source?: ProvisionSource;
  serviceType?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

// ── GET 목록 훅 ───────────────────────────────────────────────
export function useServiceProvisions(params?: ServiceProvisionListParams) {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 50) });
  if (params?.residentId) qs.set('residentId', params.residentId);
  if (params?.staffId) qs.set('staffId', params.staffId);
  if (params?.status) qs.set('status', params.status);
  if (params?.source) qs.set('source', params.source);
  if (params?.serviceType) qs.set('serviceType', params.serviceType);
  if (params?.date) qs.set('date', params.date);
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo) qs.set('dateTo', params.dateTo);

  return useApiQuery<Paginated<ServiceProvision>>(
    ['service-provisions', params ?? {}],
    `/api/care/service-provisions?${qs}`,
    { query: { refetchInterval: 20_000 } },
  );
}

// ── 생성 mutation ──────────────────────────────────────────────
export interface CreateServiceProvisionVars {
  residentId: string;
  serviceType: string;
  serviceDate: string;
  startAt?: string;
  endAt?: string;
  durationMin?: number;
  count?: number;
  staffId?: string | null;
  scheduleId?: string | null;
  source?: ProvisionSource;
  note?: string | null;
}

export function useCreateServiceProvision() {
  const qc = useQueryClient();
  return useMutation<ServiceProvision, ApiError, CreateServiceProvisionVars>({
    mutationFn: (vars) => api.post<ServiceProvision>('/api/care/service-provisions', vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service-provisions'] }),
  });
}

// ── PATCH (확정·반려·시각수정) mutation ───────────────────────
export interface ConfirmProvisionVars {
  id: string;
  action: 'confirm' | 'reject';
  reviewNote?: string;
  /** 사람이 시각 정정 시 */
  startAt?: string;
  endAt?: string;
}

export interface PatchProvisionVars {
  id: string;
  startAt?: string | null;
  endAt?: string | null;
  durationMin?: number;
  count?: number;
  serviceType?: string;
  staffId?: string | null;
  note?: string | null;
}

export function useConfirmServiceProvision() {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: string; durationMin: number | null }, ApiError, ConfirmProvisionVars>({
    mutationFn: ({ id, ...body }) =>
      api.patch<{ id: string; status: string; durationMin: number | null }>(
        `/api/care/service-provisions/${id}`,
        body,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service-provisions'] }),
  });
}

export function usePatchServiceProvision() {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: string; durationMin: number | null }, ApiError, PatchProvisionVars>({
    mutationFn: ({ id, ...body }) =>
      api.patch<{ id: string; status: string; durationMin: number | null }>(
        `/api/care/service-provisions/${id}`,
        body,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service-provisions'] }),
  });
}
