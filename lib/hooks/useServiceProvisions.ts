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
import { useApiListQuery } from './useApi';
import { api, ApiError } from '../api/client';
import { postWithQueue } from '../queue/offline-queue';
import { useAuthStore } from '../auth/auth-store';

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
  /** POST 응답에만 실림 — 개인계획 없음(C5)·활성처방 없음(H4) 등 서버 경고. 반드시 사용자에게 노출. */
  warning?: string;
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
  // H-1(2026-09-23): 사용자 전환 시 캐시가 섞이지 않게 queryKey에 userId 포함.
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 50) });
  if (params?.residentId) qs.set('residentId', params.residentId);
  if (params?.staffId) qs.set('staffId', params.staffId);
  if (params?.status) qs.set('status', params.status);
  if (params?.source) qs.set('source', params.source);
  if (params?.serviceType) qs.set('serviceType', params.serviceType);
  if (params?.date) qs.set('date', params.date);
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo) qs.set('dateTo', params.dateTo);

  return useApiListQuery<ServiceProvision>(
    ['service-provisions', userId, params ?? {}],
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
  /**
   * 관찰 세부(배설·목욕) — 서버가 자동 생성하는 CareRecord 에 담긴다.
   * 별도 기록을 하나 더 만들지 않으므로 같은 사실이 두 줄로 남지 않는다.
   * 허용 키: type·amount·condition·skin·note·bathType·assistance (서버 화이트리스트)
   */
  detail?: Record<string, string>;
  /**
   * 서비스 상세 시트(#23, 2026-09-11) 선택값 — 그룹키 → 선택 라벨 배열.
   * 서버가 detail 을 조립하는 데 쓴다(레거시 detail 키와 함께 보낼 수 있다).
   */
  selection?: Record<string, string[]>;
}

// ── H-8 일괄 완료(2026-09-23) — API-1 bulk 1회 ────────────────
// 계약: TopCare_워커앱_핫픽스_2.4.3_설계_20260923.md "2.4.4 착수 계약" API-1.
// 단건 POST와 같은 검증·중복 차단 함수를 웹이 재사용(두 번째 경로 규칙) — 앱은 그 응답을
// 그대로 행 상태에 매핑한다(created=성공/duplicates=이미 있음/failed=실패, 화면에서 재판정 금지).
export interface BulkCreateItem {
  residentId: string;
  serviceType: string;
  serviceDate: string; // YYYY-MM-DD
  startAt: string; // ISO
  scheduleId?: string;
  staffId: string;
  source: 'manual';
  note?: string;
}
export interface BulkCreateResult {
  created: { index: number; id: string; scheduleId?: string }[];
  duplicates: { index: number; existingId: string }[];
  failed: { index: number; code: string; message: string }[];
}

export function useBulkCreateServiceProvisions() {
  const qc = useQueryClient();
  return useMutation<BulkCreateResult, ApiError | Error, { items: BulkCreateItem[] }>({
    // 오프라인 큐 대상 아님(bulk는 QueueKind에 없다) — 실패는 호출부가 기존 단건 큐 경로로
    // 항목별 폴백한다(설계 H-8⑤ "오프라인이면 기존 큐 경로로 항목별 폴백").
    mutationFn: (vars) => api.post<BulkCreateResult>('/api/care/service-provisions/bulk', vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service-provisions'] }),
  });
}

export function useCreateServiceProvision() {
  const qc = useQueryClient();
  return useMutation<ServiceProvision, ApiError | Error, CreateServiceProvisionVars>({
    // 오프라인 큐 대상(2026-09-06 vc11 베타 차단, 작업판 체크) — 직접 전송이 네트워크·5xx로
    // 실패하면 큐에 넣고 QueuedOfflineError를 던진다(workboard.tsx의 record()에서 구분 처리).
    mutationFn: (vars) => postWithQueue<ServiceProvision>({
      kind: 'service-provision',
      label: `작업판 기록(${vars.serviceType})`,
      url: '/api/care/service-provisions',
      body: vars as unknown as Record<string, unknown>,
    }),
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

// ── DELETE (체크 해제 — 웹이 연동 기록도 함께 정리) ───────────
export function useDeleteServiceProvision() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, { id: string }>({
    mutationFn: ({ id }) => api.delete<{ id: string }>(`/api/care/service-provisions/${id}`),
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
