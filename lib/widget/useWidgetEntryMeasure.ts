/**
 * 위젯 진입 측정 태깅 (W2, 2026-09-07 / PD 통합 2026-09-07)
 *
 * ADR-001 §4-4 "측정 로깅: 진입 이벤트를 measurement_event로(명세 B7)".
 * 명세 B7의 이벤트 필드에는 `surface`(widget/app/notification)가 있다.
 * `lib/measure/client.ts`에 `setEntrySurface('widget'|null)` 진입점이 추가되어
 * (통합 지점 ⑦) 이제 scopeTag가 실제로 `surface:app;entry:widget`로 나간다 —
 * 화면명 라벨 접두(`entry:widget:...`) 근사치와 함께 이중으로 남긴다(전자가 정본,
 * 후자는 하위호환 — 기존에 라벨 접두로 필터링하던 곳이 있어도 계속 동작).
 *
 * 사용: 위젯 딥링크로 열리는 화면(예: app/alerts/[id].tsx, app/records/[residentId].tsx)에서
 *   `useWidgetEntryMeasure('alerts-detail', entry)`처럼 부른다. entry가 'widget'일 때만
 *   1회(마운트당) 이벤트를 낸다 — 일반 진입(entry 없음)은 기존 measure.navigate 등
 *   호출부가 이미 처리하므로 여기서 중복으로 잡지 않는다.
 *
 * scopeTag 오버라이드는 이 화면에 머무는 동안만 유효해야 한다 — 언마운트 시 반드시
 * null로 되돌린다(안 그러면 다음에 연 일반 화면까지 위젯 표면으로 잘못 태깅된다).
 * 이 화면들은 즉시 다른 화면으로 Redirect되므로(app/alerts/[id].tsx 등) 언마운트가
 * 매우 빨리 일어날 수 있다 — 그래도 setEntrySurface(null) 복원은 필요하다(마운트~
 * Redirect 사이에 나가는 이 훅의 measure.step 자체가 그 표면 태그를 달아야 하므로).
 */
import { useEffect, useRef } from 'react';
import { measure, setEntrySurface } from '../measure/client';

export function useWidgetEntryMeasure(screen: string, entry: string | string[] | undefined): void {
  const firedRef = useRef(false);
  const isWidget = entry === 'widget' || (Array.isArray(entry) && entry.includes('widget'));

  useEffect(() => {
    if (!isWidget) return;
    setEntrySurface('widget');
    if (!firedRef.current) {
      firedRef.current = true;
      measure.step(`entry:widget:${screen}`, 'navigate');
    }
    return () => setEntrySurface(null);
  }, [isWidget, screen]);
}
