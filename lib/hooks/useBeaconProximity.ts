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
import { apiFetch } from '../api/client';
import {
  AttendanceRecorder,
  beaconRegistry,
  BleBeaconScanner,
  ProximityEngine,
  type AttendanceResult,
  type AttendanceType,
  type BeaconBinding,
  type BeaconStatus,
  type ProximityEvent,
  type ScannerState,
} from '../beacon';

const MAX_EVENTS = 50;
const SWEEP_INTERVAL_MS = 3_000;
/** 이 시간 안에 관측된 비콘만 '현재 위치' 후보 (ms) */
const STRONGEST_FRESH_MS = 15_000;

/** 서버 비콘 등록부(/api/beacons) 응답 행 */
interface ServerBeacon {
  id: string;
  beaconId: string;
  label: string | null;
  isActive: boolean;
  room: { id: string; number: string } | null;
  residents: { id: string; name: string }[];
}

/**
 * 서버 등록부 → 레지스트리 동기화 (2026-08-05 — 하드코딩 시드 대체).
 * 실패(오프라인) 시 기존 매핑 유지 — 스캔 자체는 계속 가능하게.
 * beacon-register 화면이 등록 직후에도 호출한다(재시작 없이 즉시 반영).
 */
export async function syncRegistryFromServer(): Promise<void> {
  try {
    const list = await apiFetch<ServerBeacon[]>('/api/beacons');
    const bindings = (list ?? [])
      .filter((b) => b.isActive)
      .map((b) => ({
        uuid: b.beaconId,
        roomId: b.room?.id ?? null,
        roomLabel: b.room ? `${b.room.number}호` : (b.label ?? '공용부'),
        primary: (b.label ?? '').includes('정문'),
        residents: b.residents ?? [],
      }));
    if (bindings.length > 0) beaconRegistry.setBindings(bindings);
  } catch {
    // 등록부 조회 실패 — 기존(시드/이전 동기화) 매핑 유지
  }
}

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
  /** 최근(15초) 관측 중 신호가 가장 센 비콘 = 현재 위치 후보 (2026-08-05) */
  strongest: BeaconStatus | null;
  /** strongest의 등록부 정보 — 호실 라벨·해당 위치 입소자 */
  currentBinding: BeaconBinding | null;
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

    // 서버 등록부 동기화 후 스캔 (실패해도 스캔은 진행 — 기존 매핑 유지)
    void syncRegistryFromServer();

    if (!scannerRef.current) {
      scannerRef.current = new BleBeaconScanner({
        // 관측은 엔진에만 반영 — 화면 갱신은 sweep(3초)에서 일괄 (2026-08-05 렉 수정:
        // allowDuplicates 스캔은 초당 수십 콜백 → 매번 setState하면 JS 스레드 포화로 앱 전체 프리즈)
        onObservation: (obs) => {
          engine.observe(obs);
        },
        onStateChange: (s) => setScannerState(s),
        onError: (err) => setError(err.message),
        // 전체 스캔 유지 (2026-08-05 회귀 수정): QR 등록값과 BLE 전파 식별자(UUID/MAC)가
        // 다를 수 있어 등록부로 필터하면 등록 비콘조차 걸러진다. 필터는 표시단에서 —
        // 등록 비콘 우선 정렬 + 현재 위치 판정은 등록 비콘만. 미등록 기기는 현장 등록용으로 노출.
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

  // ── 현재 위치 판정 (2026-08-05): 최근 관측 + 신호 최강 — 등록된 비콘만 후보
  // (주변 스마트폰·이어폰 등 미등록 기기가 '현재 위치'를 차지하면 안 됨)
  const strongest = useMemo<BeaconStatus | null>(() => {
    const now = Date.now();
    const fresh = beacons.filter(
      (b) => b.lastSeenAt != null && now - b.lastSeenAt <= STRONGEST_FRESH_MS
        && b.smoothedRssi != null && beaconRegistry.has(b.uuid),
    );
    if (fresh.length === 0) return null;
    return fresh.reduce((best, b) => ((b.smoothedRssi ?? -999) > (best.smoothedRssi ?? -999) ? b : best));
  }, [beacons]);

  const currentBinding = useMemo<BeaconBinding | null>(
    () => (strongest ? beaconRegistry.get(strongest.uuid) ?? null : null),
    [strongest],
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
    strongest,
    currentBinding,
  };
}
