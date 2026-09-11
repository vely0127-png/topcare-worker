/**
 * 급여명세서 훅 — "자동화 동등성" 빌드(2026-09-11 대표 결정 "전자로 진행")
 *
 * 서버 계약(팀W2가 topcare-web에서 같은 시점에 구현 중 — 이 앱 커밋 시점에는
 * 아직 라우트 파일이 없다. 감사: app/api/staff/payroll/ 아래 route.ts/calculate/confirm/payslip
 * 만 존재, mine·payslip/view는 없음). 아래 타입은 지시받은 계약을 그대로 옮긴 것이고,
 * payslip 타입은 실제 배포된 GET /api/staff/payroll/payslip 응답(웹 app/api/staff/payroll/payslip/route.ts,
 * 2026-09-11 커밋 기준)에 맞춰 선택적(optional) 필드로 방어적으로 잡았다 — 계약이 굳어지기 전에
 * 화면이 깨지지 않게.
 *
 *   GET  /api/staff/payroll/mine?year=YYYY
 *        → { ok, data: { items: [{ payPeriod, status:'confirmed', netPay, grossPay,
 *            confirmedAt, viewedAt|null }] } }  — 확정본만 내려온다(초안은 안 보임).
 *   GET  /api/staff/payroll/payslip?staffId=<본인>&payPeriod=YYYY-MM
 *        → 상세(지급/공제 항목, 기관부담금, 근무기록). 본인 또는 관리자만 열람.
 *   POST /api/staff/payroll/payslip/view { payPeriod }
 *        → 열람 기록(감사 로그용, 팀W2). 실패해도 화면은 이미 보여준 내용을 지우지 않는다
 *          (열람 기록은 부가 효과일 뿐 열람 자체를 막는 게이트가 아니다).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiListQuery, useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';

// ── 월 목록 ─────────────────────────────────────────────────────
export interface PayrollListItem {
  payPeriod: string; // 'YYYY-MM'
  status: 'confirmed';
  netPay: number;
  grossPay: number;
  confirmedAt: string | null;
  viewedAt: string | null;
}

export function useMyPayrollList(year: string, enabled = true) {
  return useApiListQuery<PayrollListItem>(
    ['payroll', 'mine', year],
    `/api/staff/payroll/mine?year=${encodeURIComponent(year)}`,
    { query: { enabled, staleTime: 60_000 } },
  );
}

// ── 명세서 상세 ──────────────────────────────────────────────────
export interface PayslipLineItem {
  name: string;
  amount: number;
}

export interface PayslipPayItems {
  baseSalary: number;
  /** 수당 합계 — 없는 배포에서는 allowanceItems 합으로 화면이 직접 더한다 */
  allowanceTotal?: number;
  allowanceItems: PayslipLineItem[];
  overtimePay: number;
  grossPay: number;
}

export interface PayslipDeductionItems {
  /** 항목별(4대보험 분리) — itemized=true 인 배포에서만 온다 */
  pension?: number | null;
  health?: number | null;
  ltc?: number | null;
  employment?: number | null;
  incomeTax?: number | null;
  localTax?: number | null;
  /** 구 배포 호환 — 4대보험/세금을 합계로만 줄 때 */
  insurance?: number;
  taxDeduction?: number;
  otherDeduction: number;
  otherDeductionItems?: PayslipLineItem[];
  totalDeduction: number;
}

export interface PayslipEmployerContribution {
  pension: number;
  health: number;
  ltc: number;
  employment: number;
  accident?: number;
  severanceReserve?: number;
  total: number;
}

export interface PayslipWorkRecord {
  workHours: number | null;
  workDays: number | null;
  overtimeHours: number | null;
  nightHours: number | null;
  holidayHours: number | null;
}

export interface PayslipData {
  facilityName: string;
  staffName: string;
  role: string | null;
  payPeriod: string;
  payDay: number | string | null;
  status: string;
  itemized: boolean;
  /** true면 세무 프로필 미등록으로 정률 근사 계산 — 화면에 안내 문구를 붙인다 */
  approxTax: boolean;
  /** "계산 근거 보기" — 있는 배포에서만 표시. 없으면 섹션 자체를 렌더링하지 않는다. */
  basis?: string | null;
  payItems: PayslipPayItems;
  deductionItems: PayslipDeductionItems;
  employerContribution: PayslipEmployerContribution | null;
  workRecord: PayslipWorkRecord | null;
  netPay: number;
}

export function usePayslip(staffId: string | null, payPeriod: string | null) {
  return useApiQuery<PayslipData>(
    ['payroll', 'payslip', staffId, payPeriod],
    `/api/staff/payroll/payslip?staffId=${encodeURIComponent(staffId ?? '')}&payPeriod=${encodeURIComponent(payPeriod ?? '')}`,
    { query: { enabled: !!staffId && !!payPeriod, staleTime: 5 * 60_000 } },
  );
}

/** "1,234,000원" — 급여 화면 공용 표기(금액이 없으면 '-'로, 0 은 0원으로 그대로 보여준다) */
export function formatWon(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '-';
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

/** 'YYYY-MM' → "2026년 8월" */
export function formatPayPeriod(payPeriod: string): string {
  const m = payPeriod.match(/^(\d{4})-(\d{2})$/);
  if (!m) return payPeriod;
  return `${m[1]}년 ${Number(m[2])}월`;
}

// ── 열람 기록 (부가 효과 — 실패해도 화면 표시를 막지 않는다) ─────────
export function useMarkPayslipViewed() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError | Error, { payPeriod: string }>({
    mutationFn: (vars) => api.post('/api/staff/payroll/payslip/view', vars),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'mine'] });
      void qc.invalidateQueries({ queryKey: ['payroll', 'payslip'], exact: false });
      void vars;
    },
  });
}
