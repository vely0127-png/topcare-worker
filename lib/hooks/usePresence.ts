/**
 * 비콘 체류(PresenceEvent) 전송 — `POST /api/presence/events`.
 *
 * 2026-08-06 일원화: **서비스 초안을 만드는 곳은 서버 한 군데**다.
 * 이전에는 워커앱이 `POST /api/care/service-provisions` 로 초안을 직접 만들고,
 * 서버 presence 라우트도 같은 초안을 만들 수 있어 둘 다 쓰면 한 방문에 초안이 2개 생겼다.
 * 이제 앱은 "언제 누구 곁에 들어왔고 나갔다"는 **사실만** 보내고,
 * 초안 생성·마감·소요시간·시간표 정합·미준수 Alert 는 전부 서버가 한다.
 *
 * mode
 *   'full'           이벤트 + 초안 (시간표 매칭 성공)
 *   'event-only'     이벤트만 (매칭 실패 — 체류는 사실이므로 남기되 기록지는 안 만듦)
 *   'provision-only' 초안만 (위 방문을 사람이 나중에 수동 선택 — enter 이벤트는 이미 있음)
 */
import { postWithQueue } from '../queue/offline-queue';

export type PresenceMode = 'full' | 'event-only' | 'provision-only';

export interface PresencePostVars {
  eventType: 'enter' | 'exit';
  residentId: string;
  mode?: PresenceMode;
  staffId?: string | null;
  roomId?: string | null;
  beaconUuid?: string | null;
  serviceType?: string | null;
  scheduleId?: string | null;
  occurredAt: string;
  distanceM?: number | null;
  source?: string;
  /** provision-only 전용 — 어느 방문(enter 이벤트)에 초안을 붙일지 */
  enterEventId?: string | null;
  /** provision-only 전용 — 이미 끝난 방문이므로 종료 시각도 함께 확정.
   *  안 주면 초안이 열린 채 남아 다음 exit 이 엉뚱하게 마감한다. */
  endAt?: string | null;
}

export interface PresencePostResult {
  event: { id: string | null; eventType: string };
  provision: {
    id: string;
    status: string;
    startAt?: string;
    endAt?: string;
    durationMin?: number | null;
  } | null;
  matchedOpenDraft?: boolean;
  reconciliation?: { serviceDate: string; findings: number; alertsCreated: number };
  message?: string;
}

export function postPresenceEvent(vars: PresencePostVars): Promise<PresencePostResult> {
  // 오프라인 큐 대상(2026-09-06 vc11 베타 차단, 비콘 체류 이벤트) — occurredAt은 vars에
  // 이미 있으므로(위 인터페이스 필수 필드) postWithQueue가 그대로 살려 보낸다.
  // 직접 전송이 네트워크·5xx로 실패하면 큐에 넣고 QueuedOfflineError를 던진다
  // (service-recorder.ts의 send()에서 구분 처리 — 화면에 "오류"가 아니라 "대기 중"으로 알림).
  return postWithQueue<PresencePostResult>({
    kind: 'beacon-presence',
    label: `비콘 ${vars.eventType === 'enter' ? '입장' : '이탈'}${vars.serviceType ? `(${vars.serviceType})` : ''}`,
    url: '/api/presence/events',
    body: vars as unknown as Record<string, unknown>,
  });
}
