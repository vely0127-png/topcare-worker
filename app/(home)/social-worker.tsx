import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 사회복지사 — 상담·면담·프로그램은 아직 웹 전용. 앱은 기록·알림만.
const ACTIONS: QuickAction[] = [
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스·관찰 일지', icon: 'clipboard-edit', primary: true },
  { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation', icon: 'eye-check' },
  { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
  // 앱 미구현 — 웹에서
  { key: 'counsel', label: '상담일지', hint: '입소자·보호자 상담' },
  { key: 'guardian', label: '보호자 면담', hint: '면담 기록·예약' },
  { key: 'admission', label: '입소 절차', hint: '신규 입소 진행' },
  { key: 'programs', label: '프로그램', hint: '여가·재활 일정' },
];

export default function SocialWorkerHome() {
  return <RoleHome title="사회복지 업무" actions={ACTIONS} />;
}
