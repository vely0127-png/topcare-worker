/**
 * FCM 위젯 새로고침 데이터 메시지 처리 (W2, 2026-09-07)
 *
 * ADR §4-2 갱신 경로 ③: `{type:'widget_refresh'}`(PII 0) 수신 시 앱이 백그라운드에서
 * 스냅샷 재작성을 시도한다. OS가 백그라운드 실행을 막으면 다음 앱 실행(포그라운드
 * 복귀 — useWidgetSync가 처리)까지 노화 표기로 정직하게 넘어간다. 이 파일은 즉시
 * 갱신을 보장하지 않는다 — 억지로 보장하는 척하지 않는다(정직성 원칙).
 *
 * 이 파일은 "무엇을 트리거할지"만 정의한다(관련 쿼리 무효화 → useWidgetSync가 최신
 * 데이터로 스냅샷을 다시 씀, 디바운스 5초 뒤). 실제 수신은 기존 푸시 핸들러가 한다.
 *
 * ⚠ 통합 지점(PD가 넣을 것) — 기존 FCM/푸시 수신 핸들러는 `app/_layout.tsx`의
 *   `Notifications.addNotificationReceivedListener(...)`(RootLayout의
 *   `status === 'authenticated'` useEffect 블록)이다. 그 콜백에 아래 한 줄을 추가할 것
 *   (해당 파일은 이번 작업 수정 금지 대상이라 이 세션은 직접 넣지 않는다):
 *
 *     notifRef.current = Notifications.addNotificationReceivedListener((n) => {
 *       handleRefreshMessage(n.request.content.data, queryClient);
 *       void queryClient.invalidateQueries({ queryKey: ['alerts'] });
 *     });
 */
import type { QueryClient } from '@tanstack/react-query';

export interface WidgetRefreshMessage {
  type?: string;
}

/** 위젯 새로고침 신호인지 판정 — type 필드만 본다(그 외 필드가 실려 있어도 무시). */
export function isWidgetRefreshMessage(data: unknown): data is WidgetRefreshMessage {
  return !!data && typeof data === 'object' && (data as WidgetRefreshMessage).type === 'widget_refresh';
}

/**
 * 관련 쿼리를 무효화한다 — useWidgetSync가 구독 중인 쿼리(service-schedules·
 * service-provisions·alerts·todos·facility)가 새로 받아온 데이터로 스냅샷을
 * 재작성한다. 앱이 백그라운드라 리렌더가 아예 일어나지 않으면 이 무효화 자체가
 * 실행되지 않을 수 있다 — OS 제약(위 통합 지점 주석 참고), 이 함수의 책임 밖이다.
 */
export function handleRefreshMessage(data: unknown, queryClient: QueryClient): void {
  if (!isWidgetRefreshMessage(data)) return;
  void queryClient.invalidateQueries({ queryKey: ['service-schedules'] });
  void queryClient.invalidateQueries({ queryKey: ['service-provisions'] });
  void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  void queryClient.invalidateQueries({ queryKey: ['todos'] });
  void queryClient.invalidateQueries({ queryKey: ['facility'] });
}
