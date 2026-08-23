import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 시설장/대표 — 앱에서는 알림·근태·바이탈 확인만. 청구·직원·설정은 웹이 정본.
const ACTIONS: QuickAction[] = [
  { key: 'alerts', label: '실시간 알림', href: '/(tabs)/alerts', hint: '낙상·바이탈 긴급', icon: 'bell-alert', primary: true },
  // 2026-08-23: 시설장 홈에 공동 작업판이 없어 "지금 누가 무엇을 했는가"를 앱에서 볼 수 없었다.
  // 현장 확인이 이 홈의 존재 이유이므로 입구를 넣는다. 시설장이 행을 탭하면 기록자에 본인
  // 이름이 남는다 — 그게 사실이므로 그대로 남긴다(대리 기록도 기록이다).
  { key: 'workboard', label: '공동 작업판', href: '/(tabs)/workboard', hint: '지금 이 시간, 누가 무엇을 했는지', icon: 'view-dashboard' },
  { key: 'vitals', label: '바이탈 현황', href: '/(tabs)/vitals', hint: '입소자 이상 확인', icon: 'heart-pulse' },
  { key: 'attendance', label: '근태(비콘)', href: '/(tabs)/proximity', hint: 'BLE 출퇴근', icon: 'bluetooth-connect' },
  // 아래는 앱 미구현 — href 없으면 홈에 표시되지 않는다(죽은 카드 금지)
  { key: 'residents', label: '입소자 요약', hint: '정원/현원/위험군' },
  { key: 'staff', label: '직원 현황', hint: '근무/출퇴근' },
  { key: 'billing', label: '청구 현황', hint: '월별 청구·수납' },
  { key: 'settings', label: '시설 설정' },
];

export default function OwnerHome() {
  return <RoleHome title="시설 현황" actions={ACTIONS} />;
}
