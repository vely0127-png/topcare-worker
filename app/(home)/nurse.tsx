import { useMemo } from 'react';
import { RoleHome, type QuickAction } from '@/components/RoleHome';
import { useTrail } from '@/lib/hooks/useTrail';

// 간호사 — 바이탈 라운드, 케어 기록, 관찰 일지
// 2026-08-06: '바이탈 입력'이라 써두고 실제로는 조회 화면으로 보내던 오표기를 수정.
//   측정(입력) = /(tabs)/vitals/measure, 현황(조회) = /(tabs)/vitals
export default function NurseHome() {
  const { pendingCount } = useTrail();

  const actions = useMemo<QuickAction[]>(() => [
    { key: 'vitals-measure', label: '바이탈 측정', href: '/(tabs)/vitals/measure', hint: '체온·산소·혈압·맥박 (한 분씩)', icon: 'thermometer', primary: true },
    { key: 'trail', label: '내 행적', href: '/(tabs)/trail', hint: '다녀온 곳에 무얼 했는지 기록', icon: 'map-marker-path', badge: pendingCount },
    { key: 'vitals', label: '바이탈 현황', href: '/(tabs)/vitals', hint: '오늘 측정값·이상 확인', icon: 'heart-pulse' },
    { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스·관찰 일지', icon: 'clipboard-edit' },
    { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사 섭취', icon: 'food-apple' },
    { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation', icon: 'eye-check' },
    { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
  ], [pendingCount]);

  return <RoleHome title="간호 업무" actions={actions} />;
}
