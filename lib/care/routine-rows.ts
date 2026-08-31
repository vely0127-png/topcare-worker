/**
 * 시설 일과표 × 입소자 → 가상 계획행 (정본 하나)
 *
 * 왜 이 파일이 있나 (2026-08-31 대표 신고)
 *   "기본 설정 시간표를 저장해서 웹 서비스 시간표에는 610건이 떴는데
 *    앱 공동 작업판에는 아무것도 안 뜬다."
 *   원인 — 워커앱에서 서비스 시간표를 보여주는 화면은 [공동 작업판] 하나뿐인데,
 *   그 화면은 개인 계획(ServiceSchedule)만 읽고 시설 일과표를 아예 읽지 않았다.
 *   (lib/hooks/useTodayTasks.ts 에 같은 병합 로직이 있었지만 헤더 주석이 사용처로 적은
 *    (tabs)/index.tsx · proximity.tsx 가 탭바 제거 UX 개편 때 바뀌면서 호출이 끊겨
 *    아무 화면도 쓰지 않는 상태였다 — 그래서 앱만 조용히 비어 있었다.)
 *
 * 규약은 웹 components/care/ServiceTodoList.tsx 와 동일하게 맞춘다.
 *   - 개인화 유형(기저귀·체위·투약 등)은 그 유형의 개인 계획이 있는 입소자에게만 붙인다
 *     (비사용자에게 기저귀 교체 일정 금지 — 2026-07-20 대표 지적)
 *   - 같은 (입소자·시각·내용)에 실제 계획이 있으면 가상행을 만들지 않는다(중복 금지)
 *
 * ⚠ 이 파일이 유일한 구현이다. 화면에서 복사해 쓰지 말 것 —
 *   웹/앱이 다른 목록을 보여주는 사고가 이번이 처음이 아니다.
 */
import type { ServiceSchedule } from '../hooks/useServiceSchedules';
import type { ServiceProvision } from '../hooks/useServiceProvisions';
import { PERSONAL_TYPES, inferTypeFromActivity } from './service-rules';

export interface RoutineItem { time: string; activity: string }
export interface ResidentLite { id: string; name: string }

/** 가상행 id 접두사 — 이 접두사로 시작하면 서버에 존재하지 않는 행이다. */
export const VIRTUAL_ID_PREFIX = 'v|';

export const isVirtualSchedule = (s: { id: string }) => s.id.startsWith(VIRTUAL_ID_PREFIX);

/**
 * 시설 일과표 × 입소자 → ServiceSchedule 모양의 가상행.
 *
 * ServiceSchedule 과 같은 모양으로 돌려주는 이유: 화면(공동 작업판)이 실계획과
 * 가상행을 한 목록으로 그대로 다루게 하기 위해서다. 다만 **id 는 서버에 없다** —
 * 저장할 때는 scheduleId 를 보내지 말고 note(일과 내용)를 보내야 한다.
 * 판별은 isVirtualSchedule() 로 한다.
 */
export function buildRoutineSchedules(args: {
  routine: RoutineItem[];
  residents: ResidentLite[];
  realSchedules: ServiceSchedule[]; // 오늘 요일로 이미 걸러진 실제 계획
  allSchedules: ServiceSchedule[];  // 요일 무관 전체 — 개인화 유형 보유 판정용
}): ServiceSchedule[] {
  const { routine, residents, realSchedules, allSchedules } = args;

  const realKeys = new Set(
    realSchedules.map((s) => `${s.residentId}|${s.plannedStart}|${s.note ?? ''}`),
  );
  const personalByResident = new Map<string, Set<string>>();
  for (const s of allSchedules) {
    if (!personalByResident.has(s.residentId)) personalByResident.set(s.residentId, new Set());
    personalByResident.get(s.residentId)!.add(s.serviceType);
  }

  const out: ServiceSchedule[] = [];
  for (const item of routine) {
    if (!item.time || !item.activity) continue;
    const itemType = inferTypeFromActivity(item.activity);
    for (const r of residents) {
      if (PERSONAL_TYPES.has(itemType) && !personalByResident.get(r.id)?.has(itemType)) continue;
      if (realKeys.has(`${r.id}|${item.time}|${item.activity}`)) continue;
      out.push({
        id: `${VIRTUAL_ID_PREFIX}${r.id}|${item.time}|${item.activity}`,
        residentId: r.id,
        residentName: r.name,
        staffId: null,
        serviceType: itemType,
        dayOfWeek: null,
        plannedStart: item.time,
        plannedEnd: null,
        expectedCount: 1,
        expectedDurationMin: null,
        intervalMin: null,
        toleranceMin: 30,
        severity: 'normal',
        isActive: true,
        note: item.activity,
      });
    }
  }
  return out;
}

/**
 * 가상행에 해당하는 오늘의 제공기록 찾기.
 *
 * 실계획은 scheduleId 로 붙지만 가상행은 서버에 id 가 없다. 그래서 아래 순서로 찾는다.
 *   ① note(일과 내용) + 계획 시각 일치
 *   ② note 일치 (시각 정보가 없는 옛 기록 대비)
 *   ③ 유형 + 계획 시각 일치
 *
 * ⚠ ①이 ②보다 먼저인 이유: 같은 문구의 일과가 하루에 두 번 있으면(예: '체위변경'이
 *   오전·오후에 각각) note 만으로 찾으면 **먼저 나온 기록이 뒤 시각 행에도 완료로 붙는다.**
 *   하지도 않은 일이 완료로 보이는 건 이 프로젝트에서 가장 하면 안 되는 종류의 버그다.
 * ⚠ ③이 필요한 이유: 예외 기록(거부하심 등)은 note 가 예외 문구로 덮여 ①②가 깨진다.
 */
export function findVirtualProvision(
  schedule: ServiceSchedule,
  provisions: ServiceProvision[],
  kstHHMM: (iso: string | null) => string | null,
): ServiceProvision | null {
  const mine = provisions.filter((p) => !p.scheduleId && p.residentId === schedule.residentId);
  const atPlanned = (p: ServiceProvision) =>
    schedule.plannedStart != null && kstHHMM(p.startAt ?? null) === schedule.plannedStart;
  const noteMatches = (p: ServiceProvision) => p.note != null && p.note === schedule.note;

  return (
    mine.find((p) => noteMatches(p) && atPlanned(p))
    ?? mine.find((p) => noteMatches(p) && p.startAt == null)
    ?? mine.find((p) => p.serviceType === schedule.serviceType && atPlanned(p))
    ?? null
  );
}
