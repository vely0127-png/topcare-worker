/**
 * RSSI → 거리(m) 환산. Log-distance path-loss 모델.
 *
 *   d(rssi) = 10 ^ ((txPower - rssi) / (10 * n))
 *
 * `code/topcare-beacon/src/distance.ts` 의 알고리즘을 종사자 앱(Expo RN)으로 포팅.
 * 별도 npm 패키지(@topcare/beacon)는 Node 빌드(dist) 전제라 Metro 번들에 직접
 * 물리기 어렵다. 거리/스무딩 같은 순수 로직은 동일 구현을 worker 안에 복제해
 * 두 곳의 거동을 일치시킨다(테스트도 동일 케이스 재사용 가능).
 *
 *  - txPower: 1m 거리에서의 RSSI(dBm). 비콘 제조사 스펙(통상 -59 ~ -69dBm).
 *  - n: 환경 path-loss 지수. 자유공간 2.0, 일반 실내 2.5~3.5.
 */

export interface PathLossModel {
  /** 1m 거리에서의 RSSI(dBm). 일반적으로 비콘 advertise measuredPower 값. */
  txPower: number;
  /** Path-loss exponent. 실내 기본 3.0. */
  pathLossExponent: number;
}

/**
 * ── 실측 캘리브레이션 (2026-08-06) ──────────────────────────────
 * HolyIOT 비콘 ~30개를 폰에서 **x축 1m**(y·z 무시)에 두고 logcat 수집.
 *   표본 536개 · 범위 -89 ~ -48 dBm · 표준편차 6.6 dB
 *   중앙값 -61 · 최빈값 -61 · 평균 -62.3 · 10%절사평균 -61.8
 *
 * txPower = **-61** (중앙값 = 최빈값). 평균(-62.3)을 쓰지 않은 이유는
 * 여러 개를 겹쳐 놓아 뒤쪽 비콘이 앞쪽에 가려진 표본(-75 이하 꼬리)이
 * 평균을 끌어내렸기 때문 — 실제 설치는 침대당 1개라 그 가림이 없다.
 *
 * ⚠ 한계: 1m 한 점만 재서 **pathLossExponent(n)는 추정할 수 없다.**
 *   n은 1m에서 멀어질 때 거리가 얼마나 빨리 커지는지를 정하는 값이라
 *   3m·5m 표본이 있어야 `calibratePathLoss()` 로 같이 맞출 수 있다.
 *   n=3.0은 일반 실내 기본값을 유지한 것이며 현장 검증 대상이다.
 *
 * ⚠ RSSI 산포는 없앨 수 없다: 같은 1m에서도 41dB가 흩어진다.
 *   단일 표본으로 환산하면 ±1σ가 거리 1.66배 오차다. 그래서 스캐너는
 *   Kalman 스무딩 + 히스테리시스(enter/exit 임계 분리)를 반드시 거친다.
 *   "거리 숫자"를 그대로 믿지 말고 enter/exit 판정만 신뢰할 것.
 */
export const DEFAULT_PATH_LOSS: PathLossModel = {
  txPower: -61,
  pathLossExponent: 3.0,
};

/** RSSI → 거리(m). 0 이상 RSSI 는 무의미(무한대 반환). */
export function rssiToDistance(rssi: number, model: PathLossModel = DEFAULT_PATH_LOSS): number {
  if (!isFinite(rssi) || rssi >= 0) return Number.POSITIVE_INFINITY;
  const exponent = (model.txPower - rssi) / (10 * model.pathLossExponent);
  const d = Math.pow(10, exponent);
  return Math.max(0, d);
}

/**
 * proximityMeters 경계 거리에 해당하는 기대 RSSI(dBm).
 *   rssi = txPower - 10n·log10(d)
 */
export function expectedRssiAtDistance(
  meters: number,
  model: PathLossModel = DEFAULT_PATH_LOSS,
): number {
  return model.txPower - 10 * model.pathLossExponent * Math.log10(Math.max(0.01, meters));
}

/**
 * 비콘 캘리브레이션 — 알려진 거리/RSSI 표본으로 txPower·n 최소자승 추정.
 * 시설별 셋업 시 1m·3m·5m 표본을 모아 보정에 사용.
 */
export function calibratePathLoss(
  samples: { distance: number; rssi: number }[],
): PathLossModel {
  const pts = samples.filter((s) => s.distance > 0 && s.rssi < 0 && isFinite(s.rssi));
  if (pts.length < 2) {
    throw new Error('calibratePathLoss: need at least 2 valid distance/RSSI samples');
  }
  const xs = pts.map((p) => Math.log10(p.distance));
  const ys = pts.map((p) => p.rssi);
  const n = pts.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) {
    return { txPower: meanY, pathLossExponent: DEFAULT_PATH_LOSS.pathLossExponent };
  }
  const b = num / den; // slope = -10n
  const a = meanY - b * meanX; // intercept = txPower
  const pathLossExponent = -b / 10;
  return {
    txPower: a,
    pathLossExponent: Math.max(1.5, Math.min(6, pathLossExponent)),
  };
}
