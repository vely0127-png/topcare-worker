import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 자원봉사자 — 봉사일지·일정은 앱 미구현. 지금은 공지 확인과 비콘 근접만.
const ACTIONS: QuickAction[] = [
  { key: 'alerts', label: '공지 / 알림', href: '/(tabs)/alerts', icon: 'bell', primary: true },
  { key: 'proximity', label: '비콘 근접', href: '/(tabs)/proximity', hint: '출근 인증', icon: 'bluetooth-connect' },
  // 앱 미구현
  { key: 'log', label: '봉사일지', hint: '활동 기록' },
  { key: 'schedule', label: '봉사 일정', hint: '배정 일정' },
];

export default function VolunteerHome() {
  return <RoleHome title="자원봉사 활동" actions={ACTIONS} />;
}
