/**
 * ServiceRecorder — 비콘 근접 이벤트를 **사실 그대로 서버에 보낸다.**
 *
 * 2026-08-06 일원화 (대표 결정)
 *   이전에는 이 클래스가 `POST /api/care/service-provisions` 로 서비스 초안을 **직접 만들고**
 *   exit 때 PATCH 로 마감했다. 그런데 서버 `POST /api/presence/events` 도 같은 초안을 만들 수
 *   있어서, 체류 기록을 붙이는 순간 한 방문에 초안이 2개 생기는 구조였다.
 *   → 앱은 이제 초안을 만들지 않는다. enter/exit 사실만 보내고,
 *     초안 생성·마감·소요시간·시간표 정합·미준수 Alert 는 서버가 단독으로 한다.
 *
 * 흐름:
 *   enter + 시간표 매칭 성공 → presence(enter, mode='full')        → 서버가 초안 생성
 *   enter + 매칭 실패        → presence(enter, mode='event-only')  → 체류만 남고 수동 선택 요청
 *   수동 선택 확정           → presence(enter, mode='provision-only') → 초안만 추가(체류 중복 방지)
 *   exit                     → presence(exit,  mode='full')        → 열린 초안 마감 + 정합
 *
 * ★ 자동 확정 없음 — 서버가 만드는 것도 항상 draft.
 */

import type { ProximityEvent } from './types';
import type { ServiceSchedule } from '../hooks/useServiceSchedules';
import { matchScheduleByTime } from '../hooks/useServiceSchedules';
import { postPresenceEvent, type PresenceMode, type PresencePostResult } from '../hooks/usePresence';
import { beaconRegistry } from './registry';

// ── 열린 서비스(enter 후 exit 전) 추적 ────────────────────────
export interface OpenService {
  /** 서버가 만든 초안 id. 매칭 실패로 초안이 없으면 null(체류만 열려 있음). */
  provisionId: string | null;
  beaconUuid: string;
  residentId: string;
  serviceType: string;
  startAt: string;
}

export interface ServiceRecorderOptions {
  // onNeedSelection 제거(2026-08-06) — 매칭 실패해도 그 자리에서 묻지 않는다.
  //   체류만 남기고 '내 행적'에서 나중에 고른다. 즉시 프롬프트를 되살리지 말 것.
  /** 초안 생성 성공 콜백. */
  onDraftCreated?: (provisionId: string, auto: boolean) => void;
  /** exit 처리 완료 콜백. */
  onServiceEnded?: (provisionId: string | null, endAt: string) => void;
  /** 오류 콜백. */
  onError?: (phase: 'enter' | 'exit' | 'manual', err: Error) => void;
  /** 서버 응답 알림(정합 결과 등)을 화면에 띄우고 싶을 때. */
  onServerMessage?: (message: string) => void;
}

/**
 * 비콘이 가리키는 입소자. **정확히 1명일 때만** 반환한다.
 * 비콘=침대 단위(입소자 1명)가 정본 설계이므로, 호실 폴백으로 여러 명이 걸리면
 * 누구 곁에 있었는지 단정할 수 없다 — 추측해서 남기느니 남기지 않는다.
 */
function soleResidentOf(uuid: string): { id: string; name: string } | null {
  const rs = beaconRegistry.get(uuid)?.residents ?? [];
  return rs.length === 1 ? rs[0] : null;
}

export class ServiceRecorder {
  private openMap = new Map<string, OpenService>(); // uuid → open service
  private schedules: ServiceSchedule[] = [];
  /**
   * enter 는 보냈지만 서비스 초안이 없는 방문의 uuid.
   * (시간표 매칭 실패 → event-only). exit 을 짝지어 보내기 위해 기억한다.
   */
  private openNoProvisionUuids = new Set<string>();

  constructor(private opts: ServiceRecorderOptions) {}

  /** 오늘 시간표 갱신 (훅에서 주입). */
  setSchedules(schedules: ServiceSchedule[]): void {
    this.schedules = schedules;
  }

  /** enter 이벤트 처리. */
  async handleEnter(event: ProximityEvent, staffId: string): Promise<void> {
    // 이미 열려 있는 서비스 또는 수동 선택 대기 중이면 무시 (Bug4 fix)
    if (this.openMap.has(event.uuid) || this.openNoProvisionUuids.has(event.uuid)) return;

    // 담당 입소자가 확정되지 않은 비콘(미등록·호실 폴백)은 체류를 남기지 않는다.
    const resident = soleResidentOf(event.uuid);
    if (!resident) return;

    // [Bug1 fix] KST 기준 요일 계산
    const kstDate = new Date(event.at + 9 * 3600_000);
    const dow = kstDate.getUTCDay(); // 0=일,1=월…6=토 (KST 요일)
    const occurredAt = new Date(event.at).toISOString();

    const matched = matchScheduleByTime(this.schedules, event.at, dow, staffId);
    // 매칭된 계획이 이 비콘의 입소자와 다르면 신뢰하지 않는다(옆 침대 계획을 끌어오지 않도록)
    const usable = matched && matched.residentId === resident.id ? matched : null;

    try {
      const res = await this.send({
        eventType: 'enter',
        mode: usable ? 'full' : 'event-only',
        residentId: resident.id,
        staffId,
        roomId: event.roomId,
        beaconUuid: event.uuid,
        serviceType: usable?.serviceType ?? null,
        scheduleId: usable?.id ?? null,
        occurredAt,
        distanceM: event.distanceMeters,
      });

      if (usable && res.provision) {
        this.openMap.set(event.uuid, {
          provisionId: res.provision.id,
          beaconUuid: event.uuid,
          residentId: resident.id,
          serviceType: usable.serviceType,
          startAt: occurredAt,
        });
        this.opts.onDraftCreated?.(res.provision.id, true);
      } else {
        // 체류는 남았지만 무슨 서비스인지 모른다.
        // 2026-08-06: **그 자리에서 묻지 않는다.** 어르신 앞에서 폰을 꺼내게 만들지 않는 게
        // 대표 결정이다. 사실(enter)만 서버에 남기고, '무얼 했는지'는 나중에
        // '내 행적' 화면에서 방문 단위로 고른다(mode='provision-only').
        // 여기서는 exit 을 짝지어 보낼 수 있도록 uuid 만 기억해 둔다.
        this.openNoProvisionUuids.add(event.uuid);
      }
    } catch (e) {
      this.opts.onError?.('enter', e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * 수동 선택 후 초안 생성.
   * enter 이벤트(체류)는 이미 서버에 남아 있으므로 `provision-only` 로 보낸다 —
   * 여기서 이벤트를 또 만들면 체류시간이 두 번 계산된다.
   */
  async createManual(
    event: ProximityEvent,
    staffId: string,
    residentId: string,
    serviceType: string,
    scheduleId?: string | null,
  ): Promise<void> {
    if (this.openMap.has(event.uuid)) return;
    this.openNoProvisionUuids.delete(event.uuid);

    const occurredAt = new Date(event.at).toISOString();
    try {
      const res = await this.send({
        eventType: 'enter',
        mode: 'provision-only',
        residentId,
        staffId,
        roomId: event.roomId,
        beaconUuid: event.uuid,
        serviceType,
        scheduleId: scheduleId ?? null,
        occurredAt,
        distanceM: event.distanceMeters,
      });
      if (res.provision) {
        this.openMap.set(event.uuid, {
          provisionId: res.provision.id,
          beaconUuid: event.uuid,
          residentId,
          serviceType,
          startAt: occurredAt,
        });
        this.opts.onDraftCreated?.(res.provision.id, false);
      }
    } catch (e) {
      this.opts.onError?.('manual', e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** 수동 선택 취소 — pending uuid 해제. */
  dismissPending(uuid: string): void {
    this.openNoProvisionUuids.delete(uuid);
  }

  /** exit 이벤트 처리. */
  async handleExit(event: ProximityEvent): Promise<void> {
    const open = this.openMap.get(event.uuid);
    const pending = this.openNoProvisionUuids.has(event.uuid);
    // 열린 서비스도 없고 대기 중도 아니면, 이 비콘에서 enter 를 보낸 적이 없다 → 짝 없는 exit 금지
    if (!open && !pending) return;

    const resident = soleResidentOf(event.uuid);
    const residentId = open?.residentId ?? resident?.id;
    if (!residentId) return;

    const occurredAt = new Date(event.at).toISOString();
    try {
      await this.send({
        eventType: 'exit',
        // 초안 없이 체류만 열린 경우(수동 선택 대기 중 이탈)는 마감할 초안이 없다
        mode: open ? 'full' : 'event-only',
        residentId,
        roomId: event.roomId,
        beaconUuid: event.uuid,
        serviceType: open?.serviceType ?? null,
        occurredAt,
        distanceM: event.distanceMeters,
      });
      this.openMap.delete(event.uuid);
      this.openNoProvisionUuids.delete(event.uuid);
      this.opts.onServiceEnded?.(open?.provisionId ?? null, occurredAt);
    } catch (e) {
      this.opts.onError?.('exit', e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** 현재 열려 있는 서비스 목록 스냅샷. */
  openServices(): OpenService[] {
    return Array.from(this.openMap.values());
  }

  /** 상태 초기화 (로그아웃 등). */
  reset(): void {
    this.openMap.clear();
    this.openNoProvisionUuids.clear();
  }

  // ── 내부 ──────────────────────────────────────────────────
  private async send(vars: {
    eventType: 'enter' | 'exit';
    mode: PresenceMode;
    residentId: string;
    staffId?: string;
    roomId: string | null;
    beaconUuid: string;
    serviceType: string | null;
    scheduleId?: string | null;
    occurredAt: string;
    distanceM: number | null;
  }): Promise<PresencePostResult> {
    const res = await postPresenceEvent({ ...vars, source: 'beacon' });
    if (res.message) this.opts.onServerMessage?.(res.message);
    return res;
  }
}
