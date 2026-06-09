import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 간호사 — 케어 기록, 투약, 바이탈 입력, AI 분석
const ACTIONS: QuickAction[] = [
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스·관찰 일지' },
  { key: 'vitals', label: '바이탈 입력', href: '/(tabs)/vitals', hint: '혈압·맥박·체온' },
  { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사·체중·점검' },
  { key: 'medication', label: '투약 관리', hint: '투약 확인·기록' },
  { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation' },
  { key: 'alerts', label: '알림센터', href: '/(tabs)/alerts' },
];

export default function NurseHome() {
  return <RoleHome title="간호 업무" actions={ACTIONS} />;
}
