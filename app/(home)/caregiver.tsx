import { RoleHome, type QuickAction } from '@/components/RoleHome';

// 요양보호사 — 일일 할일, 케어 체크리스트, 비콘 출퇴근, 사진 업로드
const ACTIONS: QuickAction[] = [
  { key: 'shift', label: '오늘 할 일', href: '/(tabs)', hint: '서비스 체크리스트 (기록지 연동)' },
  { key: 'todos', label: '지시 업무', href: '/(tabs)/todos', hint: '관리자 지시·추가 업무' },
  { key: 'care-log', label: '케어 기록', href: '/(tabs)/care-log', hint: '배변·목욕·관찰' },
  { key: 'health-log', label: '건강 기록', href: '/(tabs)/health-log', hint: '식사·체중' },
  // P1(2026-07-27): href 없던 죽은 카드 → 실제 화면 연결 (비콘 미설치 시설은 화면에서 안내)
  { key: 'beacon', label: '자동 기록', href: '/(tabs)/service-log', hint: '비콘 근접 자동기록' },
  { key: 'proximity', label: '비콘 출퇴근', href: '/(tabs)/proximity', hint: '근접 인증' },
  { key: 'alerts', label: '알림센터', href: '/(tabs)/alerts' },
];

export default function CaregiverHome() {
  return <RoleHome title="요양보호 업무" actions={ACTIONS} />;
}
