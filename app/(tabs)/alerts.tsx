/**
 * 경보 화면 — H-7(2026-09-23) "오늘이 기본, 지난 것은 주별·입소자별 카운트로".
 *
 * 왜 바뀌었나 (대표 09-23 에뮬레이터 스크린샷)
 *   기존 화면은 9일 전 카드까지 시간순으로 늘어서 있어 "지금 처리할 것"이 목록 어딘가에
 *   묻혔다. 대표 원문: "전체·위급·미처리를 오늘을 디폴트, 주별 히스토리를 개인별 카운트로".
 *
 * 구조
 *   ① 오늘 요약 띠(오늘 경보 N · 미처리 n · 위급 k) — 숫자는 전부 API-2(useAlertSummary) 응답.
 *      이 화면은 그 응답만 읽는다 — 화면에서 다시 세지 않는다(반복 결함 차단 규약).
 *   ② 오늘 이전 미처리(overdueUnhandled) — 기간 필터로 감추지 않는다. 접수 전까지 계속 노출.
 *   ③ 오늘 경보 목록 — 필터(전체/미처리/위급)는 오늘 범위 안에서만 동작.
 *   ④ 지난 경보 — 이번 주/지난 주/그 이전 3버킷(접힘), 펼치면 입소자별 카운트 행 →
 *      탭하면 그 입소자의 경보 목록(같은 버킷 범위)으로 들어간다.
 *
 * 용어(CLAUDE.md 동음이의 해소, 2026-09-16): 화면명 "경보", 배지 "미처리 경보",
 * 접수 버튼 "접수"(구 "확인했습니다"), 홈 메뉴 "알림"→"경보".
 *
 * 목록(오늘 카드·입소자 드릴다운)은 여전히 GET /api/safety/alerts(useAlerts)를 쓴다 —
 * 이 라우트는 날짜·수급자 필터가 없어 limit을 넉넉히(200) 받아 화면에서 "오늘"·"이 수급자"로
 * *표시만* 걸러낸다(카운트·배지가 아니라 어떤 카드를 보여줄지 고르는 것 — ④ 규약과 무관).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, findNodeHandle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useLocalSearchParams } from 'expo-router';
import {
  useAlerts, useAcknowledgeAlert, useAlertSummary, normalizeOverdueItem,
  type AlertItem, type AlertSeverity,
} from '@/lib/hooks/useAlerts';
import { toKSTDate, getKSTToday } from '@/lib/utils/date';
import EmergencyAlertModal from '@/components/EmergencyAlertModal';
import { measure } from '@/lib/measure/client';
import { useWidgetEntryMeasure } from '@/lib/widget/useWidgetEntryMeasure';
import { DeepLinkNotice } from '@/components/common/DeepLinkNotice';

type SeverityConfig = { bg: string; border: string; text: string; label: string };
const SEV_CFG: Record<AlertSeverity, SeverityConfig> = {
  Critical: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', label: 'wg' },
  High: { bg: '#FFF7ED', border: '#FDBA74', text: '#EA580C', label: 'nf' },
  Medium: { bg: '#FFFBEB', border: '#FCD34D', text: '#D97706', label: 'ef' },
  Low: { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A', label: 'ld' },
};
// P1 크래시 수정(2026-09-23 PD 실측) — "Cannot read property 'bg' of undefined".
// 원인은 overdueUnhandled.items가 AlertItem과 다른 계약(level만 있고 severity 없음)인데
// 그대로 SEV_CFG[item.severity]를 조회해 undefined가 나온 것(정규화는 아래에서 고쳤다).
// 여기서는 그와 별개로 스타일 맵 조회 자체를 항상 폴백시킨다 — 앞으로 어떤 값이 들어와도
// 절대 크래시하지 않는다(대표 지시 "스타일 맵 조회는 항상 폴백").
const DEFAULT_SEV_CFG: SeverityConfig = { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151', label: 'na' };
const sevCfg = (sev: AlertSeverity | string | undefined | null): SeverityConfig =>
  (sev && SEV_CFG[sev as AlertSeverity]) || DEFAULT_SEV_CFG;

const SEV_LABELS: Record<AlertSeverity, string> = {
  Critical: '위급', High: '높음', Medium: '보통', Low: '낮음',
};
const sevLabel = (sev: AlertSeverity | string | undefined | null): string =>
  (sev && SEV_LABELS[sev as AlertSeverity]) || '알 수 없음';

// P1(2026-07-27): DB alertType 실제 값 기준으로 교체 — 이전 키(FALL_DETECTED 등)는
// IoT 이벤트명이라 어떤 알림에도 매칭되지 않아 라벨이 항상 fallback이었다.
const TYPE_LABELS: Record<string, string> = {
  fall: '낙상 감지',
  sos: 'SOS 호출',
  exit_zone: '구역 이탈',
  vital: '바이탈 이상',
  vital_alert: '바이탈 이상',
  nurse_call: '간호사 호출',
  consumable_low: '소모품 부족',
  care: '케어 알림',
};

function relTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko }); }
  catch { return iso; }
}

/** 순수 달력 문자열 연산(타임존 파싱 없음) — YYYY-MM-DD 문자열끼리만 다룬다. */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 그 날짜가 속한 주의 월요일(YYYY-MM-DD). */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0=일 ... 6=토
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

type FilterTab = 'all' | 'new' | 'critical';
type WeekBucket = 'this' | 'last' | 'older';
const BUCKET_LABEL: Record<WeekBucket, string> = { this: '이번 주', last: '지난 주', older: '그 이전' };

interface CardProps { item: AlertItem; onAck: (id: string) => void; acking: boolean; highlighted?: boolean; }

function AlertCard({ item, onAck, acking, highlighted }: CardProps) {
  const cfg = sevCfg(item.severity);
  const title = TYPE_LABELS[item.type] ?? item.title;
  const isNew = item.status === 'new';
  return (
    <View style={[s.card, { backgroundColor: cfg.bg, borderColor: cfg.border }, highlighted && s.cardHighlight]}>
      <View style={s.row}>
        <View style={[s.badge, { backgroundColor: cfg.text }]}>
          <Text style={s.badgeTxt}>{sevLabel(item.severity)}</Text>
        </View>
        <Text style={s.timeT}>{relTime(item.createdAt)}</Text>
      </View>
      <Text style={s.titleT}>{title}</Text>
      <Text style={s.subT}>{item.residentName}{item.roomName ? ` / ${item.roomName}` : ''}</Text>
      {!!item.description && <Text style={s.descT}>{item.description}</Text>}
      {isNew && (
        // H-7⑤ 용어 정본 — "확인했습니다" → "접수"(경보 접수 버튼은 '접수', 2026-09-16 동음이의 해소)
        <TouchableOpacity style={[s.ackBtn, acking && s.ackBtnOff]} onPress={() => onAck(item.id)} disabled={acking}>
          {acking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.ackTxt}>접수</Text>}
        </TouchableOpacity>
      )}
      {item.status === 'acknowledged' && <Text style={s.doneT}>접수됨</Text>}
      {item.status === 'resolved' && <Text style={[s.doneT, { color: '#16A34A' }]}>해결됨</Text>}
    </View>
  );
}

export default function AlertsScreen() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [emergency, setEmergency] = useState<AlertItem | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const shownRef = useRef(new Set<string>());
  const today = getKSTToday();

  // ── H-7④ 주 버킷 경계(달력 문자열 연산만, 타임존 파싱 없음) ──
  const thisWeekStart = weekStartOf(today);
  const lastWeekStart = addDaysStr(thisWeekStart, -7);
  const lastWeekEnd = addDaysStr(thisWeekStart, -1);
  const olderEnd = addDaysStr(lastWeekStart, -1);
  const bucketRange = useCallback((bucket: WeekBucket): { from: string; to: string } => {
    if (bucket === 'this') return { from: thisWeekStart, to: today };
    if (bucket === 'last') return { from: lastWeekStart, to: lastWeekEnd };
    return { from: '2000-01-01', to: olderEnd };
  }, [thisWeekStart, today, lastWeekStart, lastWeekEnd, olderEnd]);

  const [expandedWeek, setExpandedWeek] = useState<WeekBucket | null>(null);
  const [residentDrill, setResidentDrill] = useState<{ bucket: WeekBucket; residentId: string; residentName: string } | null>(null);

  // 위젯 딥링크 진입(W2 통합) — topcare-worker://alerts?entry=widget(목록 직결) 또는
  // app/alerts/[id].tsx 리다이렉트가 넘긴 id·entry(topcare-worker://alerts/{id}?entry=widget).
  const { id: widgetAlertId, entry: widgetEntry } =
    useLocalSearchParams<{ id?: string; entry?: string }>();
  useWidgetEntryMeasure('alerts-list', widgetEntry);
  const scrollRef = useRef<ScrollView>(null);
  const highlightCardRef = useRef<View>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Q22-10b(2026-09-25) — 처리한 딥링크 id를 기억한다(boolean이면 warm 상태의 두 번째 딥링크를 무시했다).
  const widgetConsumedIdRef = useRef<string | null>(null);
  const widgetTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 딥링크 id가 로드된 목록(오늘·지난 미처리)에 없을 때 상단 인라인 안내 — 자동 제거 없음, [닫기]까지.
  const [widgetNotFound, setWidgetNotFound] = useState(false);
  const targetAlertId = (Array.isArray(widgetAlertId) ? widgetAlertId[0] : widgetAlertId) || null;

  // ── H-7④ 카운트·배지는 이 응답만(화면에서 다시 세지 않는다) ──
  const summaryQ = useAlertSummary({ groupBy: 'week' });
  const expandedRange = expandedWeek ? bucketRange(expandedWeek) : null;
  const residentGroupsQ = useAlertSummary({
    groupBy: 'resident',
    from: expandedRange?.from,
    to: expandedRange?.to,
    enabled: !!expandedRange,
  });

  // ── 카드 목록 소스 — 오늘 표시·입소자 드릴다운 표시(카운트가 아니라 "어떤 카드를 보여줄지") ──
  const { alerts, isLoading, isError, refetch } = useAlerts({ limit: 200 });
  const ackMutation = useAcknowledgeAlert();
  // A-1(2.4.5): isFetching은 useAlerts의 30초 백그라운드 폴링에도 true가 되므로
  // RefreshControl에 직결하지 않는다 — 사용자 당김만 로컬 state로 반영한다.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const onPullRefresh = useCallback(() => {
    setManualRefreshing(true);
    Promise.allSettled([refetch(), summaryQ.refetch()]).finally(() => setManualRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  const isToday = useCallback((iso: string) => toKSTDate(iso) === today, [today]);
  const todaysAlerts = alerts.filter((a) => isToday(a.createdAt));
  const filteredToday = todaysAlerts.filter((a) =>
    filter === 'new' ? a.status === 'new' : filter === 'critical' ? a.severity === 'Critical' : true);

  const drillAlerts = residentDrill
    ? alerts.filter((a) => {
        const range = bucketRange(residentDrill.bucket);
        const d = toKSTDate(a.createdAt);
        return a.residentId === residentDrill.residentId && d >= range.from && d <= range.to;
      })
    : [];

  // 실증 측정 — 알림/경고 상세 진입(ADR-001 §7). 인지 시간 자체는 서버 Alert.createdAt→
  // acknowledgedAt으로 이미 측정되므로 여기선 화면 진입만 남긴다(residentId·성명 없음).
  useEffect(() => {
    measure.navigate('alerts:detail');
  }, []);

  // 위젯에서 특정 알림 id로 들어온 경우 해당 카드로 스크롤·강조(2초). 목록 직결
  // (id 없음)이면 스크롤 없이 위젯 진입 측정만 남는다.
  // Q22-10b(2026-09-25) 수정 — 강조 방식·타이밍(300ms 뒤 스크롤, 2300ms 뒤 해제)은 그대로 두고:
  //   ① 대상 범위 = 화면에 그려지는 목록 전부(오늘 + 지난 미처리). 이전엔 오늘 필터 결과만 봐서
  //      지난 미처리 경보나 오늘 0건일 때는 아무 일도 없었다.
  //   ② 타이머를 ref로 옮겼다. filteredToday는 렌더마다 새 배열이라, 강조(setHighlightId)로 다시
  //      렌더되는 순간 effect cleanup이 스크롤·해제 타이머를 지워 스크롤이 실행되지 않고 강조가
  //      풀리지 않았다(QA22 #6 "경보 목록 착지"의 실체).
  //   ③ 로드된 목록 어디에도 없으면 상단 인라인 안내 1줄(처리됨 또는 기간 밖).
  useEffect(() => () => { widgetTimersRef.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (!targetAlertId || widgetConsumedIdRef.current === targetAlertId) return;
    // 목록·요약(지난 미처리)을 다 읽기 전에는 판정하지 않는다. 목록 조회 실패면 오류 영역이 이미 있다.
    if (isLoading || isError || summaryQ.isLoading) return;
    widgetConsumedIdRef.current = targetAlertId;
    widgetTimersRef.current.forEach(clearTimeout);
    widgetTimersRef.current = [];
    const inToday = todaysAlerts.some((a) => a.id === targetAlertId);
    const inOverdue = (summaryQ.data?.overdueUnhandled?.items ?? []).some((a) => a.id === targetAlertId);
    if (!inToday && !inOverdue) {
      setWidgetNotFound(true);
      return;
    }
    setWidgetNotFound(false);
    // 카드가 실제로 그려지는 상태로 되돌린다 — 입소자 드릴다운 중이거나 필터가 그 카드를 숨기면 해제.
    setResidentDrill(null);
    if (inToday && !filteredToday.some((a) => a.id === targetAlertId)) setFilter('all');
    setHighlightId(targetAlertId);
    widgetTimersRef.current.push(setTimeout(() => {
      const handle = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
      if (handle && highlightCardRef.current) {
        highlightCardRef.current.measureLayout(
          handle,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(y - 120, 0), animated: true }),
          () => { /* 레이아웃 측정 실패 — 스크롤 없이 강조만 유지 */ },
        );
      }
    }, 300));
    widgetTimersRef.current.push(setTimeout(() => setHighlightId(null), 2300));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAlertId, alerts, isLoading, isError, summaryQ.isLoading, summaryQ.data]);

  // 위급 신규(전체 기간, 기간 필터로 감추지 않는다 — 안전 우선) → 즉시 팝업
  useEffect(() => {
    const found = alerts.find(
      (a) => a.severity === 'Critical' && a.status === 'new' && !shownRef.current.has(a.id),
    );
    if (found) { shownRef.current.add(found.id); setEmergency(found); }
  }, [alerts]);

  const handleAck = useCallback(async (id: string) => {
    if (emergency?.id === id) setEmergency(null);
    setAckingId(id);
    try { await ackMutation.mutateAsync(id); } finally { setAckingId(null); }
  }, [ackMutation, emergency]);

  const handleEmergencyAck = useCallback((id: string) => {
    setEmergency(null); void handleAck(id);
  }, [handleAck]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'new', label: '미처리' },
    { key: 'critical', label: '위급' },
  ];

  const today3 = summaryQ.data?.today ?? null;
  const overdue = summaryQ.data?.overdueUnhandled ?? null;
  const weekGroups = summaryQ.data?.groups ?? [];
  const thisWeekGroup = weekGroups.find((g) => g.key === thisWeekStart) ?? null;
  const lastWeekGroup = weekGroups.find((g) => g.key === lastWeekStart) ?? null;
  const olderAgg = weekGroups
    .filter((g) => g.key !== thisWeekStart && g.key !== lastWeekStart)
    .reduce((acc, g) => ({ total: acc.total + g.total, unhandled: acc.unhandled + g.unhandled, urgent: acc.urgent + g.urgent }),
      { total: 0, unhandled: 0, urgent: 0 });
  const bucketAgg: Record<WeekBucket, { total: number; unhandled: number; urgent: number }> = {
    this: thisWeekGroup ?? { total: 0, unhandled: 0, urgent: 0 },
    last: lastWeekGroup ?? { total: 0, unhandled: 0, urgent: 0 },
    older: olderAgg,
  };

  // ── 입소자 드릴다운 — 같은 화면 안에서 뒤로 가기만 있는 하위 화면 ──
  if (residentDrill) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.drillHeader}>
          <TouchableOpacity onPress={() => setResidentDrill(null)} style={s.backBtn}>
            <Text style={s.backBtnTxt}>‹ 뒤로</Text>
          </TouchableOpacity>
          <Text style={s.drillTitle}>{residentDrill.residentName} · {BUCKET_LABEL[residentDrill.bucket]}</Text>
        </View>
        <ScrollView contentContainerStyle={s.list}>
          {drillAlerts.length === 0 && (
            <View style={s.center}><Text style={s.emptyTxt}>이 기간에는 경보가 없습니다</Text></View>
          )}
          {drillAlerts.map((a) => (
            <AlertCard key={a.id} item={a} onAck={handleAck} acking={ackingId === a.id} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <EmergencyAlertModal alert={emergency} onAcknowledge={handleEmergencyAck} />
      <SafeAreaView style={s.container} edges={['bottom']}>
        {/* ① 오늘 요약 띠 — 숫자는 전부 useAlertSummary(API-2) 응답, 화면에서 다시 세지 않는다 */}
        <View style={s.summaryBand}>
          {summaryQ.isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : summaryQ.isError ? (
            <Text style={s.summaryErr}>오늘 요약을 불러오지 못했습니다</Text>
          ) : (
            <Text style={s.summaryTxt}>
              오늘 경보 {today3?.total ?? 0} · 미처리 {today3?.unhandled ?? 0} · 위급 {today3?.urgent ?? 0}
            </Text>
          )}
        </View>

        <View style={s.filterRow}>
          {tabs.map((tab) => (
            <TouchableOpacity key={tab.key} style={[s.ftab, filter === tab.key && s.ftabOn]} onPress={() => setFilter(tab.key)}>
              <Text style={[s.ftabTxt, filter === tab.key && s.ftabTxtOn]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Q22-10b — 위젯에서 연 경보가 로드된 목록에 없을 때 상단 인라인 1줄(자동 제거 없음, [닫기]까지) */}
        {widgetNotFound && (
          <DeepLinkNotice
            message="해당 경보를 목록에서 찾을 수 없습니다(처리됨 또는 기간 밖)"
            onDismiss={() => setWidgetNotFound(false)}
          />
        )}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={onPullRefresh} tintColor="#1A5276" />}
        >
          {/* ② 지난 미처리 — 기간 필터로 감추지 않는다(접수 전까지 계속 노출) */}
          {!!overdue && overdue.count > 0 && (
            <View style={s.overdueBox}>
              <Text style={s.overdueTitle}>지난 미처리 {overdue.count}건</Text>
              {overdue.items.map((a) => {
                // P1(2026-09-23) — 원시 API-2 계약(level만 있음)을 AlertCard 모양으로 정규화한 뒤에만 넘긴다.
                // Q22-10b — 위젯 딥링크 대상이면 오늘 카드와 같은 ref·강조를 단다.
                const isHighlighted = highlightId === a.id;
                return (
                  <View key={a.id} ref={isHighlighted ? highlightCardRef : undefined}>
                    <AlertCard item={normalizeOverdueItem(a)} onAck={handleAck} acking={ackingId === a.id} highlighted={isHighlighted} />
                  </View>
                );
              })}
            </View>
          )}

          {isLoading && (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#1A5276" />
              <Text style={s.centerTxt}>경보 불러오는 중...</Text>
            </View>
          )}
          {isError && !isLoading && (
            <View style={s.center}>
              <Text style={s.errTxt}>경보를 불러오지 못했습니다</Text>
              <TouchableOpacity onPress={() => void refetch()} style={s.retryBtn}>
                <Text style={s.retryTxt}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ③ 오늘 경보 목록 */}
          {!isLoading && !isError && (
            <>
              <Text style={s.sectionTitle}>오늘</Text>
              {filteredToday.length === 0 && (
                <View style={s.center}><Text style={s.emptyTxt}>오늘 경보가 없습니다</Text></View>
              )}
              {filteredToday.map((a) => {
                const isHighlighted = highlightId === a.id;
                return (
                  <View key={a.id} ref={isHighlighted ? highlightCardRef : undefined}>
                    <AlertCard item={a} onAck={handleAck} acking={ackingId === a.id} highlighted={isHighlighted} />
                  </View>
                );
              })}
            </>
          )}

          {/* ④ 지난 경보 — 주 단위 접힘, 펼치면 입소자별 카운트 */}
          {!isLoading && !isError && (
            <View style={s.pastSection}>
              <Text style={s.sectionTitle}>지난 경보</Text>
              {(['this', 'last', 'older'] as WeekBucket[]).map((bucket) => {
                const agg = bucketAgg[bucket];
                const expanded = expandedWeek === bucket;
                if (agg.total === 0 && bucket !== 'this') return null; // 0건 버킷은 접힘 목록에도 안 보인다
                return (
                  <View key={bucket} style={s.weekGroup}>
                    <TouchableOpacity
                      style={s.weekHeader}
                      onPress={() => setExpandedWeek(expanded ? null : bucket)}
                    >
                      <Text style={s.weekLabel}>{BUCKET_LABEL[bucket]}</Text>
                      <Text style={s.weekCount}>
                        경보 {agg.total} · 미처리 {agg.unhandled} · 위급 {agg.urgent}
                      </Text>
                      <Text style={s.weekChevron}>{expanded ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {expanded && (
                      <View style={s.residentList}>
                        {residentGroupsQ.isLoading && <ActivityIndicator size="small" color="#1A5276" />}
                        {residentGroupsQ.isError && <Text style={s.errTxt}>불러오지 못했습니다</Text>}
                        {!residentGroupsQ.isLoading && !residentGroupsQ.isError && (residentGroupsQ.data?.groups.length ?? 0) === 0 && (
                          <Text style={s.emptyTxt}>이 기간에는 경보가 없습니다</Text>
                        )}
                        {residentGroupsQ.data?.groups.map((g) => (
                          <TouchableOpacity
                            key={g.key}
                            style={s.residentRow}
                            onPress={() => setResidentDrill({ bucket, residentId: g.key, residentName: g.label })}
                          >
                            <Text style={s.residentName}>{g.label}</Text>
                            <Text style={s.residentCount}>
                              경보 {g.total} · 미처리 {g.unhandled} · 위급 {g.urgent}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  summaryBand: { backgroundColor: '#1A5276', padding: 14, alignItems: 'center' },
  summaryTxt: { color: '#fff', fontWeight: '700', fontSize: 17 },
  summaryErr: { color: '#FCA5A5', fontWeight: '600', fontSize: 15 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  ftab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  ftabOn: { backgroundColor: '#1A5276' },
  ftabTxt: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  ftabTxtOn: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  centerTxt: { color: '#6B7280', fontSize: 16 },
  errTxt: { color: '#DC2626', fontSize: 17, fontWeight: '600' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1A5276', borderRadius: 8 },
  retryTxt: { color: '#fff', fontWeight: '600' },
  emptyTxt: { color: '#9CA3AF', fontSize: 18 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 8, marginBottom: 4 },
  card: { borderRadius: 12, borderWidth: 1.5, padding: 14, gap: 6 },
  // 위젯 딥링크 진입 강조 — 2초간
  cardHighlight: { borderColor: '#1A5276', borderWidth: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  timeT: { fontSize: 15, color: '#6B7280' },
  titleT: { fontSize: 18, fontWeight: '700', color: '#111827' },
  subT: { fontSize: 16, color: '#6B7280' },
  descT: { fontSize: 16, color: '#6B7280', fontStyle: 'italic' },
  ackBtn: { marginTop: 8, backgroundColor: '#1A5276', borderRadius: 8, padding: 10, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  ackBtnOff: { opacity: 0.6 },
  ackTxt: { color: '#fff', fontWeight: '600', fontSize: 16 },
  doneT: { fontSize: 15, color: '#6B7280', fontWeight: '600', marginTop: 4 },

  // ② 지난 미처리
  overdueBox: { backgroundColor: '#FEF3C7', borderColor: '#FBBF24', borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 10 },
  overdueTitle: { fontSize: 18, fontWeight: '700', color: '#B45309' },

  // ④ 지난 경보 — 주 버킷
  pastSection: { marginTop: 8, gap: 8 },
  weekGroup: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 56 },
  weekLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  weekCount: { flex: 1, fontSize: 14, color: '#6B7280', textAlign: 'right' },
  weekChevron: { fontSize: 14, color: '#9CA3AF' },
  residentList: { borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 8, gap: 4 },
  residentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, minHeight: 44 },
  residentName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  residentCount: { fontSize: 14, color: '#6B7280' },

  // 입소자 드릴다운
  drillHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
  backBtnTxt: { fontSize: 17, color: '#1A5276', fontWeight: '700' },
  drillTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
});
