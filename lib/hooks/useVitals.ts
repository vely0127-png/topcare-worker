/**
 * 바이탈 훅 — 웹 `/api/vitals` (실측 vital_sign 테이블. 합성값 없음).
 *
 * GET  /api/vitals  입소자 전원 + 최신 실측 1건(없으면 measured:false, 값 전부 null)
 * POST /api/vitals  { measuredDate, entries: [...] } 일괄 저장
 */
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery, useApiMutation } from './useApi';

export interface VitalItem {
  residentId: string;
  name: string;
  room: string;
  ward: string;
  grade: number | null;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  bp: string;
  bpSys: number | null;
  bpDia: number | null;
  hr: number | null;
  temp: number | null;
  spo2: number | null;
  bloodSugar: number | null;
  /** 당뇨 대상자 — true 인 사람만 혈당을 격일로 잰다 */
  bloodSugarTarget: boolean;
  vitalRisk: 'NORMAL' | 'WARNING' | 'ALERT';
  /** false = 아직 한 번도 측정 안 됨(최근 14일). 값들은 전부 null */
  measured: boolean;
  measuredAt: string | null;
  timestamp: string | null;
  lastCheckMinutes: number | null;
}

/** API vitalRisk → 화면 riskLevel 매핑 */
export function toRiskLevel(item: VitalItem): 'normal' | 'caution' | 'warning' | 'critical' {
  if (item.vitalRisk === 'ALERT') return 'critical';
  if (item.vitalRisk === 'WARNING') return 'warning';
  if (item.risk === 'HIGH') return 'caution';
  return 'normal';
}

export function useVitals() {
  return useApiQuery<VitalItem[]>(
    ['vitals'],
    '/api/vitals',
    { query: { refetchInterval: 60_000, staleTime: 30_000 } },
  );
}

// ── 저장 ──────────────────────────────────────────────────────────

export interface VitalEntry {
  residentId: string;
  temp?: string | number | null;
  spo2?: string | number | null;
  bpSys?: string | number | null;
  bpDia?: string | number | null;
  hr?: string | number | null;
  bloodSugar?: string | number | null;
  note?: string | null;
}

export interface VitalSaveResult {
  saved: number;
  measuredDate: string;
  /** 물리적으로 불가능한 값이라 서버가 저장하지 않은 항목 */
  dropped?: { residentId: string; fields: string[] }[];
  droppedCount: number;
  /** 이상 바이탈로 알림이 발생한 건수 */
  alertsRaised?: number;
}

/**
 * 측정값 저장. 라운드 중 앱이 죽어도 앞사람 기록이 남도록 **한 분씩 즉시 저장**한다.
 * (웹 care 화면은 전원 일괄 저장이지만, 현장 앱은 중간 유실이 더 위험하다)
 */
export function useVitalsSave() {
  const qc = useQueryClient();
  return useApiMutation<VitalSaveResult, { measuredDate: string; entries: VitalEntry[] }>(
    'post',
    '/api/vitals',
    {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['vitals'] });
        void qc.invalidateQueries({ queryKey: ['alerts'] });
      },
    },
  );
}

// ── 입력값 검증 (서버 FIELD_RANGE 와 동일) ─────────────────────────
// 서버는 범위 밖 값을 조용히 null 로 떨어뜨린다. 그대로 두면
// "저장됨"이라 뜨는데 값이 없는 가짜 성공이 되므로, 저장 전에 앱에서 막는다.

export const VITAL_RANGE: Record<
  'temp' | 'spo2' | 'bpSys' | 'bpDia' | 'hr' | 'bloodSugar',
  { min: number; max: number; label: string; unit: string }
> = {
  temp: { min: 30, max: 45, label: '체온', unit: '°C' },
  spo2: { min: 50, max: 100, label: '산소포화도', unit: '%' },
  bpSys: { min: 50, max: 300, label: '수축기 혈압', unit: 'mmHg' },
  bpDia: { min: 20, max: 200, label: '이완기 혈압', unit: 'mmHg' },
  hr: { min: 20, max: 250, label: '맥박', unit: 'bpm' },
  bloodSugar: { min: 20, max: 800, label: '혈당', unit: 'mg/dL' },
};

export type VitalField = keyof typeof VITAL_RANGE;

/** 입력 문자열이 범위를 벗어나면 사람이 읽을 경고 문구, 정상이면 null */
export function vitalRangeError(field: VitalField, raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  const r = VITAL_RANGE[field];
  if (!Number.isFinite(n)) return `${r.label}: 숫자만 입력하세요`;
  if (n < r.min || n > r.max) {
    return `${r.label} ${text}${r.unit} — 확인하세요 (${r.min}~${r.max})`;
  }
  return null;
}

export interface VitalNumbers {
  temp: number | null; spo2: number | null; bpSys: number | null;
  bpDia: number | null; hr: number | null; bloodSugar: number | null;
}

/**
 * 서버 `lib/care/vital-alert.ts` 의 vitalAbnormalReasons 와 **같은 임계치**.
 * 이 범위에 들면 서버가 Alert 를 만든다 → 앱도 "알림 발생"이라 말할 수 있다.
 * ⚠ 웹 임계치를 바꾸면 여기도 같이 바꿀 것(어긋나면 앱이 거짓말을 한다).
 */
export function alertReasons(v: VitalNumbers): string[] {
  const out: string[] = [];
  if (v.spo2 != null && v.spo2 < 90) out.push(`산소포화도 ${v.spo2}%`);
  if (v.temp != null && v.temp >= 38.5) out.push(`체온 ${v.temp}°C`);
  if (v.bpSys != null && v.bpSys >= 180) out.push(`수축기 ${v.bpSys}`);
  if (v.bpDia != null && v.bpDia >= 110) out.push(`이완기 ${v.bpDia}`);
  if (v.hr != null && (v.hr > 130 || v.hr < 40)) out.push(`맥박 ${v.hr}`);
  if (v.bloodSugar != null && (v.bloodSugar >= 300 || v.bloodSugar <= 50)) out.push(`혈당 ${v.bloodSugar}`);
  return out;
}

/**
 * 알림까지는 아니지만 눈여겨볼 범위 — 웹 `/api/vitals` GET 의 computeRisk 와 동일 밴드.
 * 화면 색·문구용이며 알림을 만들지 않는다("확인 권장"이지 "진단"이 아님).
 */
export function cautionNotes(v: VitalNumbers): string[] {
  const out: string[] = [];
  if (v.temp != null && v.temp >= 37.5 && v.temp < 38.5) out.push(`체온 ${v.temp}°C`);
  if (v.spo2 != null && v.spo2 <= 95 && v.spo2 >= 90) out.push(`산소포화도 ${v.spo2}%`);
  if (v.bpSys != null && v.bpSys >= 135 && v.bpSys < 180) out.push(`수축기 ${v.bpSys}`);
  return out;
}
