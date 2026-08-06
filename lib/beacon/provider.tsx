/**
 * BeaconProvider — 앱 전체가 공유하는 **단일** BLE 스캐너·근접 엔진.
 *
 * 왜 전역인가 (2026-08-06)
 *   이전에는 `useBeaconProximity()` 를 호출할 때마다 ProximityEngine 과 BleBeaconScanner 를
 *   **새로 만들었다.** 근접 탭·자동기록 탭·비콘 등록 세 곳에서 각각 호출하므로 화면을 옮겨
 *   다니면 스캐너가 여러 개 돌고 enter/exit 상태머신도 따로 굴러갔다 — 중복 이벤트,
 *   배터리 낭비, 화면마다 다른 '현재 위치'. 인스턴스를 하나로 모아 해결한다.
 *
 * 왜 자동 시작인가
 *   대표 지시(2026-08-06): "스캔은 앱 사용시 기본 설정". 현장에서 요양보호사가 매번
 *   근접 탭에 들어가 [시작]을 누를 거라 기대할 수 없다. 로그인 상태면 그냥 돌아간다.
 *
 * 배터리
 *   스캔은 **앱이 화면에 떠 있을 때만**(AppState 'active') 돈다. 백그라운드로 가면 멈춘다.
 *   LowLatency 상시 스캔은 반나절도 못 버틴다. 백그라운드 스캔이 필요해지면 그건
 *   포그라운드 서비스(네이티브) 설계 결정 사항이지 이 파일에서 켤 일이 아니다.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

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
} from './index';

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
        // 라벨을 표시에 포함 — 같은 호실에 비콘이 여러 개일 때(1번·2번) 구분 (2026-08-05)
        roomLabel: b.room
          ? `${b.room.number}호${b.label ? ` · ${b.label}` : ''}`
          : (b.label ?? '공용부'),
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
  /** 엔진의 실시간 상태 스냅샷 — 3초 주기 state와 달리 즉시값 (근접 등록 재탐색용) */
  getStatuses: () => BeaconStatus[];
  /** 최근(15초) 관측 중 신호가 가장 센 비콘 = 현재 위치 후보 (2026-08-05) */
  strongest: BeaconStatus | null;
  /** strongest의 등록부 정보 — 호실 라벨·해당 위치 입소자 */
  currentBinding: BeaconBinding | null;
  /** 사용자가 직접 멈춘 상태인지 — 자동 재시작을 하지 않는다 */
  manuallyPaused: boolean;
}

const BeaconContext = createContext<UseBeaconProximityResult | null>(null);

/** 비콘 컨텍스트 소비. Provider 밖에서 부르면 즉시 실패시킨다(조용한 무동작 금지). */
export function useBeaconContext(): UseBeaconProximityResult {
  const ctx = useContext(BeaconContext);
  if (!ctx) {
    throw new Error('useBeaconProximity: <BeaconProvider> 안에서만 사용할 수 있습니다');
  }
  return ctx;
}

export function BeaconProvider({ children }: { children: React.ReactNode }) {
  const authStatus = useAuthStore((s) => s.status);
  const staffId = useAuthStore((s) => s.session?.user.staffId ?? null);

  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [beacons, setBeacons] = useState<BeaconStatus[]>([]);
  const [events, setEvents] = useState<ProximityEvent[]>([]);
  const [attendance, setAttendance] = useState<BeaconAttendanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manuallyPaused, setManuallyPaused] = useState(false);

  const engineRef = useRef<ProximityEngine | null>(null);
  const scannerRef = useRef<BleBeaconScanner | null>(null);
  const recorderRef = useRef<AttendanceRecorder | null>(null);
  const sweepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

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

  // 엔진 1회 생성 — 앱 전체에서 이 하나만 존재한다.
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

  /** 실제 스캔 시작. manual=true 면 사용자가 직접 누른 것 → 일시정지 해제. */
  const startScan = useCallback((manual: boolean) => {
    if (manual) {
      pausedRef.current = false;
      setManuallyPaused(false);
    }
    if (pausedRef.current) return;
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

  /** 스캔 중지. manual=true 면 자동 재시작도 막는다(사용자가 끈 것). */
  const stopScan = useCallback((manual: boolean) => {
    if (manual) {
      pausedRef.current = true;
      setManuallyPaused(true);
    }
    scannerRef.current?.stop();
    if (sweepRef.current) {
      clearInterval(sweepRef.current);
      sweepRef.current = null;
    }
    // 스캔이 멈춘 동안 inside 로 남아 있던 비콘은 sweep 이 없어 exit 이 안 난다.
    // 재개 시 새로 판정하도록 엔진 상태를 비운다(유령 '현재 위치' 방지).
    engineRef.current?.reset();
    setBeacons([]);
  }, []);

  const start = useCallback(() => startScan(true), [startScan]);
  const stop = useCallback(() => stopScan(true), [stopScan]);

  // ── 자동 시작: 로그인 상태 + 앱이 화면에 떠 있을 때만 ──
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      stopScan(false);
      return;
    }
    if (AppState.currentState === 'active') startScan(false);

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') startScan(false);
      else stopScan(false); // 백그라운드 = 스캔 중지(배터리)
    });
    return () => sub.remove();
  }, [authStatus, startScan, stopScan]);

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      if (sweepRef.current) clearInterval(sweepRef.current);
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  const supported = useMemo(
    () => scannerRef.current?.isSupported()
      ?? new BleBeaconScanner({ onObservation: () => {} }).isSupported(),
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

  const getStatuses = useCallback((): BeaconStatus[] => engineRef.current?.statuses() ?? [], []);

  const value = useMemo<UseBeaconProximityResult>(() => ({
    supported,
    scannerState,
    scanning: scannerState === 'scanning',
    beacons,
    events,
    attendance,
    error,
    start,
    stop,
    getStatuses,
    strongest,
    currentBinding,
    manuallyPaused,
  }), [
    supported, scannerState, beacons, events, attendance, error,
    start, stop, getStatuses, strongest, currentBinding, manuallyPaused,
  ]);

  return <BeaconContext.Provider value={value}>{children}</BeaconContext.Provider>;
}
