/**
 * useBeaconProximity — BLE 스캐너 → 근접 엔진 → 출퇴근 기록을 잇는 React 훅.
 *
 * 화면(app/(tabs)/proximity.tsx)이 이 훅 하나로:
 *   - 스캔 시작/중지
 *   - 비콘별 현재 상태(거리/inside) 목록
 *   - enter/exit 이벤트 스트림
 *   - 정문 비콘 enter/exit 시 자동 출퇴근 결과
 * 를 받는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../auth/auth-store';
import {
  AttendanceRecorder,
  beaconRegistry,
  BleBeaconScanner,
  ProximityEngine,
  type AttendanceResult,
  type AttendanceType,
  type BeaconStatus,
  type ProximityEvent,
  type ScannerState,
} from '../beacon';

const MAX_EVENTS = 50;
const SWEEP_INTERVAL_MS = 3_000;

export interface BeaconAttendanceState {
  clockIn: string | null;
  clockOut: string | null;
  status: string | null;
  lastType: AttendanceType | null;
}

export interface UseBeaconProximityResult {
  supported: boolean;
  scannerState: ScannerState;
  scanning: boolean;
  beacons: BeaconStatus[];
  events: ProximityEvent[];
  attendance: BeaconAttendanceState | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useBeaconProximity(): UseBeaconProximityResult {
  const staffId = useAuthStore((s) => s.session?.user.staffId ?? null);

  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [beacons, setBeacons] = useState<BeaconStatus[]>([]);
  const [events, setEvents] = useState<ProximityEvent[]>([]);
  const [attendance, setAttendance] = useState<BeaconAttendanceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<ProximityEngine | null>(null);
  const scannerRef = useRef<BleBeaconScanner | null>(null);
  const recorderRef = useRef<AttendanceRecorder | null>(null);
  const sweepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 출퇴근 레코더는 staffId 에 묶인다.
  useEffect(() => {
    if (!staffId) {
      recorderRef.current = null;
      return;
    }
    if (!recorderRef.current) {
      recorderRef.current = new AttendanceRecorder(
        staffId,
        (type: AttendanceType, res: AttendanceResult) => {
          setAttendance({
            clockIn: res.clockIn,
            clockOut: res.clockOut,
            status: res.status,
            lastType: type,
          });
        },
        (type, err) => setError(`출퇴근(${type}) 실패: ${err.message}`),
      );
    } else {
      recorderRef.current.setStaffId(staffId);
    }
  }, [staffId]);

  const handleEvent = useCallback((event: ProximityEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    // 정문(primary) 비콘만 출퇴근 트리거.
    const binding = beaconRegistry.get(event.uuid);
    if (!binding?.primary) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (event.type === 'enter') void recorder.handleEnter();
    else void recorder.handleExit();
  }, []);

  // 엔진 1회 생성.
  if (!engineRef.current) {
    engineRef.current = new ProximityEngine({
      resolveRoom: (uuid) => beaconRegistry.resolveRoom(uuid),
      onEvent: handleEvent,
    });
  }

  const refreshStatuses = useCallback(() => {
    const engine = engineRef.current;
    if (engine) setBeacons(engine.statuses());
  }, []);

  const start = useCallback(() => {
    setError(null);
    const engine = engineRef.current;
    if (!engine) return;

    if (!scannerRef.current) {
      scannerRef.current = new BleBeaconScanner({
        onObservation: (obs) => {
          engine.observe(obs);
          refreshStatuses();
        },
        onStateChange: (s) => setScannerState(s),
        onError: (err) => setError(err.message),
        // [임시 디버그] 모든 BLE 기기 표시 — 비콘 UUID 확인용.
        // 운영 시 아래 registry 필터로 복귀:
        //   const known = beaconRegistry.knownUuids();
        //   return known.length > 0 ? known : null;
        filterUuids: () => null,
      });
    }
    void scannerRef.current.start();

    if (!sweepRef.current) {
      sweepRef.current = setInterval(() => {
        engine.sweep();
        refreshStatuses();
      }, SWEEP_INTERVAL_MS);
    }
  }, [refreshStatuses]);

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    if (sweepRef.current) {
      clearInterval(sweepRef.current);
      sweepRef.current = null;
    }
  }, []);

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      if (sweepRef.current) clearInterval(sweepRef.current);
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  const supported = useMemo(
    () => scannerRef.current?.isSupported() ?? new BleBeaconScanner({ onObservation: () => {} }).isSupported(),
    [],
  );

  return {
    supported,
    scannerState,
    scanning: scannerState === 'scanning',
    beacons,
    events,
    attendance,
    error,
    start,
    stop,
  };
}
