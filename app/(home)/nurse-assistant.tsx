import { useMemo } from 'react';
import { RoleHome, type QuickAction } from '@/components/RoleHome';
import { useTrail } from '@/lib/hooks/useTrail';

// 간호조무사 — 오전 바이탈 라운드가 주 업무(스키마 018 정의)
export default function NurseAssistantHome() {
  const { pendingCount } = useTrail();

  const actions = useMemo<QuickAction[]>(() => [
    { key: 'vitals-measure', label: '바이탈 측정', href: '/(tabs)/vitals/measure', hint: '오전 라운드 — 한 분씩', icon: 'thermometer', primary: true },
    { key: 'workboard', label: '공동 작업판', href: '/(tabs)/workboard', hint: '지금 이 시간의 계획·완료 현황', icon: 'view-dashboard' },
    { key: 'trail', label: '내 행적', href: '/(tabs)/trail', hint: '다녀온 곳에 무얼 했는지 기록', icon: 'map-marker-path', badge: pendingCount },
    { key: 'vitals', label: '바이탈 현황', href: '/(tabs)/vitals', hint: '오늘 측정값·이상 확인', icon: 'heart-pulse' },
    { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스 기록', icon: 'clipboard-edit' },
    { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사 섭취', icon: 'food-apple' },
    { key: 'todos', label: '지시 업무', href: '/(tabs)/todos', icon: 'account-check' },
    { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation', icon: 'eye-check' },
    { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
    // 2026-09-11 급여명세서(전자로 진행, 대표 결정) — 확정본만 표시
    { key: 'payroll', label: '급여명세서', href: '/(tabs)/payroll', hint: '월별 지급·공제 내역', icon: 'cash-multiple' },
  ], [pendingCount]);

  return <RoleHome title="간호 보조 업무" actions={actions} />;
}
