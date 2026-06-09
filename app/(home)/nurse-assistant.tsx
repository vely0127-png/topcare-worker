import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 간호조무사 — 간호 보조 (케어 기록, 바이탈 보조 입력, 건강 점검)
const ACTIONS: QuickAction[] = [
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스 기록' },
  { key: 'vitals', label: '바이탈 입력', href: '/(tabs)/vitals', hint: '측정 보조' },
  { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사·체중' },
  { key: 'todos', label: '오늘 할일', href: '/(tabs)/todos' },
  { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation' },
  { key: 'alerts', label: '알림센터', href: '/(tabs)/alerts' },
];

export default function NurseAssistantHome() {
  return <RoleHome title="간호 보조 업무" actions={ACTIONS} />;
}
