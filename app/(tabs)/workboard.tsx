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
import { useServiceProvisions, useCreateServiceProvision, useDeleteServiceProvision, type ServiceProvision } from '@/lib/hooks/useServiceProvisions';
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

/**
 * 상세 시트 선택지 — 큰 버튼 하나로 끝난다(음성 메모는 다음 단계).
 * exception=true 는 '완료'가 아니라 주황 예외로 표시된다.
 * detail 은 서버가 만드는 관찰기록(CareRecord)에 담기는 값 —
 * 용어는 웹 배설관찰·목욕 입력 화면과 동일하게 맞췄다(공단 서식 용어 일관성).
 */
type DetailOption = {
  key: string;
  label: string;
  note: string;
  exception: boolean;
  detail?: Record<string, string>;
};

const COMMON_OPTIONS: DetailOption[] = [
  { key: 'refused', label: '거부하심', note: '어르신이 거부하셔서 제공하지 못함', exception: true },
  { key: 'partial', label: '절반만·일부만', note: '일부만 제공함', exception: true },
  { key: 'issue', label: '이상 발견', note: '제공 중 이상 소견 — 간호 확인 필요', exception: true },
];

const DETAIL_CONFIG: Record<string, { button: string; title: string; options: DetailOption[] }> = {
  defecation: {
    button: '배변·이상',
    title: '무엇을 확인했나요?',
    options: [
      { key: 'stool', label: '대변 있었음', note: '대변 확인', exception: false, detail: { type: '대변', amount: '보통', condition: '정상', skin: '정상' } },
      { key: 'diarrhea', label: '설사', note: '설사 — 간호 확인 필요', exception: true, detail: { type: '대변', condition: '설사', skin: '정상' } },
      { key: 'constipation', label: '변비 · 안 나옴', note: '배변 없음 — 변비 경향', exception: true, detail: { type: '배설없음', condition: '변비' } },
      { key: 'blood', label: '혈변', note: '혈변 — 간호 즉시 확인 필요', exception: true, detail: { type: '대변', condition: '혈변' } },
      { key: 'skin', label: '피부 발적 · 짓무름', note: '피부 발적·짓무름 — 간호 확인 필요', exception: true, detail: { skin: '발적' } },
      COMMON_OPTIONS[0], COMMON_OPTIONS[1],
    ],
  },
  bathing: {
    button: '상세·이상',
    title: '목욕은 어땠나요?',
    options: [
      { key: 'partial_bath', label: '부분목욕만', note: '부분목욕으로 제공', exception: false, detail: { bathType: '부분목욕', assistance: '부분보조', skin: '정상' } },
      { key: 'bed_bath', label: '침상목욕', note: '침상목욕으로 제공', exception: false, detail: { bathType: '침상목욕', assistance: '완전보조', skin: '정상' } },
      { key: 'skin', label: '피부 발적 · 상처 발견', note: '피부 발적·상처 발견 — 간호 확인 필요', exception: true, detail: { bathType: '전신목욕', skin: '발적' } },
      ...COMMON_OPTIONS,
    ],
  },
};

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

const optionsFor = (serviceType: string) => DETAIL_CONFIG[serviceType]?.options ?? COMMON_OPTIONS;
const sheetTitleFor = (serviceType: string) => DETAIL_CONFIG[serviceType]?.title ?? '무슨 일이 있었나요?';
const sheetButtonFor = (serviceType: string) => DETAIL_CONFIG[serviceType]?.button ?? '예외';

/** 예외로 기록된 건인가 — note가 예외 문구와 일치하면 예외(완료와 시각적으로 구분) */
const EXCEPTION_NOTES: string[] = Array.from(new Set(
  [...COMMON_OPTIONS, ...Object.values(DETAIL_CONFIG).flatMap((c) => c.options)]
    .filter((o) => o.exception)
    .map((o) => o.note),
));
const isExceptionRecord = (p: ServiceProvision | null) =>
  !!p?.note && EXCEPTION_NOTES.includes(p.note);

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
  const [highlightRowKey, setHighlightRowKey] = useState<string | null>(null);
  const [highlightBlockStart, setHighlightBlockStart] = useState<string | null>(null);
  const widgetTargetConsumedRef = useRef(false);

  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 300 });
  // 시설 일과표 × 입소자 — 웹 [서비스 시간표]와 같은 목록을 보기 위한 원천 (2026-08-31)
  const residentsQ = useResidents({ status: 'admitted', limit: 200 });
  const facilityQ = useApiQuery<{ scheduleConfig?: { dailyRoutine?: { time: string; activity: string }[] } | null }>(
    ['facility'], '/api/settings/facility', { query: { staleTime: 5 * 60_000 } },
  );
  const { mutate: createProvision, isPending: isSaving , mutateAsync: createProvisionAsync } = useCreateServiceProvision();

  const [exceptionFor, setExceptionFor] = useState<Row | null>(null);
  /** 배변 유무 시트(배변 케어 행을 탭했을 때) — 4버튼 + 건너뛰기 */
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
      if (handle && highlightRowRef.current) {
        highlightRowRef.current.measureLayout(
          handle,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(y - 120, 0), animated: true }),
          () => { /* 레이아웃 측정 실패 — 스크롤 없이 강조만 유지 */ },
        );
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

  const record = (row: Row, note?: string, detail?: Record<string, string>, onDone?: () => void) => {
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

  // ④ 일괄 완료 — 순차 저장(서버 409 경합 방지) + 결과를 1회만 요약 (알림 폭탄 금지)
  const recordRemaining = (block: Block) => {
    const remaining = block.rows.filter((r) => !r.done);
    if (remaining.length === 0) return;
    RNAlert.alert(
      `${block.start} — 남은 ${remaining.length}건 모두 완료`,
      '계획대로 제공한 것으로 기록합니다. 예외가 있는 분은 먼저 [예외]로 기록하세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: `${remaining.length}건 기록`,
          onPress: () => { void recordSequentially(remaining); },
        },
      ],
    );
  };

  const recordSequentially = async (rows: Row[]) => {
    const failures: string[] = [];
    let queuedCount = 0;
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
          queuedCount += 1;
          setQueuedKeys((prev) => new Set(prev).add(r.schedule.id));
          measure.step('workboard:check:queued');
        } else {
          failures.push(`${r.schedule.residentName ?? '(이름 없음)'}: ${e?.message ?? '저장 실패'}`);
        }
      } finally {
        setSavingIds((prev) => { const t = new Set(prev); t.delete(r.schedule.id); return t; });
      }
    }
    void provisionsQ.refetch();
    // 실패를 조용히 삼키지 않는다 — 몇 건이 안 됐는지 한 번에 알려준다
    if (failures.length > 0) {
      RNAlert.alert(
        `${rows.length}건 중 ${failures.length}건 실패${queuedCount > 0 ? ` · ${queuedCount}건 대기 중` : ''}`,
        `${failures.slice(0, 5).join('\n')}${failures.length > 5 ? `\n… 외 ${failures.length - 5}건` : ''}\n\n실패한 분은 목록에 남아 있으니 다시 눌러 주세요.`,
      );
    } else if (queuedCount > 0) {
      RNAlert.alert('대기 중', `전파가 약해 ${queuedCount}건을 대기열에 넣었습니다. 신호가 돌아오면 자동 전송됩니다.`);
    }
  };

  const isLoading = schedulesQ.isLoading || provisionsQ.isLoading || residentsQ.isLoading || facilityQ.isLoading;
  // 일과표·입소자 조회가 실패하면 판이 조용히 비어 보인다 — 빈 판으로 위장하지 않는다(정직성 원칙)
  const isError = schedulesQ.isError || residentsQ.isError || facilityQ.isError;
  const refetchAll = () => {
    void schedulesQ.refetch(); void provisionsQ.refetch();
    void residentsQ.refetch(); void facilityQ.refetch();
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

        {blocks.map((block, i) => {
          const remaining = block.rows.filter((r) => !r.done).length;
          const isCurrent = i === currentIdx;
          return (
            <View
              key={block.start}
              style={[st.block, isCurrent && st.blockCurrent, highlightBlockStart === block.start && st.blockHighlight]}
            >
              <View style={st.blockHeader}>
                <Text style={[st.blockTime, isCurrent && { color: COLOR.primary }]}>{block.start}</Text>
                {isCurrent && <Text style={st.nowChip}>지금</Text>}
                <Text style={st.blockCount}>
                  {block.rows.filter((r) => r.done && !isExceptionRecord(r.done)).length}/{block.rows.length}명 완료
                  {block.rows.some((r) => isExceptionRecord(r.done)) ? ` · 예외 ${block.rows.filter((r) => isExceptionRecord(r.done)).length}` : ''}
                </Text>
              </View>

              {block.rows.map((row) => {
                const saving = savingIds.has(row.schedule.id);
                const done = row.done;
                const isException = isExceptionRecord(done);
                const undoing = !!done && undoingIds.has(done.id);
                // ⑤ 큐 대기 행 — 체크가 아니다(가짜 완료 금지). 재탭도 막는다(중복 전송 방지).
                const isQueued = !done && queuedKeys.has(row.schedule.id);
                const isHighlighted = highlightRowKey === row.schedule.id;
                return (
                  <View
                    key={row.schedule.id}
                    style={st.rowWrap}
                    ref={isHighlighted ? highlightRowRef : undefined}
                  >
                    <TouchableOpacity
                      style={[
                        st.row,
                        done ? (isException ? st.rowException : st.rowDone) : isQueued ? st.rowQueued : null,
                        isHighlighted && st.rowHighlight,
                      ]}
                      disabled={saving || undoing || isQueued}
                      onPress={() => (done
                        ? RNAlert.alert(
                            isException ? '예외로 기록됨' : '이미 기록됨',
                            `${done.staffName ?? '다른 직원'}님이 기록했습니다${done.startAt ? ` (${toKSTTime(done.startAt)})` : ''}.${done.note ? `\n\n${done.note}` : ''}`,
                          )
                        : tapRow(row))}
                    >
                      <MaterialCommunityIcons
                        name={done ? (isException ? 'alert-circle' : 'check-circle') : isQueued ? 'clock-outline' : 'checkbox-blank-circle-outline'}
                        size={30}
                        color={done ? (isException ? COLOR.warning : COLOR.success) : isQueued ? COLOR.textMuted : COLOR.borderStrong}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.rowName, done && !isException && st.rowNameDone]}>
                          {row.schedule.residentName ?? '(이름 없음)'}
                        </Text>
                        <Text style={st.rowService}>
                          {serviceTypeLabel(row.schedule.serviceType)}
                          {row.schedule.expectedCount > 1 ? ` ×${row.schedule.expectedCount}회` : ''}
                          {done?.staffName ? ` · ${done.staffName}` : ''}
                        </Text>
                        {/* ③ 예외는 완료와 구분해 보여준다 — 거부·일부인데 초록 완료로 보이면 안 된다 */}
                        {isException && <Text style={st.exceptionTag}>예외 — {done?.note}</Text>}
                        {/* ⑤ 대기 중은 체크가 아니다 — 회색 라벨로만 알린다 */}
                        {isQueued && <Text style={st.queuedTag}>대기 중 — 전파가 돌아오면 자동 전송됩니다</Text>}
                      </View>
                      {(saving || undoing) && <ActivityIndicator size="small" color={COLOR.primary} />}
                    </TouchableOpacity>
                    {!done && !isQueued ? (
                      <TouchableOpacity
                        style={st.exceptionBtn}
                        onPress={() => {
                          // 실증 측정 — 예외 상세 시트 열기도 "행 상세 열기"로 센다.
                          measure.step('workboard:row');
                          setExceptionFor(row);
                        }}
                      >
                        <Text style={st.exceptionBtnText}>{sheetButtonFor(row.schedule.serviceType)}</Text>
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
              })}

              {remaining > 0 && (
                <TouchableOpacity style={st.allDoneBtn} disabled={isSaving} onPress={() => recordRemaining(block)}>
                  <Text style={st.allDoneText}>남은 {remaining}건 모두 완료</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── 예외 기록 시트 — 큰 버튼 3종, 질문 하나 (원칙 5) ── */}
      <Modal visible={!!exceptionFor} transparent animationType="fade" onRequestClose={() => setExceptionFor(null)}>
        <View style={st.modalBg}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>
              {exceptionFor?.schedule.residentName} — {exceptionFor ? serviceTypeLabel(exceptionFor.schedule.serviceType) : ''}
            </Text>
            <Text style={st.modalSub}>{exceptionFor ? sheetTitleFor(exceptionFor.schedule.serviceType) : '무슨 일이 있었나요?'}</Text>
            {(exceptionFor ? optionsFor(exceptionFor.schedule.serviceType) : COMMON_OPTIONS).map((ex) => (
              <TouchableOpacity
                key={ex.key}
                style={[st.modalOption, !ex.exception && st.modalOptionNormal]}
                onPress={() => {
                  const row = exceptionFor;
                  setExceptionFor(null);
                  if (row) record(row, ex.note, ex.detail);
                }}
              >
                <Text style={[st.modalOptionText, !ex.exception && st.modalOptionTextNormal]}>{ex.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={st.modalCancel} onPress={() => setExceptionFor(null)}>
              <Text style={st.modalCancelText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  modalOptionNormal: { borderColor: COLOR.success },
  modalOptionTextNormal: { color: COLOR.success },
  exceptionBtn: { minWidth: 78, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.caution, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surface },
  exceptionBtnText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.caution },

  allDoneBtn: { marginTop: SPACE.sm, minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center' },
  allDoneText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
  modalTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  modalSub: { fontSize: FONT.label, color: COLOR.textSub },
  modalOption: { minHeight: TOUCH.large, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.bg },
  modalOptionText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
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
