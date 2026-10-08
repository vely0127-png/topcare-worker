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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiListQuery } from './useApi';
import { api, ApiError } from '../api/client';
import { postWithQueue } from '../queue/offline-queue';
import { useAuthStore } from '../auth/auth-store';
import type { NextDawnRule } from '../care/calendar-date';

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
  /**
   * 소급 기록 여부(B-9) — 서버가 day-keys 응답에 실어 준다(작성 시각 KST 날짜 ≠ 제공일).
   * 앱은 이 값으로 '소급' 칩만 그린다 — KST 판정을 복제하지 않는다. 다른 경로(목록·POST 응답)에서는 없음(false로 취급).
   */
  backfilled?: boolean;
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

// ── 하루 기록 경량 키(day-keys) — 작업판 매칭의 유일한 입력 (기본서비스 설계 B-7-b, 26차-a R8) ──
// 왜: 목록 API(상한 100/2000)로 그날 기록을 받으면 하루 기록이 상한을 넘는 날 앞 시간대가 전부 '미완료'로 보였다
// (2026-10-07 박달재 571건). day-keys는 그날 전건을 상한 없이 매칭에 필요한 열만 준다 — 웹 /todos·오늘 띠와 같은 입력.
// 응답: { date, items: [{ id, scheduleId, residentId, serviceType, note, startAt, serviceDate, status, createdAt, staffId, backfilled }], total, staffNames, nextDawn }
// withNextDawn=1(QA37 N01, 26차-a-h R3): 그날 전건 + 다음 날 00:00~04:59 기록을 함께 받고, 응답 nextDawn { date, boundary }로 '익일 새벽' 행의 실제 달력 날짜 규칙을 받는다
// (앱은 날짜 산술·경계값 하드코딩 없이 lib/care/calendar-date.ts로 문자열 비교만 한다).
interface DayKeyItem {
  id: string;
  scheduleId: string | null;
  residentId: string;
  serviceType: string;
  note: string | null;
  startAt: string | null;
  /** 제공일 'YYYY-MM-DD' — 행 매칭이 행의 실제 달력 날짜와 대조한다(구 서버 응답에는 없음) */
  serviceDate?: string | null;
  status: string;
  createdAt: string | null;
  staffId: string | null;
  backfilled: boolean;
}
interface DayKeysResponse { date: string; items: DayKeyItem[]; total: number; staffNames?: Record<string, string>; nextDawn?: NextDawnRule }

/** day-keys 한 행 → 작업판이 쓰는 ServiceProvision 모양(키에 없는 필드는 중립값 — 화면이 읽지 않는 열) */
function dayKeyToProvision(k: DayKeyItem, staffNames: Record<string, string>): ServiceProvision {
  return {
    id: k.id,
    residentId: k.residentId,
    residentName: null,
    staffId: k.staffId,
    staffName: k.staffId ? staffNames[k.staffId] ?? null : null,
    scheduleId: k.scheduleId,
    serviceType: k.serviceType,
    serviceDate: k.serviceDate ?? '',
    startAt: k.startAt,
    endAt: null,
    durationMin: null,
    count: 1,
    source: 'manual',
    status: k.status as ProvisionStatus,
    confirmedBy: null,
    confirmedAt: null,
    reviewNote: null,
    note: k.note,
    createdAt: k.createdAt,
    backfilled: k.backfilled,
  };
}

export function useDayProvisions(date: string) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery<{ items: ServiceProvision[]; total: number; nextDawn: NextDawnRule | null }, ApiError>({
    // 키 앞머리 'service-provisions' — 생성·삭제 mutation의 invalidateQueries가 그대로 이 쿼리도 갱신한다
    queryKey: ['service-provisions', 'day-keys', userId, date],
    queryFn: async () => {
      const data = await api.get<DayKeysResponse>(`/api/care/service-provisions/day-keys?date=${date}&withNextDawn=1`);
      const names = data.staffNames ?? {};
      const items = (Array.isArray(data.items) ? data.items : []).map((k) => dayKeyToProvision(k, names));
      return { items, total: typeof data.total === 'number' ? data.total : items.length, nextDawn: data.nextDawn ?? null };
    },
    refetchInterval: 20_000, // 공동 판 동기화(다른 직원 체크 반영)
  });
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
  /**
   * 지난 날짜 소급 사유(B-9) — D-2 이상은 필수(없으면 서버 422 BACKFILL_REASON_REQUIRED).
   * 서버가 note 앞에 `[소급: 사유]`로 저장하고 감사로그 reason에 남긴다. 오늘·어제(D-1) 기록에는 보내지 않는다.
   */
  reason?: string;
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
  /** 항목별 소급 사유(보통 비워 두고 요청 단위 reason을 쓴다) */
  reason?: string;
}
export interface BulkCreateResult {
  created: { index: number; id: string; scheduleId?: string }[];
  duplicates: { index: number; existingId: string }[];
  failed: { index: number; code: string; message: string }[];
}

export function useBulkCreateServiceProvisions() {
  const qc = useQueryClient();
  // reason: 일괄 완료는 사유 1회로 전부에 적용(B-9) — 서버가 항목별 reason이 없을 때 이 값을 쓴다
  return useMutation<BulkCreateResult, ApiError | Error, { items: BulkCreateItem[]; reason?: string }>({
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
