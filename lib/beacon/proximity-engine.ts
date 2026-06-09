/**
 * 비콘별 enter/exit 상태머신.
 *
 * S4a 핵심: RSSI 스무딩 → 거리 환산 → 히스테리시스 + 디바운스가 걸린
 * 2-상태(OUTSIDE/INSIDE) 머신으로 enter/exit 이벤트 스트림을 만든다.
 *
 * 단발성 인증(ProximityAuthenticator, beacon 패키지)과 달리 여기서는 "지속적인
 * 근접 추적"이 목적이다. 한 번 들어오면(enter) 나갈 때까지(exit) inside 를 유지하며,
 * 채터링(경계에서 enter/exit 가 깜빡이는 현상)을 막기 위해 두 가지 안전장치를 둔다:
 *
 *   1) 히스테리시스: enterMeters < exitMeters. 들어올 땐 가깝게(예 2.5m), 나갈 땐
 *      충분히 멀어져야(예 4.0m) 인정. 경계선 진동에 강함.
 *   2) 디바운스: 조건이 enterDebounceMs / exitDebounceMs 동안 "연속" 유지돼야 전이.
 *
 * 또한 inside 상태에서 관측이 lostTimeoutMs 동안 끊기면(비콘 신호 소실) exit 로 본다.
 * 이 타임아웃 판정은 외부 타이머가 주기적으로 `sweep(now)` 를 호출해 처리한다.
 */
import { DEFAULT_PATH_LOSS, rssiToDistance, type PathLossModel } from './distance';
import { defaultSmootherFactory, type RssiSmoother, type SmootherFactory } from './smoothing';
import { normalizeUuid } from './ibeacon';
import {
  DEFAULT_ENGINE_CONFIG,
  type BeaconObservation,
  type BeaconStatus,
  type ProximityEngineConfig,
  type ProximityEvent,
} from './types';

type State = 'outside' | 'inside';

interface BeaconRuntime {
  uuid: string;
  state: State;
  smoother: RssiSmoother;
  measuredPower?: number;
  lastDistance: number | null;
  lastSmoothedRssi: number | null;
  lastSeenAt: number | null;
  /** enter 후보가 임계 안으로 처음 들어온 시각(없으면 null). */
  enterCandidateSince: number | null;
  /** exit 후보가 임계 밖으로 처음 나간 시각(없으면 null). */
  exitCandidateSince: number | null;
}

/** roomId/label 을 붙여주는 매핑 함수. (registry 가 주입) */
export type RoomResolver = (uuid: string) => { roomId: string | null; roomLabel: string | null };

export interface ProximityEngineOptions {
  config?: Partial<ProximityEngineConfig>;
  pathLoss?: PathLossModel;
  smootherFactory?: SmootherFactory;
  resolveRoom?: RoomResolver;
  /** 이벤트 콜백. */
  onEvent?: (event: ProximityEvent) => void;
  /** 테스트용 시간 주입. */
  now?: () => number;
}

export class ProximityEngine {
  private readonly cfg: ProximityEngineConfig;
  private readonly pathLoss: PathLossModel;
  private readonly smootherFactory: SmootherFactory;
  private readonly resolveRoom: RoomResolver;
  private readonly onEvent?: (event: ProximityEvent) => void;
  private readonly now: () => number;
  private beacons = new Map<string, BeaconRuntime>();

  constructor(opts: ProximityEngineOptions = {}) {
    this.cfg = { ...DEFAULT_ENGINE_CONFIG, ...opts.config };
    if (this.cfg.exitMeters <= this.cfg.enterMeters) {
      throw new Error('ProximityEngine: exitMeters must be greater than enterMeters (hysteresis)');
    }
    this.pathLoss = opts.pathLoss ?? DEFAULT_PATH_LOSS;
    this.smootherFactory = opts.smootherFactory ?? defaultSmootherFactory;
    this.resolveRoom = opts.resolveRoom ?? (() => ({ roomId: null, roomLabel: null }));
    this.onEvent = opts.onEvent;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 관측 1건 처리. 상태 전이 시 enter/exit 이벤트를 방출. */
  observe(obs: BeaconObservation): void {
    if (!isFinite(obs.rssi) || obs.rssi >= 0) return;
    const uuid = normalizeUuid(obs.uuid);
    const rt = this.ensure(uuid);
    if (obs.measuredPower != null) rt.measuredPower = obs.measuredPower;

    const smoothed = rt.smoother.update(obs.rssi);
    const model: PathLossModel =
      rt.measuredPower != null
        ? { txPower: rt.measuredPower, pathLossExponent: this.pathLoss.pathLossExponent }
        : this.pathLoss;
    const dist = rssiToDistance(smoothed, model);

    rt.lastSmoothedRssi = smoothed;
    rt.lastDistance = dist;
    rt.lastSeenAt = obs.timestamp;

    this.evaluate(rt, dist, obs.timestamp);
  }

  /**
   * 끊긴 비콘 처리용 주기 호출. inside 상태에서 마지막 관측이 lostTimeoutMs 이전이면
   * exit 로 전이. 외부 setInterval 에서 호출한다.
   */
  sweep(now: number = this.now()): void {
    for (const rt of this.beacons.values()) {
      if (rt.state !== 'inside') continue;
      if (rt.lastSeenAt == null) continue;
      if (now - rt.lastSeenAt >= this.cfg.lostTimeoutMs) {
        rt.state = 'outside';
        rt.enterCandidateSince = null;
        rt.exitCandidateSince = null;
        rt.smoother.reset();
        this.emit('exit', rt, rt.lastDistance ?? this.cfg.exitMeters, now);
      }
    }
  }

  /** 현재 비콘 상태 스냅샷(UI 렌더용). */
  statuses(): BeaconStatus[] {
    return Array.from(this.beacons.values()).map((rt) => {
      const room = this.resolveRoom(rt.uuid);
      return {
        uuid: rt.uuid,
        roomId: room.roomId,
        roomLabel: room.roomLabel,
        inside: rt.state === 'inside',
        distanceMeters: rt.lastDistance,
        smoothedRssi: rt.lastSmoothedRssi,
        lastSeenAt: rt.lastSeenAt,
      };
    });
  }

  /** 특정 비콘이 현재 inside 인지. */
  isInside(uuid: string): boolean {
    return this.beacons.get(normalizeUuid(uuid))?.state === 'inside';
  }

  reset(): void {
    this.beacons.clear();
  }

  private ensure(uuid: string): BeaconRuntime {
    let rt = this.beacons.get(uuid);
    if (!rt) {
      rt = {
        uuid,
        state: 'outside',
        smoother: this.smootherFactory(),
        lastDistance: null,
        lastSmoothedRssi: null,
        lastSeenAt: null,
        enterCandidateSince: null,
        exitCandidateSince: null,
      };
      this.beacons.set(uuid, rt);
    }
    return rt;
  }

  private evaluate(rt: BeaconRuntime, dist: number, at: number): void {
    if (rt.state === 'outside') {
      // exit 후보 무의미.
      rt.exitCandidateSince = null;
      if (dist <= this.cfg.enterMeters) {
        if (rt.enterCandidateSince == null) rt.enterCandidateSince = at;
        if (at - rt.enterCandidateSince >= this.cfg.enterDebounceMs) {
          rt.state = 'inside';
          rt.enterCandidateSince = null;
          this.emit('enter', rt, dist, at);
        }
      } else {
        rt.enterCandidateSince = null;
      }
      return;
    }

    // state === 'inside'
    rt.enterCandidateSince = null;
    if (dist >= this.cfg.exitMeters) {
      if (rt.exitCandidateSince == null) rt.exitCandidateSince = at;
      if (at - rt.exitCandidateSince >= this.cfg.exitDebounceMs) {
        rt.state = 'outside';
        rt.exitCandidateSince = null;
        this.emit('exit', rt, dist, at);
      }
    } else {
      rt.exitCandidateSince = null;
    }
  }

  private emit(type: 'enter' | 'exit', rt: BeaconRuntime, dist: number, at: number): void {
    const room = this.resolveRoom(rt.uuid);
    this.onEvent?.({
      type,
      uuid: rt.uuid,
      roomId: room.roomId,
      roomLabel: room.roomLabel,
      distanceMeters: dist,
      at,
    });
  }
}
