/**
 * RSSI 스무딩 — BLE RSSI 는 단발 변동이 ±5~15dB 로 커서 raw 값을 그대로 거리
 * 환산하면 1m ↔ 8m 사이를 출렁인다. `code/topcare-beacon/src/smoothing.ts` 포팅.
 *
 *  - EmaSmoother: 지수가중 이동평균. 빠르고 단순(실내 alpha≈0.2).
 *  - KalmanRssiFilter: 1차원 칼만 필터. 정지 비콘 거리 추적에 안정적.
 */

export interface RssiSmoother {
  update(rssi: number): number;
  value(): number | null;
  reset(): void;
}

/** Exponential moving average. */
export class EmaSmoother implements RssiSmoother {
  private val: number | null = null;
  constructor(private alpha = 0.2) {
    if (alpha <= 0 || alpha > 1) throw new Error('EmaSmoother: alpha must be in (0, 1]');
  }
  update(rssi: number): number {
    if (this.val === null) this.val = rssi;
    else this.val = this.alpha * rssi + (1 - this.alpha) * this.val;
    return this.val;
  }
  value(): number | null {
    return this.val;
  }
  reset(): void {
    this.val = null;
  }
}

/**
 * 1차원 Kalman filter.
 *  - 상태: 추정 RSSI
 *  - 프로세스 노이즈 Q: 작게 (정지 시 거의 변하지 않음)
 *  - 관측 노이즈 R: 크게 (BLE 단발 변동 큼)
 */
export class KalmanRssiFilter implements RssiSmoother {
  private x: number | null = null; // estimate
  private p = 1; // estimate uncertainty

  constructor(
    private Q = 0.01, // process noise
    private R = 4, // measurement noise (dB^2)
  ) {}

  update(rssi: number): number {
    if (this.x === null) {
      this.x = rssi;
      this.p = this.R;
      return this.x;
    }
    this.p = this.p + this.Q; // predict
    const k = this.p / (this.p + this.R); // gain
    this.x = this.x + k * (rssi - this.x); // update
    this.p = (1 - k) * this.p;
    return this.x;
  }
  value(): number | null {
    return this.x;
  }
  reset(): void {
    this.x = null;
    this.p = 1;
  }
}

/** 스무더 팩토리 — 엔진이 비콘마다 새 인스턴스를 만든다. */
export type SmootherFactory = () => RssiSmoother;

export const defaultSmootherFactory: SmootherFactory = () => new KalmanRssiFilter();
