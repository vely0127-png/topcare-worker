/**
 * 위젯 딥링크: topcare-worker://alerts/{id}?entry=widget (W2, 2026-09-07)
 *
 * 워커앱에는 아직 알림 "상세" 화면이 없다 — `app/(tabs)/alerts.tsx`는 목록뿐이고
 * (2026-09-07 grep 확인), "알림 상세 화면 파일"은 이번 작업의 수정 금지 대상(다른
 * 세션이 작업 중이라 정확한 경로를 알 수 없다). 그래서 지금은 목록으로 보내고
 * id를 쿼리로 넘긴다 — 딥링크 파라미터는 ID만(성명·측정값 금지, C-8 충족).
 *
 * ⚠ 통합 지점(PD가 넣을 것) — 알림 상세 화면이 생기면 아래 Redirect의 href를 그
 *   화면 경로로 바꾸고, 그 화면이 `useLocalSearchParams().id`로 알림을 다시 조회하게
 *   할 것. 그 전까지 대안: `app/(tabs)/alerts.tsx`가 `id` 쿼리를 받아 해당 카드로
 *   스크롤·강조(그 파일도 이번 세션 수정 대상 아님).
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWidgetEntryMeasure } from '@/lib/widget/useWidgetEntryMeasure';

export default function WidgetAlertDeepLink() {
  const { id, entry } = useLocalSearchParams<{ id?: string; entry?: string }>();
  useWidgetEntryMeasure('alerts-detail', entry);

  // entry=widget을 /alerts까지 전달 — alerts.tsx가 이 파라미터로 위젯 진입을 인지해
  // useWidgetEntryMeasure('alerts-list', entry)를 내고, id로 해당 카드를 스크롤·강조한다.
  const params: Record<string, string> = {};
  if (id) params.id = Array.isArray(id) ? id[0] : id;
  if (entry) params.entry = Array.isArray(entry) ? entry[0] : entry;

  return (
    <Redirect
      href={{
        pathname: '/alerts',
        params: Object.keys(params).length > 0 ? params : undefined,
      }}
    />
  );
}
