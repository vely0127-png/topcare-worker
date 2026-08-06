import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 간호조무사 — 오전 바이탈 라운드가 주 업무(스키마 018 정의)
const ACTIONS: QuickAction[] = [
  { key: 'vitals-measure', label: '바이탈 측정', href: '/(tabs)/vitals/measure', hint: '오전 라운드 — 한 분씩', icon: 'thermometer', primary: true },
  { key: 'vitals', label: '바이탈 현황', href: '/(tabs)/vitals', hint: '오늘 측정값·이상 확인', icon: 'heart-pulse' },
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스 기록', icon: 'clipboard-edit' },
  { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사 섭취', icon: 'food-apple' },
  { key: 'todos', label: '지시 업무', href: '/(tabs)/todos', icon: 'account-check' },
  { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation', icon: 'eye-check' },
  { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
];

export default function NurseAssistantHome() {
  return <RoleHome title="간호 보조 업무" actions={ACTIONS} />;
}
