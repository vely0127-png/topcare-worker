/**
 * 홈 위젯 v1(표시형) 스냅샷 스키마 — 타입 전용 (W1 네이티브 팀, 2026-09-07)
 *
 * 정본: `01_기획_설계/ADR-001_워커앱_홈위젯_표시형_20260907.md` §4-1,
 *       `TopCare_워커앱_위젯_요구사항_측정명세_20260907.md` A2·A3.
 *
 * 이 파일은 타입만 담는다(로직 없음) — RN 쪽 구현은 이미 W2 팀이
 * `lib/widget/snapshot-builder.ts`에 동일한 필드 이름으로 임시 선언해 두고 작업 중이다
 * (그 파일 주석: "schema.ts가 생기면 아래 WidgetSnapshotV1 등 타입을 그쪽 export로
 * 교체할 것"). **이 세션은 snapshot-builder.ts를 수정하지 않는다**(다른 팀 파일,
 * 동시 작업 중 — 스왑은 W2 쪽에서 하는 게 안전하다). `lib/widget/native.ts`는 지금
 * 당장 깨지지 않도록 snapshot-builder.ts의 타입을 그대로 가져다 쓰되, 구조는 여기와
 * 완전히 동일하다(둘 다 ADR §4-1 문구를 그대로 따름).
 *
 * Kotlin 쪽 대응: android/app/src/main/java/kr/topcare/worker/widget/TopCareWidgetProvider.kt
 * (JSONObject로 이 스키마를 그대로 파싱 — 필드 이름을 여기서 바꾸면 그쪽도 같이 바꿔야 한다).
 *
 * ⚠ 개인정보 규칙(ADR §6-1, 명세 A3): `name`은 `displayLevel === 'name'`일 때만
 *   채운다. `roomNo`·`initial`도 `displayLevel === 'count'`일 때는 필드 자체를
 *   만들지 않는다(빈 문자열이 아니라 키 부재) — 위젯이 마스킹을 잊어도 노출 불가.
 */

/** 시설 설정 3단(A3): 건수만 / 호실+이니셜(기본) / 성명. */
export type DisplayLevel = 'count' | 'roomInitial' | 'name';

export interface WidgetAlertRow {
  /** 딥링크용 내부 ID만 — 성명·측정값을 URL에 넣지 않는다(C-8). */
  id: string;
  /** displayLevel === 'count'면 이 필드 자체가 없다. */
  roomNo?: string;
  /** displayLevel === 'count'면 이 필드 자체가 없다. */
  initial?: string;
  /** displayLevel === 'name'일 때만 존재. */
  name?: string;
  /** 화면에 보일 유형 라벨(측정값 없이 사실만 — "혈압 위험"처럼. 진단·예방 표현 금지). */
  kind: string;
  /** 발생 시각(KST 벽시계 ISO, getKSTNowWallClockIso와 동일 규약) — 정렬용, 위젯은 표시에 안 씀. */
  atKst: string;
}

export interface WidgetServiceRow {
  /** 딥링크 topcare-worker://records/{residentId}?scheduleId={scheduleId}에 쓰는 ID. */
  scheduleId: string;
  residentId: string;
  /** displayLevel === 'count'면 이 필드 자체가 없다. */
  roomNo?: string;
  /** displayLevel === 'count'면 이 필드 자체가 없다. */
  initial?: string;
  /** displayLevel === 'name'일 때만 존재. */
  name?: string;
  serviceType: string;
  /** 예정 시각(KST 벽시계 ISO). */
  plannedAtKst: string;
  /** 이전 블록에서 넘어온 미완료(지연 배지, A2) — true일 때만 존재. */
  delayed?: boolean;
}

export interface WidgetSnapshotV1 {
  /** 스냅샷을 만든 시각(KST 벽시계 ISO) — 노화 판정(A5)의 기준. */
  snapshotAtKst: string;
  /** false면 위젯은 "로그인 필요"만 그린다(다른 필드는 무시). */
  loggedIn: boolean;
  displayLevel: DisplayLevel;
  /** 미해결(new·acknowledged) 경고, 발생 시각 내림차순, 최대 3건(A2). */
  alerts: WidgetAlertRow[];
  /** 현재 시간대 블록 미완료(없으면 이전 블록 지연), 예정 시각 오름차순, 최대 3건(A2). */
  services: WidgetServiceRow[];
  serviceCounts: { block: string; done: number; total: number };
  /** 관리자 업무 지시 미완료 — 건수만(A1). */
  directivesPending: number;
  /** 오프라인 큐 미전송 건수 — [앱 열기] 옆 배지(A5). */
  queuePending: number;
}

/** 위젯이 아무것도 표시하지 않을 때(로그아웃 등)의 최소 형태 — clear()가 없는 네이티브
 *  모듈에서는 이 값을 write()해 "로그인 필요" 상태로 대체한다(lib/widget/native.ts). */
export function emptyWidgetSnapshot(nowIso: string): WidgetSnapshotV1 {
  return {
    snapshotAtKst: nowIso,
    loggedIn: false,
    displayLevel: 'roomInitial',
    alerts: [],
    services: [],
    serviceCounts: { block: '', done: 0, total: 0 },
    directivesPending: 0,
    queuePending: 0,
  };
}
