/**
 * BLE 비콘 스캐너 — react-native-ble-plx 래퍼.
 *
 * 책임:
 *  1) 위치/블루투스 런타임 권한 요청(Android API 31 분기, iOS 는 Info.plist + 상태).
 *  2) BleManager 스캔 시작/중지 + 어댑터 상태(onStateChange) 추적.
 *  3) 광고 패킷에서 iBeacon 프레임을 파싱해 BeaconObservation 스트림으로 방출.
 *
 * BLE 네이티브 모듈이라 Expo Go 에서는 동작하지 않는다 → development build 필요.
 * `__DEV__` 웹/Expo Go 환경에서 require 가 실패할 수 있어 동적 로드 + 가드를 둔다.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import type { BleError, BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { parseIBeacon, parseEddystoneUid, base64ToBytes } from './ibeacon';
import type { BeaconObservation } from './types';

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

export type ScannerState =
  | 'idle'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'ready'
  | 'scanning';

export interface BleScannerOptions {
  /** 파싱된 관측 콜백. */
  onObservation: (obs: BeaconObservation) => void;
  /** 스캐너/어댑터 상태 변화. */
  onStateChange?: (state: ScannerState) => void;
  /** 오류 콜백(스캔 실패 등). */
  onError?: (err: Error) => void;
  /**
   * 이 UUID 목록만 통과(소문자). null/undefined → 모든 iBeacon 통과.
   * 함수로 받아 레지스트리 변경을 매 관측마다 반영한다.
   */
  filterUuids?: () => string[] | null;
}

/** react-native-ble-plx 를 안전하게 로드. 미설치/웹 환경이면 null. */
function loadBlePlx(): typeof import('react-native-ble-plx') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-ble-plx');
  } catch {
    return null;
  }
}

export class BleBeaconScanner {
  private manager: BleManager | null = null;
  private stateSub: Subscription | null = null;
  private scanning = false;
  private readonly opts: BleScannerOptions;
  /**
   * MAC → iBeacon 고정 식별자 병합 맵 (2026-08-05).
   * 같은 비콘이 iBeacon 프레임이 실린 패킷과 안 실린 패킷(스캔 응답 등)을 번갈아 보내면
   * 두 정체(uuid|major|minor 와 MAC)로 갈라진다 — 프레임을 한 번이라도 본 MAC은
   * 이후 프레임 없는 패킷도 고정 식별자로 귀속시킨다.
   */
  private macToStable = new Map<string, string>();
  /** 새 식별자 최초 감지 시 1회만 logcat 출력 (Android Studio Logcat 진단용). */
  private loggedIds = new Set<string>();

  constructor(opts: BleScannerOptions) {
    this.opts = opts;
  }

  /** 네이티브 모듈 사용 가능 여부(Expo Go/웹 false). */
  isSupported(): boolean {
    return loadBlePlx() != null && Platform.OS !== 'web';
  }

  /**
   * 위치/블루투스 권한 요청. 모두 허용되면 true.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      // iOS 는 BleManager 첫 사용 시 시스템 다이얼로그가 뜬다(Info.plist 사유 문구).
      return true;
    }
    if (Platform.OS !== 'android') return false;

    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);

    try {
      if (apiLevel >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        const scanOk =
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
        const locOk =
          res[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
        // API 31+에서도 매니페스트에 neverForLocation을 안 쓰므로(비콘=위치 파생 목적)
        // 위치 권한이 거부되면 스캔 결과가 조용히 0건이 된다 — 정직하게 실패 처리.
        if (scanOk && !locOk) {
          this.opts.onError?.(new Error(
            '위치 권한이 거부되어 비콘이 감지되지 않습니다 — 설정 > 앱 > TopCare 종사자 > 권한에서 위치를 허용해주세요',
          ));
          return false;
        }
        return scanOk && locOk;
      }
      // API < 31: 위치 권한이 BLE 스캔의 사실상 게이트.
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      this.opts.onError?.(e instanceof Error ? e : new Error(String(e)));
      return false;
    }
  }

  /** 스캔 시작. 권한/상태 확인 후 startDeviceScan. */
  async start(): Promise<void> {
    const plx = loadBlePlx();
    if (!plx || Platform.OS === 'web') {
      this.opts.onStateChange?.('unsupported');
      return;
    }
    if (!this.manager) {
      this.manager = new plx.BleManager();
      // [진단] 네이티브 스캔 계층 로그 — logcat 태그 RxBle로 기기별 수신 확인 (2026-08-05)
      this.manager.setLogLevel(plx.LogLevel.Verbose);
      // 어댑터 상태 추적(현재 상태 즉시 방출).
      this.stateSub = this.manager.onStateChange((s) => this.handleAdapterState(plx, s), true);
    }

    const granted = await this.requestPermissions();
    if (!granted) {
      this.opts.onStateChange?.('unauthorized');
      return;
    }

    const state = await this.manager.state();
    if (state !== plx.State.PoweredOn) {
      this.handleAdapterState(plx, state);
      return;
    }

    this.beginScan(plx);
  }

  private handleAdapterState(plx: typeof import('react-native-ble-plx'), s: State): void {
    switch (s) {
      case plx.State.PoweredOn:
        this.opts.onStateChange?.(this.scanning ? 'scanning' : 'ready');
        break;
      case plx.State.PoweredOff:
        this.opts.onStateChange?.('poweredOff');
        break;
      case plx.State.Unauthorized:
        this.opts.onStateChange?.('unauthorized');
        break;
      case plx.State.Unsupported:
        this.opts.onStateChange?.('unsupported');
        break;
      default:
        // Unknown/Resetting — 전이 중. 무시.
        break;
    }
  }

  private beginScan(plx: typeof import('react-native-ble-plx')): void {
    if (!this.manager || this.scanning) return;
    this.scanning = true;
    this.opts.onStateChange?.('scanning');
    this.manager.startDeviceScan(
      null,
      // LowLatency 복귀 (2026-08-05): Balanced는 삼성 기기에서 감지 누락·지연 —
      // 렉의 실제 원인(관측마다 리렌더)은 관측/렌더 분리로 이미 해결됨
      { allowDuplicates: true, scanMode: plx.ScanMode.LowLatency },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          this.scanning = false;
          this.opts.onError?.(new Error(error.message));
          this.opts.onStateChange?.('ready');
          return;
        }
        if (device) this.handleDevice(device);
      },
    );
  }

  private scanCount = 0;

  private handleDevice(device: Device): void {
    // [진단] Holy 비콘(45:C6:6A:…)은 모든 콜백 로깅 + 500콜백마다 수신량 요약
    if (device.id.toLowerCase().startsWith('45:c6')) {
      console.log(`[BEACON_RAW45] ${device.id} rssi=${device.rssi} mfg=${device.manufacturerData ?? '-'}`);
    }
    if (++this.scanCount % 500 === 0) {
      console.log(`[BEACON_CNT] callbacks=${this.scanCount} uniqueIds=${this.loggedIds.size}`);
    }
    if (device.rssi == null) return;
    const frame = parseIBeacon(device.manufacturerData);
    const eddy = frame ? null : parseEddystoneUid(device.serviceData as Record<string, string> | null);
    // 식별자 = 디바이스 MAC (2026-08-05 확정 — HolyIOT 실물 확인):
    // HolyIOT은 MAC이 고정이고 QR 인쇄값이 곧 MAC이라, MAC이 가장 단순·확실한 식별자.
    // 매칭은 normalizeUuid(콜론 무시)로 — QR 등록값 45C66AF31951 == 전파 45:c6:6a:f3:19:51.
    // iBeacon/Eddystone 프레임은 measuredPower(거리 보정)·major/minor 표시에만 사용.
    const uuid = device.id.toLowerCase();

    const filter = this.opts.filterUuids?.();
    if (filter && filter.length > 0 && !filter.includes(uuid)) return;

    // 광고 원본 요약 — 미확인 비콘 형식 진단용 (행 길게 누르면 표시)
    const mfgHex = hex(base64ToBytes(device.manufacturerData));
    const sdKeys = device.serviceData ? Object.keys(device.serviceData).join(',') : '';
    const raw = `name=${device.localName ?? device.name ?? '-'}\nmfg=${mfgHex || '-'}\nserviceData=${sdKeys || '-'}\nsvcUUIDs=${(device.serviceUUIDs ?? []).join(',') || '-'}\nmac=${device.id}`;

    // Logcat 진단 — 새 식별자 최초 1회: adb logcat에서 'BEACON_DIAG' 필터
    if (!this.loggedIds.has(uuid)) {
      this.loggedIds.add(uuid);
      console.log(`[BEACON_DIAG] id=${uuid} rssi=${device.rssi} ${raw.replace(/\n/g, ' ')}`);
    }

    this.opts.onObservation({
      uuid,
      rssi: device.rssi,
      timestamp: Date.now(),
      measuredPower: frame?.measuredPower ?? eddy?.txPower ?? device.txPowerLevel ?? undefined,
      major: frame?.major,
      minor: frame?.minor,
      name: device.localName ?? device.name ?? null,
      raw,
    });
  }

  /** 스캔 중지(매니저는 유지). */
  stop(): void {
    if (this.manager && this.scanning) {
      this.manager.stopDeviceScan();
    }
    this.scanning = false;
    this.opts.onStateChange?.('ready');
  }

  /** 전체 해제(언마운트 시). */
  destroy(): void {
    this.stop();
    this.stateSub?.remove();
    this.stateSub = null;
    this.manager?.destroy();
    this.manager = null;
  }
}
