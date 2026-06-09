/**
 * 바이탈 훅 — GET /api/vitals (deterministic mock, IoT 연결 전).
 * 60초마다 자동 갱신.
 */
import { useApiQuery } from './useApi';

export interface VitalItem {
  residentId: string;
  name: string;
  room: string;
  ward: string;
  grade: number | null;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  bp: string;
  bpSys: number;
  bpDia: number;
  hr: number;
  temp: number;
  spo2: number;
  vitalRisk: 'NORMAL' | 'WARNING' | 'ALERT';
  timestamp: string;
  lastCheckMinutes: number;
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
