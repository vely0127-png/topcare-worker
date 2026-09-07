/**
 * 위젯 딥링크: topcare-worker://records/{residentId}?scheduleId=&entry=widget (W2, 2026-09-07)
 *
 * 명세 A4 "서비스 → 해당 입소자 기록 화면"의 실제 목적지는 공동 작업판
 * (`app/(tabs)/workboard.tsx`)이다 — 체크(제공기록 생성)가 이뤄지는 화면이 거기뿐이다.
 * 그 파일은 이번 작업 수정 금지 대상이라 residentId/scheduleId를 받아 특정 행으로
 * 스크롤·강조하는 처리는 아직 없다.
 *
 * ⚠ 통합 지점(PD가 넣을 것) — `app/(tabs)/workboard.tsx`가 `useLocalSearchParams()`로
 *   `residentId`·`scheduleId`를 받아 해당 행을 찾아 스크롤(`scroll_to`)·하이라이트하게
 *   할 것. 지금은 워크보드를 열기만 한다(행 강조 없음) — "오탭의 결과는 앱이 열림뿐"
 *   이라는 A4 실수 방지 요건은 충족하지만, "바로 그 행"까지는 아직 아니다.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWidgetEntryMeasure } from '@/lib/widget/useWidgetEntryMeasure';

export default function WidgetRecordDeepLink() {
  const { residentId, scheduleId, entry } = useLocalSearchParams<{
    residentId?: string;
    scheduleId?: string;
    entry?: string;
  }>();
  useWidgetEntryMeasure('records', entry);

  const params: Record<string, string> = {};
  if (residentId) params.residentId = residentId;
  if (scheduleId) params.scheduleId = scheduleId;
  // entry=widget을 워크보드까지 전달 — 그래야 workboard.tsx가 독립적으로 위젯 진입을
  // 인지해 useWidgetEntryMeasure('workboard', entry)를 낼 수 있다(이 화면의 측정은
  // 'records' 화면명으로 별도로 이미 남는다).
  if (entry) params.entry = Array.isArray(entry) ? entry[0] : entry;

  return (
    <Redirect
      href={{
        pathname: '/workboard',
        params: Object.keys(params).length > 0 ? params : undefined,
      }}
    />
  );
}
