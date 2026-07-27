import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 시설장/대표 — 시설 대시보드 (실시간 알림, 청구, 직원/입소자 요약)
const ACTIONS: QuickAction[] = [
  { key: 'alerts', label: '실시간 알림', href: '/(tabs)/alerts', hint: '낙상·바이탈 긴급' },
  { key: 'residents', label: '입소자 요약', hint: '정원/현원/위험군' },
  { key: 'staff', label: '직원 현황', hint: '근무/출퇴근' },
  { key: 'attendance', label: '근태(비콘)', href: '/(tabs)/proximity', hint: 'BLE 출퇴근 · S4a' },
  { key: 'billing', label: '청구 현황', hint: '월별 청구·수납' },
  { key: 'ai', label: 'AI 분석 요약', hint: '제안·이상 징후' },
  { key: 'settings', label: '시설 설정' },
];

export default function OwnerHome() {
  return <RoleHome title="시설 대시보드" actions={ACTIONS} />;
}
