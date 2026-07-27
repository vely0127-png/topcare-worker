/**
 * @topcare/worker 비콘 근접 모듈 — S4a.
 *
 * 스캐너(BLE) → 엔진(enter/exit 히스테리시스 상태머신) → 출퇴근 기록.
 * React 연동은 `lib/hooks/useBeaconProximity.ts` 참고.
 */
export {
  rssiToDistance,
  expectedRssiAtDistance,
  calibratePathLoss,
  DEFAULT_PATH_LOSS,
  type PathLossModel,
} from './distance';
export {
  EmaSmoother,
  KalmanRssiFilter,
  defaultSmootherFactory,
  type RssiSmoother,
  type SmootherFactory,
} from './smoothing';
export { parseIBeacon, base64ToBytes, normalizeUuid, type IBeaconFrame } from './ibeacon';
export { ProximityEngine, type ProximityEngineOptions, type RoomResolver } from './proximity-engine';
export {
  BeaconRegistry,
  beaconRegistry,
  SEED_BINDINGS,
  type BeaconBinding,
} from './registry';
export { BleBeaconScanner, type BleScannerOptions, type ScannerState } from './scanner';
export {
  AttendanceRecorder,
  postAttendance,
  type AttendanceResult,
  type AttendanceType,
} from './attendance';
export {
  DEFAULT_ENGINE_CONFIG,
  type BeaconObservation,
  type BeaconStatus,
  type ProximityEngineConfig,
  type ProximityEvent,
} from './types';
export {
  ServiceRecorder,
  type OpenService,
  type ServiceRecorderOptions,
} from './service-recorder';
