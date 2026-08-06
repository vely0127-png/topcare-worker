import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 원장/센터장 — 운영 관리. 앱은 현장 확인용, 청구·리포트는 웹이 정본.
const ACTIONS: QuickAction[] = [
  { key: 'alerts', label: '실시간 알림', href: '/(tabs)/alerts', hint: '낙상·바이탈 긴급', icon: 'bell-alert', primary: true },
  { key: 'vitals', label: '바이탈 현황', href: '/(tabs)/vitals', hint: '입소자 이상 확인', icon: 'heart-pulse' },
  { key: 'care', label: '케어 현황', href: '/(tabs)/care-log', hint: '기록·관찰', icon: 'clipboard-edit' },
  { key: 'attendance', label: '근태(비콘)', href: '/(tabs)/proximity', hint: 'BLE 출퇴근', icon: 'bluetooth-connect' },
  // 앱 미구현 — 웹에서
  { key: 'residents', label: '입소자 관리', hint: '입퇴소·배정' },
  { key: 'staff', label: '직원/근무', hint: '배치·근태' },
  { key: 'billing', label: '청구 검토' },
  { key: 'reports', label: '운영 리포트' },
];

export default function DirectorHome() {
  return <RoleHome title="운영 관리" actions={ACTIONS} />;
}
