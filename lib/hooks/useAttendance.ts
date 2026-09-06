/**
 * 근태(GPS 출퇴근) 훅 — 2026-09-01 대표 확정 설계 / PoC2 피드백 #7
 *
 * 서버 계약(웹에 이미 배포됨 — 커밋 ca0e5ea)
 *   GET  /api/staff/attendance?self=1&date=YYYY-MM-DD  — 본인 오늘 기록(0건이면 빈 목록)
 *   POST /api/staff/attendance  { type:'checkin'|'checkout', lat?, lng?, accuracyM?, mockFlag? }
 *        · **시각 정본 = 서버 수신 시각(KST)** — 앱은 시각을 보내지 않는다(폰 시계 조작 가능).
 *        · 거리 계산·판정·중복 무시는 전부 서버. 같은 날 두 번째 checkin 은 기존 값을 그대로 돌려준다.
 *        · 좌표는 판정 직후 폐기 — DB 에는 거리·정확도·판정(checkMeta)만 남는다.
 *   GET  /api/settings/attendance-geo  — 시설 좌표 등록 상태(비관리자는 registered/반경만)
 *   PUT  /api/settings/attendance-geo  { lat, lng, accuracyM }  — 시설장 현장 1탭 등록(관리자만)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiListQuery, useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';
import { postWithQueue } from '../queue/offline-queue';

// ── 판정 ────────────────────────────────────────────────────────
/** 서버 판정(lib/geo.ts judgeGeoVerdict). 'web' = 좌표 없이 들어온 호출(웹 헤더 버튼). */
export type GeoVerdict = 'verified' | 'near' | 'flagged' | 'web';

export interface AttendanceCheckMeta {
  distanceM?: number | null;
  accuracyM?: number | null;
  verdict?: GeoVerdict;
  mockFlag?: boolean;
  geoRegistered?: boolean;
}

export interface Attendance {
  id: string;
  staffId: string;
  staffName: string | null;
  attendanceDate: string;
  /** ISO 인스턴트(서버 수신 시각). 표시할 때 toKSTTime 으로 변환한다. */
  clockIn: string | null;
  clockOut: string | null;
  status: string | null;
  overtimeMin: number | null;
  note: string | null;
  checkMeta: { checkin?: AttendanceCheckMeta; checkout?: AttendanceCheckMeta } | null;
}

/** 판정 → 사람이 읽는 한 마디. 모르는 값을 '확인됨'으로 올려 부르지 않는다. */
export function verdictLabel(verdict: GeoVerdict | undefined | null): string {
  switch (verdict) {
    case 'verified': return '확인됨';
    case 'near': return '근접';
    case 'flagged': return '위치 미확인';
    case 'web': return '위치 확인 없음';
    default: return '위치 확인 없음';
  }
}

// ── 본인 오늘 기록 ──────────────────────────────────────────────
export function useMyAttendanceToday(date: string, enabled = true) {
  const qs = new URLSearchParams({ self: '1', date, limit: '5' });
  return useApiListQuery<Attendance>(
    ['attendance', 'self', date],
    `/api/staff/attendance?${qs}`,
    { query: { enabled, staleTime: 30_000 } },
  );
}

// ── 출퇴근 전송 ─────────────────────────────────────────────────
export interface PostAttendanceVars {
  type: 'checkin' | 'checkout';
  lat?: number;
  lng?: number;
  /** 모를 때는 **키를 보내지 않는다** — 서버 판정이 오차만큼 관대해지면 거짓 판정이 된다. */
  accuracyM?: number;
  mockFlag?: boolean;
}

export function usePostAttendance() {
  const qc = useQueryClient();
  return useMutation<Attendance, ApiError | Error, PostAttendanceVars>({
    // 오프라인 큐 대상(2026-09-06 vc11 베타 차단) — occurredAt은 보내지 않는다(sendOccurredAt:false).
    // 서버 계약이 의도적으로 클라이언트 시각을 받지 않는다(폰 시계 조작 방지 — 위 파일 주석
    // "시각 정본 = 서버 수신 시각"). 큐가 지연 전송해도 서버는 여전히 수신 시각을 남긴다
    // (offline-queue.ts 상단 주석 참고 — 기존 수동 재시도와 같은 특성, 새 위험 아님).
    mutationFn: (vars) => postWithQueue<Attendance>({
      kind: 'attendance',
      label: vars.type === 'checkin' ? 'GPS 출근' : 'GPS 퇴근',
      url: '/api/staff/attendance',
      body: vars as unknown as Record<string, unknown>,
      sendOccurredAt: false,
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

// ── 시설 좌표 등록 상태 ─────────────────────────────────────────
export interface AttendanceGeoStatus {
  registered: boolean;
  radiusM: number;
  lateGraceMin: number;
  /** 관리자 응답에만 실린다 */
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  registeredByName?: string | null;
  registeredAt?: string | null;
}

export function useAttendanceGeo(enabled = true) {
  return useApiQuery<AttendanceGeoStatus>(
    ['attendance-geo'],
    '/api/settings/attendance-geo',
    { query: { enabled, staleTime: 5 * 60_000 } },
  );
}

export interface RegisterGeoVars {
  lat: number;
  lng: number;
  accuracyM: number;
}

export function useRegisterAttendanceGeo() {
  const qc = useQueryClient();
  return useMutation<AttendanceGeoStatus, ApiError, RegisterGeoVars>({
    mutationFn: (vars) => api.put<AttendanceGeoStatus>('/api/settings/attendance-geo', vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance-geo'] });
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}
