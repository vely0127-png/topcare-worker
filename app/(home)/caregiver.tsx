import { useMemo } from 'react';
import { RoleHome, type QuickAction } from '@/components/RoleHome';
import { useTrail } from '@/lib/hooks/useTrail';

// 요양보호사 — 일일 할일, 케어 체크리스트, 비콘 자동기록
export default function CaregiverHome() {
  // 아직 무얼 했는지 안 고른 방문 수 = '내 행적' 배지 (2026-08-06)
  const { pendingCount } = useTrail();

  const actions = useMemo<QuickAction[]>(() => [
    { key: 'shift', label: '오늘 할 일', href: '/(tabs)', hint: '서비스 체크리스트 (기록지 연동)', icon: 'clipboard-list', primary: true },
    { key: 'trail', label: '내 행적', href: '/(tabs)/trail', hint: '다녀온 곳에 무얼 했는지 기록', icon: 'map-marker-path', badge: pendingCount },
    { key: 'todos', label: '지시 업무', href: '/(tabs)/todos', hint: '관리자 지시·추가 업무', icon: 'account-check' },
    { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '배변·목욕·관찰', icon: 'clipboard-edit' },
    { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사 섭취', icon: 'food-apple' },
    // P1(2026-07-27): href 없던 죽은 카드 → 실제 화면 연결 (비콘 미설치 시설은 화면에서 안내)
    { key: 'beacon', label: '자동 기록', href: '/(tabs)/service-log', hint: '비콘 근접 자동기록', icon: 'clipboard-check' },
    { key: 'proximity', label: '비콘 근접', href: '/(tabs)/proximity', hint: '현재 위치·근접 인증', icon: 'bluetooth-connect' },
    { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
  ], [pendingCount]);

  return <RoleHome title="요양보호 업무" actions={actions} />;
}
