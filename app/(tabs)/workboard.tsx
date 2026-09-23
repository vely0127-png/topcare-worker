/**
 * 공동 작업판 — 워커앱 v2.0 첫 화면 (2026-08-20 UIUX 철학 정본·공동작업판 상세설계 §1)
 *
 * 왜 이 화면이 있나
 *   대표 확인(2026-08-20): 방 배정·담당 선정은 병원식 형식일 뿐, 실제 업무는 2인 이상
 *   공동 수행이 다수다. 개인 담당 목록이 아니라 **근무 중 모두가 같은 판**을 보고,
 *   자기가 한 어르신을 체크한다 — 벽의 화이트보드를 디지털로 옮긴 것.
 *
 * 답하는 질문
 *   "지금 이 시간에 누구에게 무엇을 해야 하지?" / "누가 이미 했지?" / "몇 분 남았지?"
 *
 * 원칙 (UIUX 철학 정본)
 *   ③ 무비콘 디폴트 — 시간표가 센서다: 오늘 요일의 계획 행이 곧 작업판.
 *   ④ 기록은 예외만 — 정상은 행 탭 1회, [남은 N건 모두 완료]는 블록당 1탭.
 *   기록 1건 원칙 — 이미 기록된 행은 기록자 이름을 보여주고 다시 기록하지 않는다.
 *
 * 소스
 *   GET  /api/care/service-schedules?isActive=true  — 계획 (dayOfWeek null=매일)
 *   GET  /api/care/service-provisions?date=오늘     — 이미 된 것 (20초 자동 갱신 = 공동 판 동기화)
 *   POST /api/care/service-provisions               — 체크(제공기록 초안, 서버가 관찰기록 자동 연계)
 *
 * 정직성
 *   - 조회 실패는 빈 판으로 위장하지 않는다(배너+재시도).
 *   - POST 응답 warning(개인계획 없음 등)은 반드시 사용자에게 보여준다.
 *   - 동시 체크 경합은 서버 409로 차단됨(d564e48) + 20초 갱신.
 *
 * 2026-08-24 배설·목욕 상세(라운드 보강) — 웹 사용성 평가 2순위의 현장 쪽 대응
 *   정상은 그대로 **행 탭 1번**(원칙 4). 적을 것이 있을 때만 [배변·이상]/[상세·이상] 시트에서
 *   큰 버튼 하나로 고른다. 고른 값은 제공기록에 붙어 서버가 만드는 관찰기록(CareRecord)에
 *   그대로 담긴다 — **기록을 하나 더 만들지 않는다**(원칙 7). 웹 배설관찰·목욕 목록과 기록지가
 *   같은 값을 읽는다. 임상 판단(설사·혈변·발적)은 사람이 고른 것만 저장하고 추측하지 않는다.
 *
 * 2026-08-23 워커앱 자체 점검 수정 4건 (웹 사용성 평가와 같은 눈으로 검사)
 *   ① 되돌리기 부재 → 내가 기록한 건만 [되돌리기](DELETE). 잘못 눌러도 관리자 전화 불필요.
 *      useDeleteServiceProvision 훅은 있었는데 이 화면이 호출하지 않는 고아 상태였다(웹과 같은 패턴).
 *   ② 기록 시각을 startAt.slice(11,16)으로 찍어 UTC가 보였다(웹 P1-02와 동일 버그) → toKSTTime.
 *   ③ 예외(거부·일부·이상)도 초록 완료로 보였다 → 주황 '예외' 배지로 구분(상태 가시성).
 *   ④ [남은 N건 모두 완료]가 병렬 요청 + 실패마다 알림 폭탄이었다 → 순차 저장 후 결과 1회 요약.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, findNodeHandle
} from 'react-native';
import { Alert as RNAlert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useWidgetEntryMeasure } from '@/lib/widget/useWidgetEntryMeasure';

import { useServiceSchedules, hhmmToMin, type ServiceSchedule } from '@/lib/hooks/useServiceSchedules';
import {
  useServiceProvisions, useCreateServiceProvision, useDeleteServiceProvision,
  useBulkCreateServiceProvisions, type ServiceProvision, type BulkCreateItem,
} from '@/lib/hooks/useServiceProvisions';
import { useResidents } from '@/lib/hooks/useResidents';
import { useApiQuery } from '@/lib/hooks/useApi';
import { useSession } from '@/lib/hooks/useAuth';
import { serviceTypeLabel } from '@/lib/care/service-rules';
import { buildRoutineSchedules, findVirtualProvision, isVirtualSchedule } from '@/lib/care/routine-rows';
import { kstHHMM } from '@/lib/hooks/useTodayTasks';
import { getKSTToday, toKSTTime } from '@/lib/utils/date';
import { QueuedOfflineError, type QueueItem } from '@/lib/queue/offline-queue';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { measure } from '@/lib/measure/client';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';
import ServiceDetailSheet, { type ServiceDetailSheetResult } from '@/components/care/ServiceDetailSheet';
import { composeSelectionNote, isExceptionNote } from '@/lib/data/service-detail-options';
import { UndoToast } from '@/components/common/UndoToast';

/**
 * 서비스 상세 시트(#23, 2026-09-11) — 10종 전부 공용 ServiceDetailSheet 로 통일.
 * 배변·목욕 전용 DETAIL_CONFIG(문구·예외 하드코딩)는 제거하고 lib/data/service-detail-options.ts
 * (내장 사본, 웹 정본과 이름·shape 동일)로 옮겼다 — 문구·예외 판정은 회귀 없이 그대로다.
 * 배변 유무 시트(BOWEL_OPTIONS)는 이 개편과 무관한 별도 1탭 기능이라 손대지 않는다.
 */
/** 배변·목욕만 기존 버튼 문구를 유지(대표 확정 문구) — 그 외는 공용 '상세' */
const DETAIL_BUTTON_LABEL: Record<string, string> = {
  defecation: '배변·이상',
  bathing: '상세·이상',
};
const detailButtonLabelFor = (serviceType: string) => DETAIL_BUTTON_LABEL[serviceType] ?? '상세';

/**
 * 라운드 배변 유무 — 정상 1탭 뒤에 붙는 **1탭 추가** 시트 (2026-09-03 vc9 / QA P2 제안)
 *
 * 왜: 배변 케어를 정상 1탭으로 완료하면 관찰기록의 유형이 '서비스 제공'으로만 남았다.
 *     기저귀를 갈았다는 사실은 남는데 **무엇을 봤는지**가 안 남아, 웹 배설관찰 목록·기록지에서
 *     "기록은 있는데 내용이 없는 줄"이 됐다.
 * 무엇을: 4버튼 중 하나만 탭하면 그 값이 detail.type 으로 붙어 저장된다(기록 1건 원칙 유지 —
 *     기존 예외 시트와 같은 detail 경로. 서버 화이트리스트 키는 type).
 * 강요 금지: [건너뛰기]는 detail 없이 저장 = 기존 동작 그대로. 양·성상·피부는 여기서 묻지 않는다
 *     (안 본 것을 '정상'으로 창작하지 않는다 — 적을 것이 있으면 [배변·이상] 시트로).
 * 용어는 웹 배설 라운드(BulkCareRoundModal marks)와 같은 값을 쓴다.
 */
type BowelOption = { key: string; label: string; type: string };
const BOWEL_OPTIONS: BowelOption[] = [
  { key: 'urine', label: '소변', type: '소변' },
  { key: 'stool', label: '대변', type: '대변' },
  { key: 'both', label: '둘 다', type: '소변+대변' },
  { key: 'none', label: '없음', type: '배설없음' },
];

/** 예외로 기록된 건인가 — note가 예외 문구와 일치하면 예외(완료와 시각적으로 구분) */
const isExceptionRecord = (p: ServiceProvision | null) => isExceptionNote(p?.note);

/**
 * 일괄 완료(H-8④) 대상 판정 — 투약·개인 계획(source assessment) 행은 제외한다.
 * 예외 배지 행은 이미 done!=null 이라 remaining(!r.done) 단계에서 걸러진다(구조상 자동 제외).
 * 판단은 이 함수 1곳에서만 — 화면에서 따로 판정하지 않는다(반복 결함 차단 규약).
 */
const isBulkEligible = (row: Row) =>
  !row.done && row.schedule.serviceType !== 'medication' && row.schedule.source !== 'assessment';

/**
 * 큐 항목(QueueItem) → 작업판 행 키(row.schedule.id) 역산 (2026-09-06 PD 검토 후속 ③).
 * 실계획은 body.scheduleId가 곧 행 키다. 가상행(시설 일과표 파생)은 서버에 id가 없어
 * lib/care/routine-rows.ts의 가상행 id 생성 규약(v|residentId|시각|일과내용)을 그대로
 * body.residentId·startAt·note로 재구성한다. 재구성 불가(형태가 다른 항목)면 null —
 * 호출부가 큐 길이 변화로 보완한다.
 */
function queueItemRowKey(item: QueueItem): string | null {
  if (item.kind !== 'service-provision') return null;
  const body = item.body as Record<string, unknown>;
  if (typeof body.scheduleId === 'string' && body.scheduleId) return body.scheduleId;
  const { residentId, startAt, note } = body;
  if (typeof residentId === 'string' && typeof startAt === 'string' && typeof note === 'string') {
    return `v|${residentId}|${startAt.slice(11, 16)}|${note}`;
  }
  return null;
}

type Row = {
  schedule: ServiceSchedule;
  done: ServiceProvision | null; // 오늘 이 계획 행의 기록 (선착 1건)
};
type Block = { start: string; rows: Row[] };

export default function WorkboardScreen() {
  const session = useSession();
  const staffId = session?.user.staffId ?? null;
  const today = getKSTToday();
  const { mutate: deleteProvision } = useDeleteServiceProvision();
  const [undoingIds, setUndoingIds] = useState<Set<string>>(new Set());
  const todayDow = new Date(`${today}T12:00:00+09:00`).getDay();

  // 위젯 딥링크 진입 (W2 통합) — 서비스 행 탭(records/[residentId] 경유, scheduleId·
  // residentId 전달) 또는 [지금 할 일] 헤더 탭(workboard?block=now&entry=widget 직결,
  // TopCareWidgetProvider.kt 딥링크 규약)으로 들어온 경우 해당 행/블록으로 스크롤·강조한다.
  const { residentId: widgetResidentId, scheduleId: widgetScheduleId, block: widgetBlock, entry: widgetEntry } =
    useLocalSearchParams<{ residentId?: string; scheduleId?: string; block?: string; entry?: string }>();
  useWidgetEntryMeasure('workboard', widgetEntry);
  const scrollRef = useRef<ScrollView>(null);
  const highlightRowRef = useRef<View>(null);
  // H-6(2026-09-23) 결함 수정 — block=now 진입은 rowKey가 없어(특정 행이 아니다) highlightRowRef가
  // 한 번도 채워지지 않아 스크롤이 아예 실행되지 않았다. 블록 컨테이너마다 자체 ref를 두고
  // widgetTarget.rowKey가 없을 때는 이쪽으로 스크롤한다.
  const blockRefs = useRef<Record<string, View | null>>({});
  const [highlightRowKey, setHighlightRowKey] = useState<string | null>(null);
  const [highlightBlockStart, setHighlightBlockStart] = useState<string | null>(null);
  const widgetTargetConsumedRef = useRef(false);
  // H-6 표현 개선 — block=now(또는 entry=widget) 진입 시 현재 블록만 펼치고 나머지는
  // 헤더만 접는다. 일반 진입(홈 탭 클릭)은 항상 전체 펼침(showAllBlocks=true, 기존 동작 그대로).
  // useWidgetEntryMeasure와 같은 배열 방어(라우터가 같은 파라미터를 배열로 줄 수 있음).
  const isWidgetBlockNow = widgetBlock === 'now' || (Array.isArray(widgetBlock) && widgetBlock.includes('now'));
  const isWidgetEntry = widgetEntry === 'widget' || (Array.isArray(widgetEntry) && widgetEntry.includes('widget'));
  const [showAllBlocks, setShowAllBlocks] = useState(() => !(isWidgetBlockNow || isWidgetEntry));

  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 300 });
  // 시설 일과표 × 입소자 — 웹 [서비스 시간표]와 같은 목록을 보기 위한 원천 (2026-08-31)
  const residentsQ = useResidents({ status: 'admitted', limit: 200 });
  const facilityQ = useApiQuery<{ scheduleConfig?: { dailyRoutine?: { time: string; activity: string }[] } | null }>(
    ['facility'], '/api/settings/facility', { query: { staleTime: 5 * 60_000 } },
  );
  const { mutate: createProvision, mutateAsync: createProvisionAsync } = useCreateServiceProvision();
  const { mutateAsync: bulkCreateAsync } = useBulkCreateServiceProvisions();

  // ── H-8(2026-09-23) 일괄 완료 상태 — 블록(block.start) 키로 관리 ──
  // bulkChecked: 낙관 체크(회색) 대상 scheduleId. bulkFailed: bulk 응답 실패로 되돌린 행
  // (빈 원 + 테두리 강조, 재탭으로 개별 재시도 가능). bulkFlow: 헤더 진행("k/N 저장 중")과
  // 5초 되돌리기 토스트가 함께 읽는 진행 상태(phase='countdown'인 동안은 아직 아무 것도
  // 전송되지 않았다 — done은 항상 0, 되돌리기 = 미전송 중단이 그대로 성립한다).
  const [bulkChecked, setBulkChecked] = useState<Record<string, Set<string>>>({});
  const [bulkFailed, setBulkFailed] = useState<Record<string, Set<string>>>({});
  const [bulkFlow, setBulkFlow] = useState<Record<string, { phase: 'countdown' | 'committing'; secondsLeft: number; total: number; excluded: number; done: number }>>({});
  const bulkTimerRef = useRef<{ blockStart: string; timeoutId: ReturnType<typeof setTimeout>; intervalId: ReturnType<typeof setInterval> } | null>(null);

  /** 서비스 상세 시트(#23) — [배변·이상]/[상세·이상]/[상세] 버튼으로 연다(10종 공용) */
  const [detailFor, setDetailFor] = useState<Row | null>(null);
  /** 배변 유무 시트(배변 케어 행을 탭했을 때) — 4버튼 + 건너뛰기 (상세 시트와 무관, 별도 유지) */
  const [bowelFor, setBowelFor] = useState<Row | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  /**
   * 큐에 들어간 행(row.schedule.id) — 체크 대신 "대기 중"으로 렌더하고 재탭을 막는다
   * (2026-09-06 PD 검토 후속 ③, QueuedOfflineError를 받았을 때 record()/recordSequentially()가 추가).
   */
  const [queuedKeys, setQueuedKeys] = useState<Set<string>>(new Set());
  const { pending: queuedPending } = useOfflineQueue();

  // 실증 측정 — 공동 작업판 진입(ADR-001 §7 T1 과업의 2번째 단계, 홈 진입 다음).
  useEffect(() => {
    measure.navigate('workboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 큐에서 사라진 항목(전송 성공 · 409 제거)은 queuedKeys에서 빼고 판을 한 번 새로고침한다.
  // scheduleId(실계획)/재구성한 가상행 키로 매칭한다(queueItemRowKey).
  useEffect(() => {
    if (queuedKeys.size === 0) return;
    const stillQueued = new Set(
      queuedPending.map(queueItemRowKey).filter((k): k is string => !!k),
    );
    const removed = [...queuedKeys].filter((k) => !stillQueued.has(k));
    if (removed.length === 0) return;
    setQueuedKeys((prev) => {
      const next = new Set(prev);
      removed.forEach((k) => next.delete(k));
      return next;
    });
    void provisionsQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedPending]);

  // ── 오늘의 작업판: 계획(오늘 요일+매일) × 기록 매칭 → 시각 블록 ──
  const blocks: Block[] = useMemo(() => {
    const all = schedulesQ.data ?? [];
    const real = all.filter(
      (s) => s.isActive && s.plannedStart && (s.dayOfWeek === null || s.dayOfWeek === todayDow),
    );
    // 시설 일과표 가상행을 실계획 뒤에 붙인다 — 웹 ServiceTodoList 와 같은 규약(정본: lib/care/routine-rows)
    const virtual = buildRoutineSchedules({
      routine: facilityQ.data?.scheduleConfig?.dailyRoutine ?? [],
      residents: (residentsQ.data?.items ?? []).map((r: any) => ({ id: r.id, name: r.name })),
      realSchedules: real,
      allSchedules: all,
    });
    const schedules = [...real, ...virtual];

    const provisions = provisionsQ.data?.items ?? [];
    const byScheduleId = new Map<string, ServiceProvision>();
    for (const p of provisions) {
      if (p.scheduleId && !byScheduleId.has(p.scheduleId)) byScheduleId.set(p.scheduleId, p);
    }
    const byStart = new Map<string, Row[]>();
    for (const s of schedules) {
      const start = s.plannedStart as string;
      // 가상행은 서버에 id 가 없다 — note/시각으로 찾는다
      const done = isVirtualSchedule(s)
        ? findVirtualProvision(s, provisions, kstHHMM)
        : byScheduleId.get(s.id) ?? null;
      const row: Row = { schedule: s, done };
      byStart.set(start, [...(byStart.get(start) ?? []), row]);
    }
    return [...byStart.entries()]
      .sort((a, b) => hhmmToMin(a[0]) - hhmmToMin(b[0]))
      .map(([start, rows]) => ({
        start,
        rows: rows.sort((a, b) => (a.schedule.residentName ?? '').localeCompare(b.schedule.residentName ?? '', 'ko')),
      }));
  }, [schedulesQ.data, provisionsQ.data, residentsQ.data, facilityQ.data, todayDow]);

  // "지금" 블록 = 시작 시각이 지났고 다음 블록은 아직인 것 (없으면 첫 미래 블록)
  const nowMin = (() => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const currentIdx = useMemo(() => {
    let idx = -1;
    blocks.forEach((b, i) => { if (hhmmToMin(b.start) <= nowMin + 30) idx = i; });
    return idx >= 0 ? idx : 0;
  }, [blocks, nowMin]);

  // 위젯 딥링크 매칭 — scheduleId(정확한 행) > residentId(그 입소자의 첫 행) >
  // block==='now'(현재 블록 컨테이너만, 특정 행 없음) 순으로 찾는다.
  const widgetTarget = useMemo(() => {
    if (!widgetScheduleId && !widgetResidentId && !widgetBlock) return null;
    if (widgetScheduleId) {
      for (const b of blocks) {
        const row = b.rows.find((r) => r.schedule.id === widgetScheduleId);
        if (row) return { rowKey: row.schedule.id as string | null, blockStart: b.start };
      }
    }
    if (widgetResidentId) {
      for (const b of blocks) {
        const row = b.rows.find((r) => r.schedule.residentId === widgetResidentId);
        if (row) return { rowKey: row.schedule.id as string | null, blockStart: b.start };
      }
    }
    if (widgetBlock === 'now' && blocks[currentIdx]) {
      return { rowKey: null as string | null, blockStart: blocks[currentIdx].start };
    }
    return null;
  }, [widgetScheduleId, widgetResidentId, widgetBlock, blocks, currentIdx]);

  // 데이터가 도착한 뒤 1회만 스크롤·강조(재조회로 blocks가 새 참조로 바뀌어도 재실행 안 함).
  useEffect(() => {
    if (!widgetTarget || widgetTargetConsumedRef.current || blocks.length === 0) return;
    widgetTargetConsumedRef.current = true;
    setHighlightRowKey(widgetTarget.rowKey);
    setHighlightBlockStart(widgetTarget.blockStart);
    const scrollTimer = setTimeout(() => {
      const handle = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
      if (!handle) return;
      // 특정 행이 있으면(scheduleId·residentId 진입) 기존대로 그 행으로 스크롤한다.
      if (widgetTarget.rowKey && highlightRowRef.current) {
        highlightRowRef.current.measureLayout(
          handle,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(y - 120, 0), animated: true }),
          () => { /* 레이아웃 측정 실패 — 스크롤 없이 강조만 유지 */ },
        );
        return;
      }
      // H-6 결함 수정 — block=now(특정 행 없음)는 블록 컨테이너 ref로 스크롤한다.
      // 레이아웃이 아직 안 잡혔을 수 있어(방금 도착한 데이터) measureLayout 실패 시
      // 한 번 더 시도(레이아웃 완료 후) — 그래도 실패하면 강조만 유지한다(정직하게 실패).
      const blockEl = blockRefs.current[widgetTarget.blockStart];
      if (blockEl) {
        const tryMeasure = (retry: boolean) => {
          blockEl.measureLayout(
            handle,
            (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(y - 24, 0), animated: true }),
            () => { if (retry) setTimeout(() => tryMeasure(false), 250); },
          );
        };
        tryMeasure(true);
      }
    }, 300);
    const clearTimer = setTimeout(() => {
      setHighlightRowKey(null);
      setHighlightBlockStart(null);
    }, 2300);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [widgetTarget, blocks.length]);

  const nowIso = () => {
    const d = new Date(Date.now() + 9 * 3600_000);
    return `${today}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:00+09:00`;
  };
  /** 계획 시각(HH:MM) → 오늘 KST ISO. 가상행 매칭 키다 — 없으면 현재 시각으로 떨어진다. */
  const plannedIso = (hhmm: string | null) => (hhmm ? `${today}T${hhmm}:00+09:00` : nowIso());

  const record = (
    row: Row,
    note?: string,
    detail?: Record<string, string>,
    onDone?: () => void,
    selection?: Record<string, string[]>,
  ) => {
    if (row.done) {
      RNAlert.alert('이미 기록됨', `${row.done.staffName ?? '다른 직원'}님이 이미 기록했습니다.`);
      return;
    }
    setSavingIds((prev) => new Set(prev).add(row.schedule.id));
    // 가상행(시설 일과표 파생)은 서버에 계획 id 가 없다 — scheduleId 대신 일과 내용을 note 로 보낸다.
    // 없는 id 를 보내면 서버가 404/무결성 오류를 내거나, 더 나쁘게는 남의 계획에 붙는다.
    const virtual = isVirtualSchedule(row.schedule);
    createProvision(
      {
        residentId: row.schedule.residentId,
        serviceType: row.schedule.serviceType,
        serviceDate: today,
        // ⚠ 실계획은 scheduleId 로 되찾으므로 '기록한 실제 시각'을 남긴다(기존 동작).
        //   가상행은 되찾을 id 가 없어 (note + 계획 시각)으로 매칭한다 — 그래서 계획 시각을 넣는다.
        //   웹 ServiceTodoList 도 같은 규약이다(H8: 슬롯 판정은 계획 시각 기준).
        //   여기에 실제 시각을 넣으면 체크해도 완료로 안 보인다 — 실제로 밟을 뻔한 함정.
        startAt: virtual ? plannedIso(row.schedule.plannedStart) : nowIso(),
        ...(virtual ? {} : { scheduleId: row.schedule.id }),
        staffId,
        source: 'manual',
        note: note ?? (virtual ? row.schedule.note : null),
        // 관찰 세부 — 서버가 만드는 CareRecord 에 담긴다(기록 1건 원칙 유지)
        ...(detail ? { detail } : {}),
        // 서비스 상세 시트(#23) 선택값 — 서버가 detail 을 조립하는 원천(레거시 detail 과 함께 보냄)
        ...(selection ? { selection } : {}),
      },
      {
        onSuccess: (created) => {
          // 실증 측정 — 체크 성공(서버 200)까지의 stepIndex가 T1 뎁스(ADR-001 §7).
          measure.save('workboard:check', { recordStatus: '작성완료' });
          if (created?.warning) RNAlert.alert('확인 필요', created.warning); // 서버 경고 숨기지 않기
          onDone?.();
        },
        onError: (e) => {
          // 오프라인 큐(2026-09-06 vc11) — 전파가 약해 큐에 들어간 것은 실패가 아니다.
          // 시트를 닫고 대기 중임을 알린다(체크는 이미 로컬에 안전하게 남았다).
          if (e instanceof QueuedOfflineError) {
            setQueuedKeys((prev) => new Set(prev).add(row.schedule.id));
            // 대기열행은 저장(save)이 아니다 — 아직 서버 200을 못 받았으므로 뎁스 집계에서 제외.
            measure.step('workboard:check:queued');
            RNAlert.alert('대기 중', e.message);
            onDone?.();
            return;
          }
          RNAlert.alert('저장 실패', e?.message ?? '네트워크를 확인하세요');
        },
        onSettled: () => {
          setSavingIds((prev) => { const s = new Set(prev); s.delete(row.schedule.id); return s; });
          void provisionsQ.refetch();
        },
      },
    );
  };

  /**
   * 행 탭 = 정상 완료. 배변 케어만 저장 직전에 배변 유무 시트를 한 번 띄운다.
   * (저장 후에 물으면 이미 만들어진 관찰기록의 유형을 고칠 API 가 없다 — 그래서 저장 전에 묻는다)
   */
  const tapRow = (row: Row) => {
    // 실증 측정 — 행 탭(정상 체크 진입). residentId·성명은 담지 않는다(개인정보 0).
    measure.step('workboard:row');
    if (!row.done && row.schedule.serviceType === 'defecation') {
      setBowelFor(row);
      return;
    }
    record(row);
  };

  // ① 되돌리기 (2026-08-23 자체 점검): 잘못 누른 체크를 현장에서 되돌린다.
  //    남의 기록은 지우지 않는다 — 내가 기록한 건만. 서버가 연동 관찰기록도 함께 정리한다.
  const undo = (row: Row) => {
    const done = row.done;
    if (!done) return;
    if (staffId && done.staffId && done.staffId !== staffId) {
      RNAlert.alert('되돌릴 수 없음', `${done.staffName ?? '다른 직원'}님이 기록한 건입니다. 본인이 기록한 것만 되돌릴 수 있습니다.`);
      return;
    }
    RNAlert.alert(
      '기록을 되돌릴까요?',
      `${row.schedule.residentName ?? ''} — ${serviceTypeLabel(row.schedule.serviceType)} 기록을 삭제합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '되돌리기',
          style: 'destructive',
          onPress: () => {
            setUndoingIds((prev) => new Set(prev).add(done.id));
            deleteProvision(
              { id: done.id },
              {
                onError: (e: any) => RNAlert.alert('되돌리기 실패', e?.message ?? '네트워크를 확인하세요'),
                onSettled: () => {
                  setUndoingIds((prev) => { const t = new Set(prev); t.delete(done.id); return t; });
                  void provisionsQ.refetch();
                },
              },
            );
          },
        },
      ],
    );
  };

  // ── H-8(2026-09-23) 일괄 완료 — 낙관 체크 + 5초 되돌리기 토스트 + bulk API 1회 ──
  // 순서: 탭 즉시 낙관 체크(회색) → 5초 카운트다운(취소 가능, 이 동안 전송 없음 — "미전송
  // 중단"이 실제로 성립) → 만료 시 bulk 1회 전송, 실패(네트워크)는 기존 단건 큐 경로로 폴백.
  // 사전 확인 Alert는 없다(대표 09-23 "누르면 바로 체크"), 결과 요약도 Alert 대신 헤더·행
  // 상태로만 보여준다(신규 네이티브 대화상자 금지).
  const clearBulkTimer = () => {
    if (bulkTimerRef.current) {
      clearTimeout(bulkTimerRef.current.timeoutId);
      clearInterval(bulkTimerRef.current.intervalId);
      bulkTimerRef.current = null;
    }
  };

  /** 되돌리기 — 카운트다운 중에만 뜬다. 아직 전송 전이라 그대로 취소하면 된다(H-8③). */
  const cancelBulk = () => {
    const active = bulkTimerRef.current;
    if (!active) return;
    const { blockStart } = active;
    clearBulkTimer();
    setBulkFlow((prev) => { const next = { ...prev }; delete next[blockStart]; return next; });
    setBulkChecked((prev) => { const next = { ...prev }; delete next[blockStart]; return next; });
    measure.step('workboard:bulk:undo');
  };

  /**
   * 순차 저장(오프라인 폴백 전용) — bulk 엔드포인트는 큐 대상이 아니므로(설계 H-8⑤,
   * QueueKind에 없음) 네트워크 자체가 실패하면 기존 단건 큐 경로(postWithQueue, 이미
   * createProvisionAsync가 태운다)로 항목별 폴백한다. blockStart가 있으면 실패 행을
   * bulkFailed로 되돌려 화면에 표시한다(신규 Alert 요약 없음).
   */
  const recordSequentially = async (rows: Row[], blockStart?: string) => {
    const failedIds = new Set<string>();
    for (const r of rows) {
      setSavingIds((prev) => new Set(prev).add(r.schedule.id));
      try {
        const virtual = isVirtualSchedule(r.schedule); // 가상행은 scheduleId 대신 note (record()와 동일 규약)
        await createProvisionAsync({
          residentId: r.schedule.residentId,
          serviceType: r.schedule.serviceType,
          serviceDate: today,
          startAt: virtual ? plannedIso(r.schedule.plannedStart) : nowIso(), // record()와 동일 규약
          ...(virtual ? {} : { scheduleId: r.schedule.id }),
          staffId,
          source: 'manual',
          note: virtual ? r.schedule.note : null,
        });
        // 실증 측정 — 일괄 완료도 체크 성공은 체크 성공이다(같은 체크 동작의 다른 진입 경로).
        measure.save('workboard:check', { recordStatus: '작성완료' });
      } catch (e: any) {
        // 오프라인 큐(2026-09-06 vc11) — 큐에 들어간 것은 실패가 아니다. 실패 목록에 넣지 않는다.
        if (e instanceof QueuedOfflineError) {
          setQueuedKeys((prev) => new Set(prev).add(r.schedule.id));
          measure.step('workboard:check:queued');
        } else {
          failedIds.add(r.schedule.id);
        }
      } finally {
        setSavingIds((prev) => { const t = new Set(prev); t.delete(r.schedule.id); return t; });
        if (blockStart) {
          setBulkFlow((prev) => (prev[blockStart] ? { ...prev, [blockStart]: { ...prev[blockStart], done: prev[blockStart].done + 1 } } : prev));
        }
      }
    }
    void provisionsQ.refetch();
    if (blockStart) {
      setBulkFailed((prev) => ({ ...prev, [blockStart]: failedIds }));
      setBulkChecked((prev) => {
        const cur = prev[blockStart];
        if (!cur) return prev;
        return { ...prev, [blockStart]: new Set([...cur].filter((id) => !failedIds.has(id))) };
      });
    }
  };

  /** 카운트다운 만료 — 실전송(API-1 bulk 1회, 계약: 2.4.4 착수 계약 §API-1). */
  const commitBulk = async (block: Block, eligible: Row[]) => {
    const active = bulkTimerRef.current;
    if (active?.blockStart === block.start) clearInterval(active.intervalId);
    bulkTimerRef.current = null;
    setBulkFlow((prev) => ({ ...prev, [block.start]: { phase: 'committing', secondsLeft: 0, total: eligible.length, excluded: prev[block.start]?.excluded ?? 0, done: 0 } }));
    try {
      const items: BulkCreateItem[] = eligible.map((r) => {
        const virtual = isVirtualSchedule(r.schedule);
        return {
          residentId: r.schedule.residentId,
          serviceType: r.schedule.serviceType,
          serviceDate: today,
          startAt: virtual ? plannedIso(r.schedule.plannedStart) : nowIso(),
          ...(virtual ? {} : { scheduleId: r.schedule.id }),
          staffId: staffId ?? '',
          source: 'manual' as const,
          ...(virtual && r.schedule.note ? { note: r.schedule.note } : {}),
        };
      });
      const res = await bulkCreateAsync({ items });
      const failedIdx = new Map(res.failed.map((f) => [f.index, f]));
      const failedIds = new Set<string>();
      eligible.forEach((r, i) => { if (failedIdx.has(i)) failedIds.add(r.schedule.id); });
      // 실증 측정 — created 건수만큼만 save(H-8⑥, 가짜 성공 계측 금지). duplicates는 이미
      // 존재하던 기록이라 "이번에 만든 것"이 아니므로 세지 않는다.
      res.created.forEach(() => measure.save('workboard:check', { recordStatus: '작성완료' }));
      setBulkFailed((prev) => ({ ...prev, [block.start]: failedIds }));
      setBulkChecked((prev) => {
        const cur = prev[block.start];
        if (!cur) return prev;
        return { ...prev, [block.start]: new Set([...cur].filter((id) => !failedIds.has(id))) };
      });
      setBulkFlow((prev) => ({ ...prev, [block.start]: { phase: 'committing', secondsLeft: 0, total: eligible.length, excluded: prev[block.start]?.excluded ?? 0, done: res.created.length + res.duplicates.length } }));
      void provisionsQ.refetch();
    } catch {
      // bulk 요청 자체가 실패(오프라인·5xx) — 기존 단건 큐 경로로 항목별 폴백(설계 H-8⑤).
      await recordSequentially(eligible, block.start);
    } finally {
      setBulkFlow((prev) => { const next = { ...prev }; delete next[block.start]; return next; });
    }
  };

  /** 블록 헤더 [남은 N건 모두 완료] 탭 — H-8①②③, 확인창 없이 즉시 낙관 체크 + 5초 되돌리기. */
  const startBulkComplete = (block: Block) => {
    const remaining = block.rows.filter((r) => !r.done);
    const eligible = remaining.filter(isBulkEligible);
    if (eligible.length === 0) return;
    clearBulkTimer(); // 단순화 — 한 번에 한 블록만 진행(현장은 순서대로 처리)
    const excludedCount = remaining.length - eligible.length;
    const keys = new Set(eligible.map((r) => r.schedule.id));
    setBulkChecked((prev) => ({ ...prev, [block.start]: keys }));
    setBulkFailed((prev) => ({ ...prev, [block.start]: new Set() }));
    setBulkFlow((prev) => ({ ...prev, [block.start]: { phase: 'countdown', secondsLeft: 5, total: eligible.length, excluded: excludedCount, done: 0 } }));
    const intervalId = setInterval(() => {
      setBulkFlow((prev) => {
        const cur = prev[block.start];
        if (!cur || cur.phase !== 'countdown') return prev;
        return { ...prev, [block.start]: { ...cur, secondsLeft: cur.secondsLeft - 1 } };
      });
    }, 1000);
    const timeoutId = setTimeout(() => { void commitBulk(block, eligible); }, 5000);
    bulkTimerRef.current = { blockStart: block.start, timeoutId, intervalId };
  };

  // 화면을 나가면 타이머를 남기지 않는다(언마운트 후 setState 경고·유령 전송 방지).
  useEffect(() => () => clearBulkTimer(), []);

  const isLoading = schedulesQ.isLoading || provisionsQ.isLoading || residentsQ.isLoading || facilityQ.isLoading;
  // 일과표·입소자 조회가 실패하면 판이 조용히 비어 보인다 — 빈 판으로 위장하지 않는다(정직성 원칙)
  const isError = schedulesQ.isError || residentsQ.isError || facilityQ.isError;
  const refetchAll = () => {
    void schedulesQ.refetch(); void provisionsQ.refetch();
    void residentsQ.refetch(); void facilityQ.refetch();
  };

  // ── H-6(2026-09-23) 이월 구획 — "오늘 블록 중 시작 시각 + 30분 < 지금 이고 실적 없음"
  // (2.4.4 착수 계약: 별도 카운트 API 없음, 기존 두 쿼리에서 파생만 — 화면에서 다시 세지 않는다는
  // 규약의 취지는 "소스 이원화 금지"이므로, 이미 만든 blocks 파생 데이터를 재사용하는 것은 허용).
  // currentIdx 이전 블록만 본다 — 그 시각 블록은 이미 지났고, "지금" 블록은 아래에 그대로 보인다.
  const overdueEntries = useMemo(() => {
    const out: { row: Row; blockStart: string }[] = [];
    for (let i = 0; i < currentIdx; i++) {
      for (const r of blocks[i].rows) {
        if (!r.done) out.push({ row: r, blockStart: blocks[i].start });
      }
    }
    return out;
  }, [blocks, currentIdx]);

  // PD 실측 후속(2026-09-23) — 기록 없는 시설(TC0001)은 이월이 586건까지 쌓여 펼치면
  // "지금" 블록이 화면 밖으로 밀렸다. ① 구획 기본 접힘 ② 펼치면 행을 바로 나열하지 않고
  // 시간대·서비스 그룹으로 먼저 보인다 ③ 그룹 안은 20개+더보기 ④ 일괄 완료 버튼 없음(지난
  // 시각 기록의 일괄 생성 금지 — 정직 원칙, renderRow가 애초에 그 버튼을 만들지 않는다).
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [expandedOverdueGroup, setExpandedOverdueGroup] = useState<string | null>(null);
  const [overdueGroupShowCount, setOverdueGroupShowCount] = useState<Record<string, number>>({});
  const OVERDUE_GROUP_PAGE = 20;

  const overdueGroups = useMemo(() => {
    const byKey = new Map<string, { key: string; blockStart: string; serviceType: string; label: string; entries: { row: Row; blockStart: string }[] }>();
    for (const entry of overdueEntries) {
      const serviceType = entry.row.schedule.serviceType;
      const key = `${entry.blockStart}|${serviceType}`;
      let g = byKey.get(key);
      if (!g) {
        g = { key, blockStart: entry.blockStart, serviceType, label: `${entry.blockStart} ${serviceTypeLabel(serviceType)}`, entries: [] };
        byKey.set(key, g);
      }
      g.entries.push(entry);
    }
    return [...byKey.values()].sort((a, b) => hhmmToMin(a.blockStart) - hhmmToMin(b.blockStart) || a.label.localeCompare(b.label, 'ko'));
  }, [overdueEntries]);

  const nextBlock = blocks[currentIdx + 1] ?? null;
  const minutesToNextBlock = nextBlock ? hhmmToMin(nextBlock.start) - nowMin : null;
  const nowHH = String(Math.floor(nowMin / 60)).padStart(2, '0');
  const nowMM = String(nowMin % 60).padStart(2, '0');

  /** 행 1개 렌더 — 정상 블록·이월 구획이 함께 쓴다(복제 금지, 렌더 로직 1곳). */
  const renderRow = (row: Row, blockStart: string, opts?: { showOriginalTime?: boolean }) => {
    const saving = savingIds.has(row.schedule.id);
    const done = row.done;
    const isException = isExceptionRecord(done);
    const undoing = !!done && undoingIds.has(done.id);
    // ⑤ 큐 대기 행 — 체크가 아니다(가짜 완료 금지). 재탭도 막는다(중복 전송 방지).
    const isQueued = !done && queuedKeys.has(row.schedule.id);
    // H-8②③ — bulk 낙관 체크(회색)·bulk 실패 되돌림(빈 원+테두리 강조)
    const isBulkChecked = !done && !!bulkChecked[blockStart]?.has(row.schedule.id);
    const isBulkFailed = !done && !!bulkFailed[blockStart]?.has(row.schedule.id);
    const isHighlighted = highlightRowKey === row.schedule.id;
    return (
      <View key={row.schedule.id} style={st.rowWrap} ref={isHighlighted ? highlightRowRef : undefined}>
        <TouchableOpacity
          style={[
            st.row,
            done ? (isException ? st.rowException : st.rowDone)
              : isQueued ? st.rowQueued
              : isBulkChecked ? st.rowBulkChecked
              : isBulkFailed ? st.rowBulkFailed
              : null,
            isHighlighted && st.rowHighlight,
          ]}
          disabled={saving || undoing || isQueued || isBulkChecked}
          onPress={() => (done
            ? RNAlert.alert(
                isException ? '예외로 기록됨' : '이미 기록됨',
                `${done.staffName ?? '다른 직원'}님이 기록했습니다${done.startAt ? ` (${toKSTTime(done.startAt)})` : ''}.${done.note ? `\n\n${done.note}` : ''}`,
              )
            : tapRow(row))}
        >
          <MaterialCommunityIcons
            name={done ? (isException ? 'alert-circle' : 'check-circle') : isQueued ? 'clock-outline' : isBulkChecked ? 'check-circle' : 'checkbox-blank-circle-outline'}
            size={30}
            color={done ? (isException ? COLOR.warning : COLOR.success) : isQueued || isBulkChecked ? COLOR.textMuted : isBulkFailed ? COLOR.danger : COLOR.borderStrong}
          />
          <View style={{ flex: 1 }}>
            <Text style={[st.rowName, done && !isException && st.rowNameDone]}>
              {row.schedule.residentName ?? '(이름 없음)'}
            </Text>
            <Text style={st.rowService}>
              {serviceTypeLabel(row.schedule.serviceType)}
              {row.schedule.expectedCount > 1 ? ` ×${row.schedule.expectedCount}회` : ''}
              {done?.staffName ? ` · ${done.staffName}` : ''}
              {opts?.showOriginalTime && row.schedule.plannedStart ? ` · 원래 ${row.schedule.plannedStart}` : ''}
            </Text>
            {/* ③ 예외는 완료와 구분해 보여준다 — 거부·일부인데 초록 완료로 보이면 안 된다 */}
            {isException && <Text style={st.exceptionTag}>예외 — {done?.note}</Text>}
            {/* ⑤ 대기 중은 체크가 아니다 — 회색 라벨로만 알린다 */}
            {isQueued && <Text style={st.queuedTag}>대기 중 — 전파가 돌아오면 자동 전송됩니다</Text>}
            {isBulkFailed && <Text style={st.bulkFailedTag}>일괄 저장 실패 — 다시 눌러 개별 기록하세요</Text>}
          </View>
          {(saving || undoing) && <ActivityIndicator size="small" color={COLOR.primary} />}
        </TouchableOpacity>
        {!done && !isQueued && !isBulkChecked ? (
          <TouchableOpacity
            style={st.exceptionBtn}
            onPress={() => {
              // 실증 측정 — 상세 시트 열기도 "행 상세 열기"로 센다.
              measure.step('workboard:row');
              setDetailFor(row);
            }}
          >
            <Text style={st.exceptionBtnText}>{detailButtonLabelFor(row.schedule.serviceType)}</Text>
          </TouchableOpacity>
        ) : done ? (
          // ① 되돌리기 — 내가 기록한 건만 (남의 기록은 서버 이전에 화면에서 막는다)
          (!staffId || !done.staffId || done.staffId === staffId) && (
            <TouchableOpacity style={st.undoBtn} disabled={undoing} onPress={() => undo(row)}>
              <Text style={st.undoBtnText}>되돌리기</Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={!!provisionsQ.isRefetching} onRefresh={refetchAll} />}
      >
        {isError && (
          <View style={st.errorBanner}>
            <Text style={st.errorText}>작업판을 불러오지 못했습니다 — 아래 내용은 실제가 아닐 수 있습니다.</Text>
            <TouchableOpacity style={st.retryBtn} onPress={refetchAll}>
              <Text style={st.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && (
          <View style={st.center}><ActivityIndicator size="large" color={COLOR.primary} /></View>
        )}

        {!isLoading && !isError && blocks.length === 0 && (
          <View style={st.center}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={COLOR.textFaint} />
            <Text style={st.emptyText}>오늘 계획된 서비스가 없습니다</Text>
            <Text style={st.emptyHint}>웹 관리자에서 [기본 설정 시간표]에 일과를 저장하거나, 기초평가 {'>'} 서비스 적용·목욕 배정을 하면 여기에 나타납니다</Text>
          </View>
        )}

        {/* H-6 표현 개선 — 위젯 진입(block=now/entry=widget)일 때만: "지금" 요약 + 전체 보기 링크 */}
        {!isLoading && !isError && blocks.length > 0 && !showAllBlocks && (
          <View style={st.nowSummary}>
            <Text style={st.nowSummaryText}>
              지금 {nowHH}:{nowMM} 기준 · <Text style={st.nowSummaryLink} onPress={() => setShowAllBlocks(true)}>전체 보기</Text>
            </Text>
            <Text style={st.nowSummarySub}>
              {nextBlock
                ? `다음 시간대(${nextBlock.start})까지 ${Math.max(minutesToNextBlock ?? 0, 0)}분`
                : '오늘의 마지막 시간대입니다'}
            </Text>
          </View>
        )}

        {/* H-6 대표 추가(09-23) — 이월 구획. 0건이면 구획 자체를 렌더하지 않는다(가짜 "모두 완료" 금지).
            PD 실측 후속(09-23) — TC0001처럼 기록 없는 시설은 수백 건이 쌓여 펼치면 "지금" 블록이
            화면 밖으로 밀린다 → 기본 접힘(헤더 1줄) + 펼쳐도 행이 아니라 시간대·서비스 그룹 먼저.
            일괄 완료 버튼은 두지 않는다(지난 시각 기록의 일괄 생성 금지 — renderRow는 그 버튼을
            만들지 않으므로 구조상 없음). */}
        {!isLoading && !isError && overdueEntries.length > 0 && (
          <View style={st.overdueBox}>
            <TouchableOpacity
              style={st.overdueHeaderRow}
              onPress={() => setOverdueExpanded((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={st.overdueTitle}>지난 시간대 미완료 {overdueEntries.length}건</Text>
              <Text style={st.overdueChevron}>{overdueExpanded ? '▲' : '▸'}</Text>
            </TouchableOpacity>
            {overdueExpanded && (
              <View style={st.overdueGroupList}>
                {overdueGroups.map((g) => {
                  const groupExpanded = expandedOverdueGroup === g.key;
                  const showCount = overdueGroupShowCount[g.key] ?? OVERDUE_GROUP_PAGE;
                  const visible = g.entries.slice(0, showCount);
                  return (
                    <View key={g.key} style={st.overdueGroup}>
                      <TouchableOpacity
                        style={st.overdueGroupHeader}
                        onPress={() => setExpandedOverdueGroup(groupExpanded ? null : g.key)}
                      >
                        <Text style={st.overdueGroupLabel}>{g.label} {g.entries.length}건</Text>
                        <Text style={st.overdueChevron}>{groupExpanded ? '▲' : '▸'}</Text>
                      </TouchableOpacity>
                      {groupExpanded && (
                        <View style={st.overdueGroupRows}>
                          {visible.map(({ row, blockStart }) => renderRow(row, blockStart, { showOriginalTime: true }))}
                          {g.entries.length > showCount && (
                            <TouchableOpacity
                              style={st.overdueMoreBtn}
                              onPress={() => setOverdueGroupShowCount((prev) => ({ ...prev, [g.key]: showCount + OVERDUE_GROUP_PAGE }))}
                            >
                              <Text style={st.overdueMoreText}>더 보기 ({g.entries.length - showCount}건 남음)</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/*
          PD 실측 후속(2026-09-23) — showAllBlocks=false(위젯 focus 모드)일 때 blocks 전체를
          그대로 돌리면 지난 블록들이 "헤더만 접힘"으로도 하나하나 쌓여 현재 블록이 화면 밖으로
          밀린다(586건 이월 사고의 다른 얼굴). 지난 블록의 내용은 이미 위 이월 구획이 전부
          대표하므로, focus 모드에서는 **현재 블록부터** 렌더한다 — "이월 헤더 접힘 + 현재 블록
          헤더"가 항상 첫 화면 안에 오도록(요구사항 ⑤). 전체 보기(showAllBlocks=true)는 기존대로
          모든 블록(과거 포함)을 처음부터 보여준다.
        */}
        {(showAllBlocks ? blocks : blocks.slice(currentIdx)).map((block) => {
          const isCurrent = block.start === blocks[currentIdx]?.start;
          const isExpanded = showAllBlocks || isCurrent;
          const doneCount = block.rows.filter((r) => r.done && !isExceptionRecord(r.done)).length;
          const exceptionCount = block.rows.filter((r) => isExceptionRecord(r.done)).length;
          const remainingRows = block.rows.filter((r) => !r.done);
          const eligibleRows = remainingRows.filter(isBulkEligible);
          const excludedCount = remainingRows.length - eligibleRows.length;
          const flow = bulkFlow[block.start];
          const showExcludedTag = (flow ? flow.excluded : excludedCount) > 0;
          return (
            <View
              key={block.start}
              ref={(el) => { blockRefs.current[block.start] = el; }}
              style={[st.block, isCurrent && st.blockCurrent, highlightBlockStart === block.start && st.blockHighlight]}
            >
              <View style={st.blockHeader}>
                <Text style={[st.blockTime, isCurrent && { color: COLOR.primary }]}>{block.start}</Text>
                {isCurrent && <Text style={st.nowChip}>지금</Text>}
                <Text style={st.blockCount}>
                  {doneCount}/{block.rows.length}명 완료
                  {exceptionCount > 0 ? ` · 예외 ${exceptionCount}` : ''}
                </Text>
              </View>

              {/* H-8① — [남은 N건 모두 완료]를 블록 헤더로 이동(93행 스크롤 없이 바로 보임).
                  PD 실측 후속 — "제외 n건" 라벨은 대상 0건(투약·개인계획만 남은 블록)이어도
                  버튼과 별개로 항상 보인다(이전엔 버튼과 함께 숨어 "제외됐는지 0건인지" 구분이 안 됐다). */}
              {isExpanded && (flow || eligibleRows.length > 0 || showExcludedTag) && (
                <View style={st.headerActionRow}>
                  {(flow || eligibleRows.length > 0) && (
                    <TouchableOpacity
                      style={st.allDoneBtn}
                      disabled={!!flow}
                      onPress={() => startBulkComplete(block)}
                    >
                      {flow ? (
                        <View style={st.allDoneBtnRow}>
                          <ActivityIndicator size="small" color={COLOR.onPrimary} />
                          <Text style={st.allDoneText}>{flow.done}/{flow.total} 저장 중</Text>
                        </View>
                      ) : (
                        <Text style={st.allDoneText}>남은 {eligibleRows.length}건 모두 완료</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {showExcludedTag && (
                    <Text style={st.excludedTag}>제외 {flow ? flow.excluded : excludedCount}건(예외/투약/개인계획)</Text>
                  )}
                </View>
              )}

              {isExpanded && block.rows.map((row) => renderRow(row, block.start))}
            </View>
          );
        })}
      </ScrollView>

      {/* ── 서비스 상세 시트(#23) — 그룹별 칩 선택 + 비고, 10종 공용 ── */}
      <ServiceDetailSheet
        visible={!!detailFor}
        serviceType={detailFor?.schedule.serviceType ?? null}
        title={detailFor ? `${detailFor.schedule.residentName ?? ''} — ${serviceTypeLabel(detailFor.schedule.serviceType)}` : ''}
        onCancel={() => setDetailFor(null)}
        onSave={(result: ServiceDetailSheetResult) => {
          const row = detailFor;
          setDetailFor(null);
          if (!row) return;
          const { note, detail } = composeSelectionNote(row.schedule.serviceType, result.selection, result.note);
          // 숫자 입력 그룹(배설 측정량 ml 등)은 detail에 문자열로 실어 보낸다 — 서버(service-provisions pickDetail)가 정수로 저장
          const numInputs = Object.fromEntries(Object.entries(result.inputs ?? {}).map(([k, v]) => [k, String(v)]));
          const merged = Object.keys(numInputs).length ? { ...(detail ?? {}), ...numInputs } : detail;
          record(row, note ?? undefined, merged, undefined, result.selection);
        }}
      />

      {/* ── 배변 유무 시트 — 큰 카드 4개, 탭 즉시 닫히고 저장 (2026-09-03 vc9) ── */}
      <Modal visible={!!bowelFor} transparent animationType="fade" onRequestClose={() => setBowelFor(null)}>
        <View style={st.modalBg}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>{bowelFor?.schedule.residentName} — 배변 케어</Text>
            <Text style={st.modalSub}>무엇이 있었나요?</Text>
            <View style={st.bowelGrid}>
              {BOWEL_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={st.bowelCard}
                  onPress={() => {
                    const row = bowelFor;
                    setBowelFor(null);
                    // note 는 넘기지 않는다 — 가상행(시설 일과표 파생)은 note 로 되찾으므로
                    // record() 안의 기본값(row.schedule.note)이 유지되어야 매칭이 깨지지 않는다.
                    if (row) record(row, undefined, { type: o.type });
                  }}
                >
                  <Text style={st.bowelCardText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* 강요 금지 — 건너뛰면 detail 없이 저장(기존 동작 그대로) */}
            <TouchableOpacity
              style={st.bowelSkip}
              onPress={() => {
                const row = bowelFor;
                setBowelFor(null);
                if (row) record(row);
              }}
            >
              <Text style={st.bowelSkipText}>건너뛰기 — 그냥 완료로 기록</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.modalCancel} onPress={() => setBowelFor(null)}>
              <Text style={st.modalCancelText}>닫기 (기록하지 않음)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* H-8③ — 5초 되돌리기 토스트. 카운트다운 중(phase='countdown')에만 뜬다 —
          이 동안은 실제 전송이 없어 되돌리기 = 미전송 중단이 그대로 성립한다. */}
      {(() => {
        const active = Object.entries(bulkFlow).find(([, f]) => f.phase === 'countdown');
        if (!active) return null;
        const [, f] = active;
        return (
          <UndoToast
            visible
            message={`${f.total}건 기록 중`}
            secondsLeft={f.secondsLeft}
            onUndo={cancelBulk}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLOR.bg },
  scroll: { padding: SPACE.lg, paddingBottom: SPACE.xxl },
  center: { alignItems: 'center', paddingVertical: SPACE.xxl * 2, gap: SPACE.md },
  emptyText: { fontSize: FONT.body, fontWeight: '600', color: COLOR.textSub },
  emptyHint: { fontSize: FONT.caption, color: COLOR.textMuted, textAlign: 'center', paddingHorizontal: SPACE.xl },

  errorBanner: { backgroundColor: COLOR.dangerBg, borderRadius: RADIUS.md, padding: SPACE.lg, marginBottom: SPACE.lg, gap: SPACE.sm },
  errorText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },
  retryBtn: { backgroundColor: COLOR.danger, borderRadius: RADIUS.sm, minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },

  block: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: COLOR.border },
  blockCurrent: { borderColor: COLOR.primary, borderWidth: 2 },
  // 위젯 딥링크 진입 강조 — 2초간(하이라이트 해제는 화면 로직에서 타이머로 처리)
  blockHighlight: { borderColor: COLOR.primary, borderWidth: 2, backgroundColor: '#EAF2F8' },
  rowHighlight: { borderColor: COLOR.primary, borderWidth: 2, backgroundColor: '#EAF2F8' },
  rowException: { backgroundColor: COLOR.warningBg },
  exceptionTag: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '600', marginTop: 2 },
  // ⑤ 대기 중(큐) — 완료(초록)·예외(주황)와 구분되는 회색 스타일 관례(itemCard와 동일 규약)
  rowQueued: { backgroundColor: COLOR.bg, borderColor: COLOR.border },
  queuedTag: { fontSize: FONT.caption, color: COLOR.textMuted, fontWeight: '600', marginTop: 2 },
  undoBtn: { minHeight: TOUCH.min, minWidth: 96, paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'center' },
  undoBtnText: { fontSize: FONT.label, color: COLOR.textSub, fontWeight: '700' },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  blockTime: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  nowChip: { fontSize: FONT.caption, fontWeight: '700', color: '#fff', backgroundColor: COLOR.primary, paddingHorizontal: SPACE.sm, paddingVertical: 2, borderRadius: RADIUS.sm, overflow: 'hidden' },
  blockCount: { marginLeft: 'auto', fontSize: FONT.label, color: COLOR.textMuted, fontWeight: '600' },

  rowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: SPACE.sm, marginBottom: SPACE.sm },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH.min, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface },
  rowDone: { backgroundColor: COLOR.successBg, borderColor: COLOR.successBg },
  rowName: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  rowNameDone: { color: COLOR.textSub },
  rowService: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  exceptionBtn: { minWidth: 78, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.caution, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surface },
  exceptionBtnText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.caution },

  // H-8② — bulk 낙관 체크(회색, 완료·큐 대기와 다른 색) / H-8② bulk 실패 되돌림(빈 원 + 테두리 강조)
  rowBulkChecked: { backgroundColor: COLOR.bg, borderColor: COLOR.borderStrong },
  rowBulkFailed: { backgroundColor: COLOR.surface, borderColor: COLOR.danger, borderWidth: 2 },
  bulkFailedTag: { fontSize: FONT.caption, color: COLOR.danger, fontWeight: '600', marginTop: 2 },

  // H-8① — [남은 N건 모두 완료]를 블록 헤더 영역으로 이동
  headerActionRow: { gap: SPACE.xs, marginBottom: SPACE.md },
  allDoneBtn: { minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.md },
  allDoneBtnRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  allDoneText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '700' },
  excludedTag: { fontSize: FONT.caption, color: COLOR.textMuted, fontWeight: '600', textAlign: 'center' },

  // H-6 — "지금 HH:MM 기준 · 전체 보기" 요약 줄(위젯 진입 전용)
  nowSummary: { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: COLOR.border },
  nowSummaryText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  nowSummaryLink: { color: COLOR.primary, fontWeight: '700', textDecorationLine: 'underline' },
  nowSummarySub: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 4 },

  // H-6 — 이월 구획("지난 시간대 미완료 N건")
  overdueBox: { backgroundColor: COLOR.warningBg, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: COLOR.caution },
  overdueTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.caution },
  // PD 실측 후속(09-23) — 기본 접힘 헤더 + 펼쳤을 때 시간대·서비스 그룹
  overdueHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH.min },
  overdueChevron: { fontSize: FONT.body, fontWeight: '700', color: COLOR.caution },
  overdueGroupList: { marginTop: SPACE.md, gap: SPACE.sm },
  overdueGroup: { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden' },
  overdueGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH.min, paddingHorizontal: SPACE.md },
  overdueGroupLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.text },
  overdueGroupRows: { borderTopWidth: 1, borderTopColor: COLOR.border, padding: SPACE.sm, gap: SPACE.xs },
  overdueMoreBtn: { minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  overdueMoreText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.primary },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
  modalTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  modalSub: { fontSize: FONT.label, color: COLOR.textSub },
  modalCancel: { minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: FONT.body, color: COLOR.textMuted, fontWeight: '600' },

  // 배변 유무 시트 — 2×2 큰 카드
  bowelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  bowelCard: {
    flexGrow: 1, flexBasis: '45%', minHeight: TOUCH.menu,
    borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLOR.primary,
    backgroundColor: COLOR.surface, alignItems: 'center', justifyContent: 'center',
  },
  bowelCardText: { fontSize: FONT.heading, fontWeight: '800', color: COLOR.primary },
  bowelSkip: {
    minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.bg,
  },
  bowelSkipText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub },
});
