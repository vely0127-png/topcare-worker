/**
 * 관찰 기록 화면 — GET/POST /api/care/records?recordType=observation
 *
 * 2026-09-01 개편: 웹과 동일한 4도메인 단어카드 체계로 교체
 * (신체활동지원/인지관리 및 의사소통/건강 및 간호관리/기능회복훈련).
 *
 * 관찰3단 §2~§4 (2026-09-15, 워커앱 반영, 설계 정본
 * `01_기획_설계/TopCare_관찰일지_상태반응_3단_설계_20260914.md`):
 *   카드는 두 종류 — 행위 카드(kind:'action', 기존 동작 그대로: 탭 1회 → autoText 선택/해제)와
 *   상태·반응 카드(kind:'state', 탭 → 하단 시트에서 3단(양호/평소와 같음/주의) + '주의'면 사유).
 *   카드·사유 정본은 서버 GET /api/care/observation-cards가 정본(useObservationCards 훅) —
 *   실패 시 내장 사본(lib/data/observation-buttons.ts)으로 폴백하고 화면에 정직하게 알린다.
 *   저장은 content v2({v:2, items, note, generated, buttons})로 JSON 직렬화해서 보낸다
 *   (POST /api/care/records, recordType 'observation') — severity는 서버가 산출.
 *
 * 단어카드 학습 루프: 저장한 직접 입력분이 충분히 길면(15자 이상)
 * `POST /api/care/observation-cards/suggest` 로 재사용 후보를 물어보고,
 * 사람이 탭해야만 `POST /api/care/observation-cards` 로 실제 등록된다
 * (자동 추가 금지). 제안·등록은 부가 기능 — 실패해도 기록 저장 결과에는
 * 영향을 주지 않는다.
 */
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { Alert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResidents } from '@/lib/hooks/useResidents';
import { useCareRecords, useCareRecordCreate } from '@/lib/hooks/useCareRecords';
import {
  useObservationCards, useObservationCardCreate, useObservationCardSuggest,
  type ObservationCardSuggestion, type CustomObservationCard,
} from '@/lib/hooks/useObservationCards';
import { useSession } from '@/lib/hooks/useAuth';
import { getKSTToday, getKSTNowWallClockIso } from '@/lib/utils/date';
import { QueuedOfflineError } from '@/lib/queue/offline-queue';
import { measure } from '@/lib/measure/client';
import {
  OBSERVATION_DOMAINS,
  type ObservationDomain, type ObservationButton, type ObservationOutcome,
} from '@/lib/data/observation-buttons';
import { buildObservationSentence } from '@/lib/care/observation-sentence';
import { parseRecordContent, observationWarningSummary } from '@/lib/care/record-content';
import ObservationOutcomeSheet, {
  type ObservationOutcomeSheetCard, type ObservationOutcomeSelection,
} from '@/components/care/ObservationOutcomeSheet';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

/** 직접 입력분이 이 길이 이상이어야 단어카드 제안을 요청한다 (웹 suggest 라우트와 동일 기준) */
const SUGGEST_MIN_LEN = 15;

// 관찰3단 §1-4: '일상 양호/특이 없음' 카드 — 다른 state 카드의 '주의'와 동시 선택 불가
const NO_ISSUE_CARD_KEY = 'b35';

interface SelectedItem {
  key: string;
  domain: ObservationDomain;
  autoText: string;
}

// 관찰3단 §4: 카드 1개의 kind 무관 통일 조회 형태(내장 버튼 + 커스텀 카드를 같은 모양으로 다룸)
interface CardMeta {
  rawId: number | string;
  buttonName: string;
  icon?: string;
  kind: 'action' | 'state';
  /** action 카드의 완료 문장(기존 autoText) — state 카드는 outcomes를 대신 쓴다 */
  autoText: string;
  outcomes?: ObservationOutcomeSheetCard['outcomes'];
  reasons?: string[];
  allowFreeReason?: boolean;
  singleOutcome?: 'positive';
}

export default function ObservationScreen() {
  const session = useSession();
  const { data: residentsData, isLoading: loadingResidents } = useResidents({ status: '입소 중' });
  const {
    data: historyData,
    isLoading: loadingHistory,
    isRefetching,
    refetch,
  } = useCareRecords({ recordType: 'observation', limit: 30 });
  const { mutate: createRecord, isPending: isSaving } = useCareRecordCreate();

  // 관찰3단 §2/§6: 내장(builtin, 서버 정본) + 커스텀(cards) 통합 조회 — 실패해도 화면은 죽지 않는다
  // (내장 사본 폴백 + "시설 설정 미반영" 정직 표시).
  const { builtin, cards: customCards, isError: cardsError, fallbackNotice } = useObservationCards();
  const { mutate: createCard } = useObservationCardCreate();
  const { mutate: suggestCards } = useObservationCardSuggest();

  const residents = residentsData?.items ?? [];
  const history = historyData?.items ?? [];

  const [selectedResident, setSelectedResident] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<ObservationDomain>(OBSERVATION_DOMAINS[0]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  // 관찰3단 §3/§4: kind:'state' 카드가 selected에 들어있을 때만 이 맵에 항목이 생긴다
  const [stateSelections, setStateSelections] = useState<Record<string, ObservationOutcomeSelection>>({});
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // 단어카드 학습 루프 상태
  const [suggestions, setSuggestions] = useState<ObservationCardSuggestion[]>([]);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [suggestionErrors, setSuggestionErrors] = useState<Record<string, string>>({});
  const [learnedNotice, setLearnedNotice] = useState<string | null>(null);

  const resident = residents.find(r => r.id === selectedResident);
  const selectedKeys = useMemo(() => new Set(selected.map(s => s.key)), [selected]);

  // 관찰3단 §4: 내장(builtin) + 커스텀 카드를 kind 무관 통일 조회 형태로 합친다
  const cardMetaByKey = useMemo(() => {
    const map = new Map<string, CardMeta>();
    for (const btn of builtin) {
      map.set(`b${btn.id}`, {
        rawId: btn.id, buttonName: btn.buttonName, icon: btn.icon,
        kind: btn.kind === 'state' ? 'state' : 'action',
        autoText: btn.autoText,
        outcomes: btn.outcomes, reasons: btn.reasons, allowFreeReason: btn.allowFreeReason,
        singleOutcome: btn.singleOutcome,
      });
    }
    for (const c of customCards as CustomObservationCard[]) {
      map.set(`c${c.id}`, {
        rawId: c.id, buttonName: c.buttonName, icon: c.icon,
        kind: c.kind === 'state' ? 'state' : 'action',
        autoText: c.autoText,
        outcomes: c.outcomes, reasons: c.reasons, allowFreeReason: c.allowFreeReason,
      });
    }
    return map;
  }, [builtin, customCards]);

  // 도메인 탭 배지 — 이번 기록에서 각 도메인에서 몇 개 골랐는지
  const domainCounts = useMemo(() => {
    const m: Partial<Record<ObservationDomain, number>> = {};
    for (const s of selected) m[s.domain] = (m[s.domain] ?? 0) + 1;
    return m;
  }, [selected]);

  // 관찰3단 §1-4: '일상 양호/특이 없음' 선택 여부 + 다른 state 카드의 '주의' 선택 여부(상호 배타)
  const noIssueSelected = selectedKeys.has(NO_ISSUE_CARD_KEY);
  const hasOtherNegative = Object.entries(stateSelections).some(
    ([key, sel]) => key !== NO_ISSUE_CARD_KEY && sel.outcome === 'negative',
  );

  // action 카드 — 기존 동작 그대로(탭 1회로 선택/해제)
  const toggleActionButton = (key: string, domain: ObservationDomain, autoText: string) => {
    setSelected(prev => (
      prev.some(p => p.key === key)
        ? prev.filter(p => p.key !== key)
        : [...prev, { key, domain, autoText }]
    ));
  };

  // state 카드 — 탭하면 하단 시트를 연다(신규 선택이면 상호배타 가드 먼저 확인)
  const openStateSheet = (key: string) => {
    const meta = cardMetaByKey.get(key);
    if (!meta) return;
    const isSelected = selectedKeys.has(key);
    if (!isSelected) {
      if (key === NO_ISSUE_CARD_KEY && hasOtherNegative) {
        Alert.alert('알림', "다른 카드에 '주의' 관찰이 있어 '일상 양호/특이 없음'을 함께 선택할 수 없습니다.");
        return;
      }
      if (meta.singleOutcome !== 'positive' && noIssueSelected) {
        Alert.alert('알림', "'일상 양호/특이 없음' 선택 중에는 다른 상태·반응 카드를 선택할 수 없습니다. 먼저 해제해주세요.");
        return;
      }
    }
    setSheetKey(key);
  };

  const handleCardPress = (key: string, domain: ObservationDomain, meta: CardMeta) => {
    if (meta.kind === 'state') {
      openStateSheet(key);
      return;
    }
    toggleActionButton(key, domain, meta.autoText);
  };

  const sheetMeta = sheetKey ? cardMetaByKey.get(sheetKey) : null;
  const sheetDomain = useMemo(() => {
    if (!sheetKey) return activeDomain;
    if (sheetKey.startsWith('b')) {
      const btn = builtin.find(b => `b${b.id}` === sheetKey);
      return btn?.domain ?? activeDomain;
    }
    const c = (customCards as CustomObservationCard[]).find(x => `c${x.id}` === sheetKey);
    return c?.domain ?? activeDomain;
  }, [sheetKey, builtin, customCards, activeDomain]);
  const sheetCard: ObservationOutcomeSheetCard | null = sheetMeta ? {
    key: sheetKey!,
    buttonName: sheetMeta.buttonName,
    icon: sheetMeta.icon,
    outcomes: sheetMeta.outcomes,
    reasons: sheetMeta.reasons,
    allowFreeReason: sheetMeta.allowFreeReason,
    singleOutcome: sheetMeta.singleOutcome,
  } : null;

  const handleSheetSave = (result: ObservationOutcomeSelection) => {
    if (!sheetKey || !sheetMeta) return;
    setStateSelections(prev => ({ ...prev, [sheetKey]: result }));
    setSelected(prev => (
      prev.some(p => p.key === sheetKey)
        ? prev
        : [...prev, { key: sheetKey, domain: sheetDomain, autoText: '' }]
    ));
    setSheetKey(null);
  };

  const handleSheetRemove = () => {
    if (!sheetKey) return;
    setSelected(prev => prev.filter(p => p.key !== sheetKey));
    setStateSelections(prev => { const next = { ...prev }; delete next[sheetKey]; return next; });
    setSheetKey(null);
  };

  // 내장 버튼을 mainCategory별 소제목 그룹으로 (등장 순서 유지) — 관찰3단 §6: builtin은
  // 서버 정본(또는 폴백 사본)에서 온다(로컬 import 직접 참조 금지 — 정본 1곳 원칙).
  const builtinGroups = useMemo(() => {
    const items: ObservationButton[] = builtin.filter(b => b.domain === activeDomain);
    const order: string[] = [];
    const groups: Record<string, ObservationButton[]> = {};
    for (const b of items) {
      if (!groups[b.mainCategory]) {
        groups[b.mainCategory] = [];
        order.push(b.mainCategory);
      }
      groups[b.mainCategory].push(b);
    }
    return order.map(category => ({ category, items: groups[category] }));
  }, [builtin, activeDomain]);

  const domainCustomCards = useMemo(
    () => (customCards as CustomObservationCard[]).filter(c => c.domain === activeDomain),
    [customCards, activeDomain],
  );

  // 관찰3단 §1-4/§4: '주의'인데 사유가 비어있는 카드 — 저장 차단(시트에서 이미 막지만 이중 방어)
  const invalidNegativeKeys = useMemo(() => {
    return Object.entries(stateSelections)
      .filter(([, sel]) => sel.outcome === 'negative' && sel.reasons.length === 0 && !sel.reasonText.trim())
      .map(([key]) => key);
  }, [stateSelections]);

  // 선택된 카드마다(순서 유지) 미리보기 문장 1개씩 — action은 outcomes.positive, state는 3단 문장+사유
  const previewSentences = useMemo(() => {
    return selected.map(s => {
      const meta = cardMetaByKey.get(s.key);
      if (!meta) return '';
      if (meta.kind === 'state') {
        const sel = stateSelections[s.key] ?? { outcome: 'neutral' as ObservationOutcome, reasons: [], reasonText: '' };
        return buildObservationSentence(meta.outcomes, sel.outcome, sel.reasons, sel.reasonText);
      }
      return meta.autoText;
    }).filter(Boolean);
  }, [selected, cardMetaByKey, stateSelections]);

  const canSave = !!selectedResident && (selected.length > 0 || freeText.trim().length > 0);

  const handleSave = () => {
    if (!selectedResident) {
      Alert.alert('알림', '입소자를 선택해주세요');
      return;
    }
    const trimmedFree = freeText.trim();
    if (selected.length === 0 && !trimmedFree) {
      Alert.alert('알림', '버튼을 선택하거나 관찰 내용을 입력해주세요');
      return;
    }
    // 관찰3단 §1-4/§4: 빈 '주의' 저장 차단 — 사유(칩 선택 또는 직접 입력)가 없으면 저장하지 않는다
    if (invalidNegativeKeys.length > 0) {
      Alert.alert('알림', "'주의'로 표시한 카드에 사유(칩 선택 또는 직접 입력)를 채워주세요.");
      return;
    }
    if (noIssueSelected && hasOtherNegative) {
      Alert.alert('알림', "'일상 양호/특이 없음'과 '주의' 관찰은 함께 저장할 수 없습니다.");
      return;
    }

    // 관찰3단 §2/§3: content v2 — items[](kind별 outcome/사유) + buttons(하위호환 병행 저장)
    const items = selected.map(s => {
      const meta = cardMetaByKey.get(s.key);
      if (!meta) return null;
      if (meta.kind === 'state') {
        const sel = stateSelections[s.key] ?? { outcome: 'neutral' as ObservationOutcome, reasons: [], reasonText: '' };
        const item: Record<string, unknown> = { id: meta.rawId, name: meta.buttonName, kind: 'state', outcome: sel.outcome };
        if (sel.outcome === 'negative') {
          if (sel.reasons.length > 0) item.reasons = sel.reasons;
          if (sel.reasonText.trim()) item.reasonText = sel.reasonText.trim();
        }
        return item;
      }
      return { id: meta.rawId, name: meta.buttonName, kind: 'action' };
    }).filter(Boolean) as Record<string, unknown>[];
    const buttonNames = selected
      .map(s => cardMetaByKey.get(s.key)?.buttonName)
      .filter(Boolean) as string[];

    const autoGeneratedText = previewSentences.join(' ').trim();
    const fullNarrative = [autoGeneratedText, trimmedFree].filter(Boolean).join(' ').trim();
    const content = JSON.stringify({ v: 2, items, note: fullNarrative || null, generated: fullNarrative || null, buttons: buttonNames });

    createRecord(
      {
        residentId: selectedResident,
        recordType: 'observation',
        // KST 날짜 — UTC 슬라이스면 새벽 0~9시 기록이 전날로 밀린다(야간 근무 시간대)
        recordDate: getKSTToday(),
        // ⛔ toISOString() = UTC 벽시계. recordTime 은 시각만 담는 컬럼이라
        //    07:00 기록이 22:00으로 남았다(2026-09-03 QA P2) → KST 벽시계로 보낸다.
        recordTime: getKSTNowWallClockIso(),
        content,
        // 관찰3단 §1-3/§3: severity는 서버가 산출 — 클라이언트는 보내지 않는다
        staffId: session?.user.staffId ?? null,
      },
      {
        onSuccess: () => {
          // 실증 측정 — 관찰 기록 저장 성공(ADR-001 §7). residentId·성명·기록내용은 담지 않는다.
          measure.save('observation:save');
          Alert.alert('저장 완료', `${resident?.name ?? '입소자'} 어르신 관찰 기록이 저장되었습니다`);
          setSelected([]);
          setStateSelections({});
          setFreeText('');
          setSuggestions([]);
          setSuggestionErrors({});
          setLearnedNotice(null);

          // 단어카드 학습 루프 — 부가 기능이라 실패해도 기록 저장 결과에는 영향 없음
          if (trimmedFree.length >= SUGGEST_MIN_LEN) {
            suggestCards(
              { text: trimmedFree },
              {
                onSuccess: (res) => setSuggestions(res.suggestions ?? []),
                onError: (err) => console.log('[observation] 단어카드 제안 실패(조용히 접음):', err),
              },
            );
          }
        },
        onError: (err) => {
          // 오프라인 큐(2026-09-06 vc11) — 큐에 들어간 것은 유실이 아니다.
          // 성공과 같이 입력값을 비우되(로컬에 이미 안전하게 담김), 문구는 "대기 중"으로 정직하게 구분한다.
          if (err instanceof QueuedOfflineError) {
            measure.step('observation:save:queued');
            Alert.alert('대기 중', `${resident?.name ?? '입소자'} 어르신 관찰 기록 — ${err.message}`);
            setSelected([]);
            setStateSelections({});
            setFreeText('');
            setSuggestions([]);
            setSuggestionErrors({});
            setLearnedNotice(null);
            return;
          }
          Alert.alert('저장 실패', err.message);
        },
      },
    );
  };

  // 자동 추가 금지 — 사람이 이 칩을 탭해야만 실제로 등록된다.
  const handleAddSuggestion = (s: ObservationCardSuggestion) => {
    setAddingSuggestion(s.buttonName);
    setSuggestionErrors(prev => {
      if (!(s.buttonName in prev)) return prev;
      const next = { ...prev };
      delete next[s.buttonName];
      return next;
    });
    createCard(
      { buttonName: s.buttonName, autoText: s.autoText, domain: s.domain, icon: s.icon },
      {
        onSuccess: () => {
          setAddingSuggestion(null);
          setSuggestions(prev => prev.filter(x => x.buttonName !== s.buttonName));
          setLearnedNotice(`「${s.icon}${s.buttonName}」 단어카드를 추가했습니다 — 다음부터 버튼으로 누르시면 됩니다`);
        },
        onError: (err) => {
          setAddingSuggestion(null);
          setSuggestionErrors(prev => ({ ...prev, [s.buttonName]: err.message }));
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 제목은 네비게이션 헤더가 표시 (2026-08-06 탭바 제거) */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.historyHit}
          onPress={() => setShowHistory(!showHistory)}
        >
          <Text style={styles.historyBtn}>
            {showHistory ? '기록하기' : `기록 (${history.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {showHistory ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {loadingHistory ? (
            <ActivityIndicator size="large" color={COLOR.primary} style={{ marginTop: 32 }} />
          ) : history.length === 0 ? (
            <Text style={styles.emptyText}>아직 기록이 없습니다</Text>
          ) : (
            history.map((entry) => {
              // 관찰3단 §5: content v2({v:2, items:[...]})면 '주의' 배지 + 사유 요약을 계산한다.
              // GET 응답이 contentObj를 병행 제공하면 그걸 쓰고, 없으면(구버전 등) 직접 파싱한다.
              const c = entry.contentObj !== undefined ? entry.contentObj : parseRecordContent(entry.content);
              const { warning, reasonSummary } = observationWarningSummary(c);
              const displayText = (c && typeof c.note === 'string' && c.note) || entry.content || '';
              return (
                <View
                  key={entry.id}
                  style={[styles.entryCard, warning && styles.entryCardWarning]}
                >
                  <View style={styles.entryTop}>
                    <View style={styles.entryNameRow}>
                      <Text style={styles.entryName}>{entry.residentName}</Text>
                      {warning && (
                        <View style={styles.warningBadge}>
                          <Text style={styles.warningBadgeText}>주의</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.entryTime}>{entry.recordTime ?? entry.recordDate}</Text>
                  </View>
                  <Text style={styles.entryCat}>{entry.recordType}</Text>
                  {warning && reasonSummary ? (
                    <Text style={styles.warningReasonText}>사유: {reasonSummary}</Text>
                  ) : null}
                  <Text style={styles.entryContent}>{displayText}</Text>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 1. 입소자 선택 */}
          <Text style={styles.sectionLabel}>입소자 선택</Text>
          {loadingResidents ? (
            <ActivityIndicator size="small" color={COLOR.primary} />
          ) : residents.length === 0 ? (
            <Text style={styles.emptyText}>입소 중인 입소자가 없습니다</Text>
          ) : (
            <View style={styles.residentRow}>
              {residents.map(r => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setSelectedResident(r.id)}
                  style={[styles.residentChip, selectedResident === r.id && styles.residentChipActive]}
                >
                  <Text style={[styles.residentChipText, selectedResident === r.id && styles.residentChipTextActive]}>
                    {r.name} ({r.room || '미배정'})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 2. 도메인 4탭 */}
          <Text style={styles.sectionLabel}>관찰 영역</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.domainScroll}>
            {OBSERVATION_DOMAINS.map(d => {
              const count = domainCounts[d] ?? 0;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setActiveDomain(d)}
                  style={[styles.domainChip, activeDomain === d && styles.domainChipActive]}
                >
                  <Text style={[styles.domainChipText, activeDomain === d && styles.domainChipTextActive]}>
                    {d}
                  </Text>
                  {count > 0 && (
                    <View style={styles.domainBadge}>
                      <Text style={styles.domainBadgeText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 관찰3단 §2/§6: 서버 정본 fetch 실패 시 "시설 설정 미반영" 정직 표시(목데이터 아님) */}
          {fallbackNotice ? <Text style={styles.fallbackNoticeText}>{fallbackNotice}</Text> : null}

          {/* 3. 버튼 그리드 — 내장 버튼(소제목 그룹) + 서버 커스텀 단어카드.
              관찰3단 §3/§4: 상태·반응 카드(kind:'state')는 3단 결과에 따라 모서리 색이 바뀐다
              (초록/회색/주황) — 탭하면 하단 시트가 열린다. 행위 카드는 기존 탭 1회 동작 유지. */}
          {builtinGroups.map(group => (
            <View key={group.category} style={styles.groupBlock}>
              <Text style={styles.groupLabel}>{group.category}</Text>
              <View style={styles.buttonGrid}>
                {group.items.map(btn => {
                  const key = `b${btn.id}`;
                  const isSel = selectedKeys.has(key);
                  const isState = btn.kind === 'state';
                  const outcome = isState ? (stateSelections[key]?.outcome ?? 'neutral') : null;
                  const outcomeStyle = isSel && outcome ? OUTCOME_CARD_STYLE[outcome] : null;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleCardPress(key, btn.domain, cardMetaByKey.get(key)!)}
                      style={[
                        styles.wordCard,
                        isSel && !outcomeStyle && styles.wordCardActive,
                        outcomeStyle && { backgroundColor: outcomeStyle.bg, borderColor: outcomeStyle.border },
                        !isSel && isState && styles.wordCardStateHint,
                      ]}
                    >
                      <Text style={styles.wordCardIcon}>{btn.icon}</Text>
                      <Text style={[
                        styles.wordCardText,
                        isSel && !outcomeStyle && styles.wordCardTextActive,
                        outcomeStyle && { color: outcomeStyle.text, fontWeight: '700' },
                      ]}>
                        {btn.buttonName}{isState && !isSel ? ' 🔀' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {cardsError ? (
            <Text style={styles.cardsErrorText}>
              우리 시설 단어카드를 불러오지 못했습니다 — 내장 버튼만 표시합니다
            </Text>
          ) : domainCustomCards.length > 0 ? (
            <View style={styles.groupBlock}>
              <Text style={styles.groupLabel}>우리 시설 단어카드</Text>
              <View style={styles.buttonGrid}>
                {domainCustomCards.map(card => {
                  const key = `c${card.id}`;
                  const isSel = selectedKeys.has(key);
                  const isState = card.kind === 'state';
                  const outcome = isState ? (stateSelections[key]?.outcome ?? 'neutral') : null;
                  const outcomeStyle = isSel && outcome ? OUTCOME_CARD_STYLE[outcome] : null;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleCardPress(key, card.domain, cardMetaByKey.get(key)!)}
                      style={[
                        styles.wordCard,
                        isSel && !outcomeStyle && styles.wordCardActive,
                        outcomeStyle && { backgroundColor: outcomeStyle.bg, borderColor: outcomeStyle.border },
                        !isSel && isState && styles.wordCardStateHint,
                      ]}
                    >
                      <Text style={styles.wordCardIcon}>{card.icon || '📝'}</Text>
                      <Text style={[
                        styles.wordCardText,
                        isSel && !outcomeStyle && styles.wordCardTextActive,
                        outcomeStyle && { color: outcomeStyle.text, fontWeight: '700' },
                      ]}>
                        {card.buttonName}{isState && !isSel ? ' 🔀' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* 4. 직접 입력 — 버튼에 없는 내용만 */}
          <Text style={styles.sectionLabel}>직접 입력</Text>
          <TextInput
            style={styles.textInput}
            value={freeText}
            onChangeText={setFreeText}
            placeholder="버튼에 없는 내용만 직접 적으세요"
            placeholderTextColor={COLOR.textFaint}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* 단어카드 학습 루프 — 저장 후 제안(사람이 탭해야만 실제 등록) */}
          {suggestions.length > 0 && (
            <View style={styles.suggestBlock}>
              <Text style={styles.suggestTitle}>방금 입력한 내용에서 단어카드 후보를 찾았습니다</Text>
              {suggestions.map(s => (
                <View key={s.buttonName} style={styles.suggestRow}>
                  <TouchableOpacity
                    style={styles.suggestChip}
                    onPress={() => handleAddSuggestion(s)}
                    disabled={addingSuggestion === s.buttonName}
                  >
                    {addingSuggestion === s.buttonName ? (
                      <ActivityIndicator size="small" color={COLOR.primary} />
                    ) : (
                      <Text style={styles.suggestChipText}>
                        「{s.icon}{s.buttonName}」 단어카드 추가
                      </Text>
                    )}
                  </TouchableOpacity>
                  {suggestionErrors[s.buttonName] ? (
                    <Text style={styles.suggestErrorText}>
                      추가 실패: {suggestionErrors[s.buttonName]}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {learnedNotice ? (
            <Text style={styles.learnedNoticeText}>{learnedNotice}</Text>
          ) : null}

          {/* 관찰3단 §1-4/§4: 빈 '주의' 또는 특이없음+주의 동시선택은 저장 전 인라인 경고 */}
          {(invalidNegativeKeys.length > 0 || (noIssueSelected && hasOtherNegative)) && (
            <Text style={styles.blockedSaveText}>
              {invalidNegativeKeys.length > 0
                ? "⚠️ '주의'로 표시한 카드에 사유를 먼저 채워주세요."
                : "⚠️ '일상 양호/특이 없음'과 '주의' 관찰은 함께 저장할 수 없습니다."}
            </Text>
          )}

          {/* 5. 저장 */}
          <TouchableOpacity
            style={[styles.saveBtn, (!canSave || isSaving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLOR.onPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>기록 저장</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* 관찰3단 §3/§4: 상태·반응 카드 3단 선택 시트 */}
      <ObservationOutcomeSheet
        visible={!!sheetKey}
        card={sheetCard}
        initial={sheetKey ? stateSelections[sheetKey] : undefined}
        negativeDisabled={!!sheetKey && sheetKey !== NO_ISSUE_CARD_KEY && noIssueSelected}
        alreadySelected={!!sheetKey && selectedKeys.has(sheetKey)}
        onCancel={() => setSheetKey(null)}
        onRemove={handleSheetRemove}
        onSave={handleSheetSave}
      />
    </SafeAreaView>
  );
}

// 관찰3단 §3/§4: 카드 모서리 색 정본 — 양호(초록)/평소와 같음(회색)/주의(주황), 웹 OUTCOME_COLORS와 동일 규칙
const OUTCOME_CARD_STYLE: Record<ObservationOutcome, { bg: string; border: string; text: string }> = {
  positive: { bg: COLOR.successBg, border: COLOR.success, text: COLOR.success },
  neutral: { bg: '#F3F4F6', border: COLOR.borderStrong, text: COLOR.textSub },
  negative: { bg: COLOR.cautionBg, border: COLOR.caution, text: COLOR.caution },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  header: {
    backgroundColor: COLOR.primary, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
  },
  historyHit: { minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  historyBtn: { color: '#93C5FD', fontSize: FONT.heading, fontWeight: '600' },
  content: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl },
  sectionLabel: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, marginBottom: -SPACE.sm },

  residentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  residentChip: {
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, minHeight: TOUCH.min,
    justifyContent: 'center', borderRadius: RADIUS.md,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border,
  },
  residentChipActive: { backgroundColor: COLOR.primary, borderColor: COLOR.primary },
  residentChipText: { fontSize: FONT.body, color: COLOR.text, fontWeight: '500' },
  residentChipTextActive: { color: COLOR.onPrimary },

  domainScroll: { flexGrow: 0 },
  domainChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    minHeight: TOUCH.min, paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md, backgroundColor: COLOR.surface,
    borderWidth: 1, borderColor: COLOR.border, marginRight: SPACE.sm,
  },
  domainChipActive: { backgroundColor: '#EFF6FF', borderColor: COLOR.primary, borderWidth: 2 },
  domainChipText: { fontSize: FONT.label, color: COLOR.textMuted, fontWeight: '600' },
  domainChipTextActive: { color: COLOR.primary },
  domainBadge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center',
  },
  domainBadgeText: { color: COLOR.onPrimary, fontSize: FONT.caption, fontWeight: '700' },

  fallbackNoticeText: { fontSize: FONT.caption, color: COLOR.warning, fontStyle: 'italic' },

  groupBlock: { gap: SPACE.sm },
  groupLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub },
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  wordCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    minHeight: TOUCH.min, paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md, backgroundColor: COLOR.surface,
    borderWidth: 1, borderColor: COLOR.border,
  },
  wordCardActive: { backgroundColor: COLOR.primary, borderColor: COLOR.primary },
  wordCardStateHint: { borderStyle: 'dashed', borderColor: COLOR.primary, borderWidth: 1.5 },
  wordCardIcon: { fontSize: FONT.heading },
  wordCardText: { fontSize: FONT.body, color: COLOR.text, fontWeight: '500' },
  wordCardTextActive: { color: COLOR.onPrimary, fontWeight: '700' },

  cardsErrorText: { fontSize: FONT.caption, color: COLOR.textMuted, fontStyle: 'italic' },

  textInput: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    padding: SPACE.md, fontSize: FONT.body, color: COLOR.text, minHeight: 100, textAlignVertical: 'top',
  },

  suggestBlock: {
    gap: SPACE.sm, backgroundColor: '#EFF6FF', borderRadius: RADIUS.md,
    padding: SPACE.md, borderWidth: 1, borderColor: COLOR.primary,
  },
  suggestTitle: { fontSize: FONT.label, fontWeight: '700', color: COLOR.primary },
  suggestRow: { gap: SPACE.xs },
  suggestChip: {
    minHeight: TOUCH.min, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACE.md, borderRadius: RADIUS.md,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.primary,
  },
  suggestChipText: { fontSize: FONT.body, color: COLOR.primary, fontWeight: '700' },
  suggestErrorText: { fontSize: FONT.caption, color: COLOR.danger },
  learnedNoticeText: {
    fontSize: FONT.label, color: COLOR.success, fontWeight: '600',
    backgroundColor: COLOR.successBg, borderRadius: RADIUS.md, padding: SPACE.md,
  },
  blockedSaveText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },

  saveBtn: {
    backgroundColor: COLOR.success, borderRadius: RADIUS.md, minHeight: TOUCH.large,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: COLOR.textMuted },
  saveBtnText: { color: COLOR.onPrimary, fontSize: FONT.heading, fontWeight: '700' },

  emptyText: { textAlign: 'center', color: COLOR.textFaint, marginTop: SPACE.xxl, fontSize: FONT.body },
  entryCard: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.md,
    borderWidth: 1, borderColor: COLOR.border,
  },
  // 관찰3단 §5: 목록·이력 행 '주의' 배지 — 카드 좌측 테두리를 주황으로
  entryCardWarning: { borderColor: COLOR.caution, borderLeftWidth: 4, borderLeftColor: COLOR.caution },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs },
  entryNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  entryName: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  warningBadge: {
    paddingHorizontal: SPACE.xs, paddingVertical: 2, borderRadius: RADIUS.sm,
    backgroundColor: COLOR.cautionBg,
  },
  warningBadgeText: { fontSize: FONT.caption, fontWeight: '700', color: COLOR.caution },
  warningReasonText: { fontSize: FONT.caption, color: COLOR.caution, marginBottom: SPACE.xs },
  entryTime: { fontSize: FONT.label, color: COLOR.textFaint },
  entryCat: { fontSize: FONT.label, color: COLOR.textMuted, marginBottom: SPACE.xs },
  entryContent: { fontSize: FONT.body, color: COLOR.textSub, lineHeight: 24 },
});
