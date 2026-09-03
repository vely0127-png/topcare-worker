/**
 * 관찰 기록 화면 — GET/POST /api/care/records?recordType=observation
 *
 * 2026-09-01 개편: 웹과 동일한 4도메인 단어카드 체계로 교체
 * (신체활동지원/인지관리 및 의사소통/건강 및 간호관리/기능회복훈련).
 * 버튼 정본은 `topcare-web/lib/data/observation-buttons.ts` — 사본은
 * `lib/data/observation-buttons.ts`(양쪽 동기화 필요, 상단 주석 참고).
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
  type ObservationCardSuggestion,
} from '@/lib/hooks/useObservationCards';
import { useSession } from '@/lib/hooks/useAuth';
import { getKSTToday, getKSTNowWallClockIso } from '@/lib/utils/date';
import {
  OBSERVATION_DOMAINS, getButtonsByDomain,
  type ObservationDomain, type ObservationButton,
} from '@/lib/data/observation-buttons';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

/** 직접 입력분이 이 길이 이상이어야 단어카드 제안을 요청한다 (웹 suggest 라우트와 동일 기준) */
const SUGGEST_MIN_LEN = 15;

interface SelectedItem {
  key: string;
  domain: ObservationDomain;
  autoText: string;
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

  // 커스텀 단어카드 — 조회 실패해도 화면은 죽지 않는다(내장 버튼만 + 오류 문구)
  const { data: cardsData, isError: cardsError } = useObservationCards();
  const { mutate: createCard } = useObservationCardCreate();
  const { mutate: suggestCards } = useObservationCardSuggest();

  const residents = residentsData?.items ?? [];
  const history = historyData?.items ?? [];
  const customCards = cardsData?.cards ?? [];

  const [selectedResident, setSelectedResident] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<ObservationDomain>(OBSERVATION_DOMAINS[0]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [freeText, setFreeText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // 단어카드 학습 루프 상태
  const [suggestions, setSuggestions] = useState<ObservationCardSuggestion[]>([]);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [suggestionErrors, setSuggestionErrors] = useState<Record<string, string>>({});
  const [learnedNotice, setLearnedNotice] = useState<string | null>(null);

  const resident = residents.find(r => r.id === selectedResident);
  const selectedKeys = useMemo(() => new Set(selected.map(s => s.key)), [selected]);

  // 도메인 탭 배지 — 이번 기록에서 각 도메인에서 몇 개 골랐는지
  const domainCounts = useMemo(() => {
    const m: Partial<Record<ObservationDomain, number>> = {};
    for (const s of selected) m[s.domain] = (m[s.domain] ?? 0) + 1;
    return m;
  }, [selected]);

  // 문자열에서 역파싱하지 않기 위해 선택 항목은 별도 상태(autoText 원문)로 관리하고
  // 저장 시에만 직접 입력분과 합친다.
  const toggleButton = (key: string, domain: ObservationDomain, autoText: string) => {
    setSelected(prev => (
      prev.some(p => p.key === key)
        ? prev.filter(p => p.key !== key)
        : [...prev, { key, domain, autoText }]
    ));
  };

  // 내장 버튼을 mainCategory별 소제목 그룹으로 (등장 순서 유지)
  const builtinGroups = useMemo(() => {
    const items = getButtonsByDomain(activeDomain);
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
  }, [activeDomain]);

  const domainCustomCards = useMemo(
    () => customCards.filter(c => c.domain === activeDomain),
    [customCards, activeDomain],
  );

  const canSave = !!selectedResident && (selected.length > 0 || freeText.trim().length > 0);

  const handleSave = () => {
    if (!selectedResident) {
      Alert.alert('알림', '입주자를 선택해주세요');
      return;
    }
    const trimmedFree = freeText.trim();
    if (selected.length === 0 && !trimmedFree) {
      Alert.alert('알림', '버튼을 선택하거나 관찰 내용을 입력해주세요');
      return;
    }

    const content = [...selected.map(s => s.autoText), trimmedFree].filter(Boolean).join(' ');

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
        staffId: session?.user.staffId ?? null,
      },
      {
        onSuccess: () => {
          Alert.alert('저장 완료', `${resident?.name ?? '입주자'} 어르신 관찰 기록이 저장되었습니다`);
          setSelected([]);
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
            history.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryTop}>
                  <Text style={styles.entryName}>{entry.residentName}</Text>
                  <Text style={styles.entryTime}>{entry.recordTime ?? entry.recordDate}</Text>
                </View>
                <Text style={styles.entryCat}>{entry.recordType}</Text>
                <Text style={styles.entryContent}>{entry.content}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 1. 입주자 선택 */}
          <Text style={styles.sectionLabel}>입주자 선택</Text>
          {loadingResidents ? (
            <ActivityIndicator size="small" color={COLOR.primary} />
          ) : residents.length === 0 ? (
            <Text style={styles.emptyText}>입소 중인 입주자가 없습니다</Text>
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

          {/* 3. 버튼 그리드 — 내장 버튼(소제목 그룹) + 서버 커스텀 단어카드 */}
          {builtinGroups.map(group => (
            <View key={group.category} style={styles.groupBlock}>
              <Text style={styles.groupLabel}>{group.category}</Text>
              <View style={styles.buttonGrid}>
                {group.items.map(btn => {
                  const key = `b${btn.id}`;
                  const isSel = selectedKeys.has(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => toggleButton(key, btn.domain, btn.autoText)}
                      style={[styles.wordCard, isSel && styles.wordCardActive]}
                    >
                      <Text style={styles.wordCardIcon}>{btn.icon}</Text>
                      <Text style={[styles.wordCardText, isSel && styles.wordCardTextActive]}>
                        {btn.buttonName}
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
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => toggleButton(key, card.domain, card.autoText)}
                      style={[styles.wordCard, isSel && styles.wordCardActive]}
                    >
                      <Text style={styles.wordCardIcon}>{card.icon || '📝'}</Text>
                      <Text style={[styles.wordCardText, isSel && styles.wordCardTextActive]}>
                        {card.buttonName}
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
    </SafeAreaView>
  );
}

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
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs },
  entryName: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  entryTime: { fontSize: FONT.label, color: COLOR.textFaint },
  entryCat: { fontSize: FONT.label, color: COLOR.textMuted, marginBottom: SPACE.xs },
  entryContent: { fontSize: FONT.body, color: COLOR.textSub, lineHeight: 24 },
});
