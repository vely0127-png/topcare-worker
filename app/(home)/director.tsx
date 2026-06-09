import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 원장/센터장 — 운영 관리 (시설장과 유사하나 운영 중심)
const ACTIONS: QuickAction[] = [
  { key: 'alerts', label: '실시간 알림', href: '/(tabs)/alerts', hint: '낙상·바이탈 긴급' },
  { key: 'residents', label: '입소자 관리', hint: '입퇴소·배정' },
  { key: 'staff', label: '직원/근무', hint: '배치·근태' },
  { key: 'care', label: '케어 현황', href: '/(tabs)/care-log', hint: '기록·투약' },
  { key: 'billing', label: '청구 검토' },
  { key: 'reports', label: '운영 리포트' },
];

export default function DirectorHome() {
  return <RoleHome title="운영 관리" actions={ACTIONS} />;
}
