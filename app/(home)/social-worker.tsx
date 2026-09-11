import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 사회복지사 — 상담·면담은 아직 웹 전용. 프로그램 진행 기록은 vc9부터 앱에서(피드백 #12·#14).
const ACTIONS: QuickAction[] = [
  // 프로그램 진행은 사회복지사의 주 업무이고 현장(프로그램실)에서 끝나야 이중 입력이 없다.
  { key: 'programs', label: '오늘 프로그램', href: '/(tabs)/programs', hint: '참여자·참여도 기록', icon: 'account-group', primary: true },
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '서비스·관찰 일지', icon: 'clipboard-edit' },
  { key: 'observation', label: '관찰 일지', href: '/(tabs)/observation', icon: 'eye-check' },
  { key: 'alerts', label: '알림', href: '/(tabs)/alerts', icon: 'bell' },
  // 2026-09-11 급여명세서(전자로 진행, 대표 결정) — 확정본만 표시
  { key: 'payroll', label: '급여명세서', href: '/(tabs)/payroll', hint: '월별 지급·공제 내역', icon: 'cash-multiple' },
  // 앱 미구현 — 웹에서
  { key: 'counsel', label: '상담일지', hint: '입소자·보호자 상담' },
  { key: 'guardian', label: '보호자 면담', hint: '면담 기록·예약' },
  { key: 'admission', label: '입소 절차', hint: '신규 입소 진행' },
];

export default function SocialWorkerHome() {
  return <RoleHome title="사회복지 업무" actions={ACTIONS} />;
}
