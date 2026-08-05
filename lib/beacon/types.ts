/**
 * 비콘 근접 엔진 공용 타입.
 */
import type { PathLossModel } from './distance';

/** 스캐너가 만들어 엔진에 흘려보내는 단일 관측. */
export interface BeaconObservation {
  /** 비콘 식별자 — iBeacon proximity UUID(소문자) 또는 디바이스 id. */
  uuid: string;
  /** 관측 RSSI(dBm). 음수. */
  rssi: number;
  /** 관측 시각(epoch ms). */
  timestamp: number;
  /** 광고 패킷에 실린 measured power(있으면 거리 환산에 우선 사용). */
  measuredPower?: number;
  /** iBeacon major/minor (있으면). */
  major?: number;
  minor?: number;
  /** 광고에 실린 기기 이름(localName) — 비콘 형식 진단·표시용 (2026-08-05). */
  name?: string | null;
}

/** enter/exit 상태머신이 내보내는 이벤트. */
export interface ProximityEvent {
  type: 'enter' | 'exit';
  /** 대상 비콘 UUID(소문자). */
  uuid: string;
  /** 매핑된 Room id(레지스트리에 없으면 null). */
  roomId: string | null;
  /** 표시용 위치 라벨(레지스트리에 없으면 null). */
  roomLabel: string | null;
  /** 이벤트 시점의 스무딩 거리(m). */
  distanceMeters: number;
  /** 발생 시각(epoch ms). */
  at: number;
}

/** 비콘별 현재 상태 스냅샷(UI 노출용). */
export interface BeaconStatus {
  uuid: string;
  roomId: string | null;
  roomLabel: string | null;
  inside: boolean;
  /** 최신 스무딩 거리(m). 관측 없으면 null. */
  distanceMeters: number | null;
  /** 최신 스무딩 RSSI. */
  smoothedRssi: number | null;
  /** 마지막 관측 시각(epoch ms). */
  lastSeenAt: number | null;
  /** 광고 기기 이름(있으면) — 표시·진단용. */
  name?: string | null;
}

/** 엔진 설정. enter/exit 임계가 다른 히스테리시스 + 디바운스. */
export interface ProximityEngineConfig {
  /** ENTER 판정 임계 거리(m). 이 거리 이내가 enterDebounceMs 동안 지속되면 enter. */
  enterMeters: number;
  /**
   * EXIT 판정 임계 거리(m). enterMeters 보다 커야 한다(히스테리시스).
   * 이 거리 이상이 exitDebounceMs 동안 지속되면 exit.
   */
  exitMeters: number;
  /** ENTER 디바운스(ms). */
  enterDebounceMs: number;
  /** EXIT 디바운스(ms). */
  exitDebounceMs: number;
  /**
   * 관측 끊김 타임아웃(ms). inside 상태에서 이 시간 동안 관측이 없으면
   * "멀어짐"으로 간주해 exit 처리.
   */
  lostTimeoutMs: number;
  /** path-loss 모델(measuredPower 없을 때 사용). */
  pathLoss?: PathLossModel;
}

export const DEFAULT_ENGINE_CONFIG: ProximityEngineConfig = {
  enterMeters: 2.5,
  exitMeters: 4.0,
  enterDebounceMs: 3_000,
  exitDebounceMs: 8_000,
  lostTimeoutMs: 15_000,
};
