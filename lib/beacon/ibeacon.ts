/**
 * iBeacon 광고 패킷 파서.
 *
 * react-native-ble-plx 의 Device.manufacturerData 는 base64 문자열로 들어온다.
 * iBeacon 은 Apple 제조사 데이터(companyId 0x004C) 안에 다음 레이아웃을 싣는다:
 *
 *   [0..1]  company id   0x4C 0x00 (little-endian)
 *   [2]     type         0x02 (iBeacon)
 *   [3]     length       0x15 (21)
 *   [4..19] proximity UUID (16 bytes)
 *   [20..21] major (big-endian)
 *   [22..23] minor (big-endian)
 *   [24]    measured power (signed int8, 1m 기준 RSSI)
 *
 * RN 환경에는 Buffer/atob 가 보장되지 않으므로 base64 디코드를 직접 구현한다(무의존).
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → 바이트 배열. 유효하지 않으면 빈 배열. */
export function base64ToBytes(b64: string | null | undefined): number[] {
  if (!b64) return [];
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '=') break;
    const idx = B64.indexOf(c);
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface IBeaconFrame {
  /** 정규화된 proximity UUID (소문자, 하이픈 포함). */
  uuid: string;
  major: number;
  minor: number;
  /** 1m 기준 측정 파워(dBm, 음수). */
  measuredPower: number;
}

/** 8 → 4 → 4 → 4 → 12 하이픈 포맷. */
function formatUuid(hex32: string): string {
  return (
    hex32.slice(0, 8) +
    '-' +
    hex32.slice(8, 12) +
    '-' +
    hex32.slice(12, 16) +
    '-' +
    hex32.slice(16, 20) +
    '-' +
    hex32.slice(20, 32)
  );
}

/** int8 (two's complement). */
function int8(b: number): number {
  return b > 127 ? b - 256 : b;
}

/**
 * manufacturerData(base64) → iBeacon 프레임. iBeacon 이 아니면 null.
 */
export function parseIBeacon(manufacturerData: string | null | undefined): IBeaconFrame | null {
  const bytes = base64ToBytes(manufacturerData);
  if (bytes.length < 25) return null;
  // company id 0x004C (little-endian: 0x4C, 0x00)
  if (bytes[0] !== 0x4c || bytes[1] !== 0x00) return null;
  // iBeacon type/length
  if (bytes[2] !== 0x02 || bytes[3] !== 0x15) return null;

  const uuidHex = toHex(bytes.slice(4, 20));
  const major = (bytes[20] << 8) | bytes[21];
  const minor = (bytes[22] << 8) | bytes[23];
  const measuredPower = int8(bytes[24]);

  return {
    uuid: formatUuid(uuidHex),
    major,
    minor,
    measuredPower,
  };
}

/** UUID 비교용 정규화(소문자, 하이픈 제거 후 재포맷 허용). */
export function normalizeUuid(uuid: string): string {
  return uuid.trim().toLowerCase();
}

// ── Eddystone UID (2026-08-05) ─────────────────────────────
// 중국계 비콘 다수가 iBeacon 대신/함께 Eddystone을 쏜다.
// 서비스 데이터 0xFEAA, 프레임타입 0x00(UID): [0]=0x00 [1]=txPower
// [2..11]=namespace(10B, 고정) [12..17]=instance(6B, 유닛별 고정)
// → MAC 랜덤화와 무관한 고정 식별자.

export interface EddystoneUidFrame {
  namespace: string; // hex 20자
  instance: string;  // hex 12자
  txPower: number;
}

/** Device.serviceData(맵: uuid→base64) → Eddystone UID 프레임. 없으면 null. */
export function parseEddystoneUid(
  serviceData: Record<string, string> | null | undefined,
): EddystoneUidFrame | null {
  if (!serviceData) return null;
  const key = Object.keys(serviceData).find((k) => k.toLowerCase().includes('feaa'));
  if (!key) return null;
  const bytes = base64ToBytes(serviceData[key]);
  if (bytes.length < 18 || bytes[0] !== 0x00) return null;
  return {
    txPower: int8(bytes[1]),
    namespace: toHex(bytes.slice(2, 12)),
    instance: toHex(bytes.slice(12, 18)),
  };
}
