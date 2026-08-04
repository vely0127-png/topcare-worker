/**
 * 비콘 ↔ Room(위치) 매핑 — 최소 구현.
 *
 * 한 시설에 여러 비콘이 깔리고, 한 방(Room)에 여러 비콘이 있을 수도 있다(현관/복도/병실).
 * 반대로 한 비콘은 보통 한 위치에 고정된다 → "Room 1 : N Beacon" 관계.
 * 다대다(공용 비콘이 여러 논리적 위치를 커버)도 막지 않도록 binding 을 배열로 둔다.
 *
 * 백엔드 스키마(prisma)에는 아직 Beacon 모델/Room.beaconUuid 가 없다. 이는 S4b(백엔드)
 * 에서 `model Beacon { uuid, roomId, ... }` 로 실체화하고, 여기 registry 는
 * `GET /api/.../beacons` 로 동기화하도록 `setBindings()` 진입점을 열어둔다.
 * 지금(S4a)은 .env / 상수로 시드한 정적 매핑 + 런타임 주입만으로 동작한다.
 */
import { normalizeUuid } from './ibeacon';

export interface BeaconBinding {
  /** iBeacon proximity UUID(소문자 권장) 또는 디바이스 id. */
  uuid: string;
  /** 매핑된 Room id(prisma Room.id). 없으면 위치 라벨만. */
  roomId: string | null;
  /** 표시용 위치 라벨 (예: "현관", "201호"). */
  roomLabel: string;
  /** iBeacon major/minor 로 추가 구분이 필요할 때(선택). */
  major?: number;
  minor?: number;
  /** 시설/출입 인증의 기준이 되는 대표 비콘인지(예: 정문). */
  primary?: boolean;
  /** 이 위치(호실)의 입소자 — 서버 등록부(/api/beacons) 동기화 시 채워짐 (2026-08-05). */
  residents?: { id: string; name: string }[];
}

export class BeaconRegistry {
  private byUuid = new Map<string, BeaconBinding>();

  constructor(bindings: BeaconBinding[] = []) {
    this.setBindings(bindings);
  }

  /** 전체 매핑 교체(예: 서버 동기화 후). */
  setBindings(bindings: BeaconBinding[]): void {
    this.byUuid.clear();
    for (const b of bindings) {
      this.byUuid.set(normalizeUuid(b.uuid), { ...b, uuid: normalizeUuid(b.uuid) });
    }
  }

  /** 단건 등록/갱신. */
  upsert(binding: BeaconBinding): void {
    this.byUuid.set(normalizeUuid(binding.uuid), {
      ...binding,
      uuid: normalizeUuid(binding.uuid),
    });
  }

  /** 등록된 비콘인지. */
  has(uuid: string): boolean {
    return this.byUuid.has(normalizeUuid(uuid));
  }

  get(uuid: string): BeaconBinding | undefined {
    return this.byUuid.get(normalizeUuid(uuid));
  }

  /** 엔진 RoomResolver 형태로 변환. */
  resolveRoom(uuid: string): { roomId: string | null; roomLabel: string | null } {
    const b = this.byUuid.get(normalizeUuid(uuid));
    return { roomId: b?.roomId ?? null, roomLabel: b?.roomLabel ?? null };
  }

  /** 출입 인증 기준 대표 비콘들의 UUID. */
  primaryUuids(): string[] {
    return Array.from(this.byUuid.values())
      .filter((b) => b.primary)
      .map((b) => b.uuid);
  }

  /** 등록된 모든 UUID. */
  knownUuids(): string[] {
    return Array.from(this.byUuid.keys());
  }

  all(): BeaconBinding[] {
    return Array.from(this.byUuid.values());
  }
}

/**
 * 개발/데모 시드. 실제 시설 비콘 UUID 로 교체하거나, 부팅 시 서버에서 받아
 * `registry.setBindings()` 로 덮어쓴다. UUID 는 beacon 패키지 예시값과 동일.
 */
export const SEED_BINDINGS: BeaconBinding[] = [
  {
    uuid: 'fda50693-a4e2-4fb1-afcf-c6eb07647825',
    roomId: null,
    roomLabel: '정문(출퇴근)',
    primary: true,
  },
];

/** 전역 공용 레지스트리(앱 단일 인스턴스). */
export const beaconRegistry = new BeaconRegistry(SEED_BINDINGS);
