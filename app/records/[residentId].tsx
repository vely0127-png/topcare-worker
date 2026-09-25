/**
 * 위젯 딥링크: topcare-worker://records/{residentId}?scheduleId=&entry=widget (W2, 2026-09-07)
 *
 * 명세 A4 "서비스 → 해당 입소자 기록 화면"의 실제 목적지는 공동 작업판
 * (`app/(tabs)/workboard.tsx`)이다 — 체크(제공기록 생성)가 이뤄지는 화면이 거기뿐이다.
 *
 * 통합 완료(2.4.6, Q22-10a 2026-09-25) — workboard.tsx가 `residentId`·`scheduleId`를 받아
 *   해당 행을 찾고, 접힌 이월 구획·미래 블록이면 먼저 펼친 뒤 스크롤·강조한다(경보 카드 강조와
 *   같은 방식). scheduleId 행이 오늘 판에 없으면 상단 인라인 안내 1줄을 띄운다.
 *   이 파일은 파라미터(ID만, 명세 C-8)를 그대로 넘기는 리다이렉트만 담당한다.
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
