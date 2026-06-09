import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 사회복지사 — 상담일지, 보호자 면담, 입소 절차
const ACTIONS: QuickAction[] = [
  { key: 'counsel', label: '상담일지', hint: '입소자·보호자 상담' },
  { key: 'guardian', label: '보호자 면담', hint: '면담 기록·예약' },
  { key: 'admission', label: '입소 절차', hint: '신규 입소 진행' },
  { key: 'residents', label: '입소자 관리', hint: '기본 정보' },
  { key: 'programs', label: '프로그램', hint: '여가·재활 일정' },
  { key: 'alerts', label: '알림센터', href: '/(tabs)/alerts' },
];

export default function SocialWorkerHome() {
  return <RoleHome title="사회복지 업무" actions={ACTIONS} />;
}
