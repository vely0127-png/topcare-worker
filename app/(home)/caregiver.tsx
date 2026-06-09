import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 요양보호사 — 일일 할일, 케어 체크리스트, 비콘 출퇴근, 사진 업로드
const ACTIONS: QuickAction[] = [
  { key: 'shift', label: '내 근무', href: '/(tabs)', hint: '오늘 배정·담당 입소자' },
  { key: 'todos', label: '오늘 할일', href: '/(tabs)/todos', hint: '케어 체크리스트' },
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스 기록' },
  { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사·체중' },
  { key: 'beacon', label: '비콘 출퇴근', hint: '근접 인증 (S2)' },
  { key: 'alerts', label: '알림센터', href: '/(tabs)/alerts' },
];

export default function CaregiverHome() {
  return <RoleHome title="요양보호 업무" actions={ACTIONS} />;
}
