import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 자원봉사자 — 출근, 봉사일지, 비콘 인증
const ACTIONS: QuickAction[] = [
  { key: 'checkin', label: '출근 체크', hint: '비콘 인증 (S2)' },
  { key: 'log', label: '봉사일지', hint: '활동 기록' },
  { key: 'schedule', label: '봉사 일정', hint: '배정 일정' },
  { key: 'alerts', label: '공지/알림', href: '/(tabs)/alerts' },
];

export default function VolunteerHome() {
  return <RoleHome title="자원봉사 활동" actions={ACTIONS} />;
}
