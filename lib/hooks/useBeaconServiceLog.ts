/**
 * useBeaconServiceLog — BLE 근접 + 서비스 자동기록 통합 훅 (S4c).
 *
 * useBeaconProximity(전역 스캐너) 위에:
 *   1) 오늘 서비스 시간표 조회 (GET /api/care/service-schedules)
 *   2) enter/exit → POST /api/presence/events (체류 원장 + 서버가 초안 생성·마감)
 *   3) 오늘 provision 목록 (초안/확정) 반환
 *   4) 수동 선택 필요 이벤트 큐 반환
 *
 * 2026-08-06 일원화: 앱은 초안을 직접 만들지 않는다. 사실만 보내고 서버가 쓴다.
 * 완전 자동 확정 없음 — 서버가 만드는 것도 항상 draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useBeaconProximity, type BeaconAttendanceState } from './useBeaconProximity';
import { useServiceSchedules } from './useServiceSchedules';
import { useServiceProvisions } from './useServiceProvisions';
import { ServiceRecorder, type OpenService } from '../beacon/service-recorder';
import { useAuthStore } from '../auth/auth-store';
import type { BeaconStatus, ProximityEvent } from '../beacon/types';
import type { ScannerState } from '../beacon/scanner';
import type { ServiceProvision } from './useServiceProvisions';

// ── 수동 선택 대기 항목 ────────────────────────────────────────
export interface PendingSelection {
  event: ProximityEvent;
  id: string; // 고유 키
}

export interface UseBeaconServiceLogResult {
  // BLE 상태 (proximity 그대로 전달)
  supported: boolean;
  scannerState: ScannerState;
  scanning: boolean;
  beacons: BeaconStatus[];
  events: ProximityEvent[];
  attendance: BeaconAttendanceState | null;
  bleError: string | null;
  start: () => void;
  stop: () => void;

  // 서비스 자동기록 상태
  /** 현재 열린(진행 중) 서비스 목록 (enter 후 exit 전). */
  openServices: OpenService[];
  /** 오늘 provision 목록 (draft + confirmed + rejected). */
  todayProvisions: ServiceProvision[];
  provisionsLoading: boolean;
  /** 수동 선택이 필요한 이벤트 큐. */
  pendingSelections: PendingSelection[];
  serviceError: string | null;
  /** 서버가 돌려준 처리 결과 문구(정합 수행 등). 없으면 null. */
  serverMessage: string | null;

  // 오늘 요약 통계
  todaySummary: {
    draftCount: number;
    confirmedCount: number;
    totalDurationMin: number;
  };

  // 액션
  /** 수동 선택 확정 → draft 생성. */
  resolveSelection: (selId: string, residentId: string, serviceType: string, scheduleId?: string | null) => void;
  /** 수동 선택 취소. */
  dismissSelection: (selId: string) => void;
}

// 오늘 날짜(KST) 'YYYY-MM-DD'
function todayKst(): string {
  return format(new Date(Date.now() + 9 * 3600_000), 'yyyy-MM-dd');
}

let selCounter = 0;

export function useBeaconServiceLog(): UseBeaconServiceLogResult {
  const staffId = useAuthStore((s) => s.session?.user.staffId ?? null);

  // BLE 레이어
  const {
    supported, scannerState, scanning, beacons, events, attendance,
    error: bleError, start, stop,
  } = useBeaconProximity();

  // 시간표 (isActive=true)
  const { data: schedules = [] } = useServiceSchedules({ isActive: true });

  // 오늘 provision 목록
  const todayDate = todayKst();
  const { data: provisionsData, isLoading: provisionsLoading } = useServiceProvisions({
    date: todayDate,
    limit: 100,
  });
  const todayProvisions = provisionsData?.items ?? [];

  // 서비스 기록 오류
  const [serviceError, setServiceError] = useState<string | null>(null);
  // 서버 처리 결과 안내(정합 결과 등)
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const qc = useQueryClient();

  // 수동 선택 큐
  const [pendingSelections, setPendingSelections] = useState<PendingSelection[]>([]);
  const pendingEventRef = useRef<Map<string, ProximityEvent>>(new Map()); // selId → event

  // ServiceRecorder (1회 생성).
  // 2026-08-06: 초안 생성은 서버가 단독 수행 — 여기서는 mutation 을 주입하지 않는다.
  const recorderRef = useRef<ServiceRecorder | null>(null);
  if (!recorderRef.current) {
    recorderRef.current = new ServiceRecorder({
      onNeedSelection: (event) => {
        const selId = `sel-${++selCounter}`;
        pendingEventRef.current.set(selId, event);
        setPendingSelections((prev) => [...prev, { event, id: selId }]);
      },
      onDraftCreated: () => {
        setServiceError(null);
        void qc.invalidateQueries({ queryKey: ['service-provisions'] });
      },
      onServiceEnded: () => {
        void qc.invalidateQueries({ queryKey: ['service-provisions'] });
        void qc.invalidateQueries({ queryKey: ['alerts'] });
      },
      onServerMessage: (msg) => setServerMessage(msg),
      onError: (phase, err) => {
        setServiceError(`체류 기록 오류(${phase}): ${err.message}`);
      },
    });
  }

  // 스케줄 동기화
  useEffect(() => {
    recorderRef.current?.setSchedules(schedules);
  }, [schedules]);

  // open services 상태 (recorder 내부 map 미러링)
  const [openServices, setOpenServices] = useState<OpenService[]>([]);
  const refreshOpen = useCallback(() => {
    setOpenServices(recorderRef.current?.openServices() ?? []);
  }, []);

  // [Bug3 fix] 마지막으로 처리한 이벤트 at 값을 추적 — staffId 변경 등으로 인한 재처리 방지
  const lastProcessedAtRef = useRef<number>(-1);

  // BLE 이벤트 → service recorder 연결
  useEffect(() => {
    const last = events[0];
    if (!last || !staffId) return;
    // 이미 처리한 이벤트이면 무시
    if (last.at === lastProcessedAtRef.current) return;
    lastProcessedAtRef.current = last.at;

    const recorder = recorderRef.current;
    if (!recorder) return;

    if (last.type === 'enter') {
      void recorder.handleEnter(last, staffId).then(refreshOpen);
    } else {
      void recorder.handleExit(last).then(refreshOpen);
    }
  }, [events, staffId, refreshOpen]);

  // 수동 선택 확정
  const resolveSelection = useCallback(
    (selId: string, residentId: string, serviceType: string, scheduleId?: string | null) => {
      if (!staffId) return;
      const event = pendingEventRef.current.get(selId);
      if (!event) return;
      void recorderRef.current
        ?.createManual(event, staffId, residentId, serviceType, scheduleId)
        .then(refreshOpen);
      pendingEventRef.current.delete(selId);
      setPendingSelections((prev) => prev.filter((p) => p.id !== selId));
    },
    [staffId, refreshOpen],
  );

  const dismissSelection = useCallback((selId: string) => {
    const event = pendingEventRef.current.get(selId);
    if (event) recorderRef.current?.dismissPending(event.uuid); // Bug4 fix: pending uuid 해제
    pendingEventRef.current.delete(selId);
    setPendingSelections((prev) => prev.filter((p) => p.id !== selId));
  }, []);

  // 오늘 요약
  const todaySummary = useMemo(() => {
    const drafts = todayProvisions.filter((p) => p.status === 'draft');
    const confirmed = todayProvisions.filter((p) => p.status === 'confirmed');
    const totalDurationMin = todayProvisions
      .filter((p) => p.status !== 'rejected')
      .reduce((s, p) => s + (p.durationMin ?? 0), 0);
    return { draftCount: drafts.length, confirmedCount: confirmed.length, totalDurationMin };
  }, [todayProvisions]);

  return {
    supported,
    scannerState,
    scanning,
    beacons,
    events,
    attendance,
    bleError,
    start,
    stop,
    openServices,
    todayProvisions,
    provisionsLoading,
    pendingSelections,
    serviceError,
    serverMessage,
    todaySummary,
    resolveSelection,
    dismissSelection,
  };
}
