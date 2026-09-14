/**
 * 관찰 상태·반응 3단 시트 — 관찰3단 §3/§4 (2026-09-15, 워커앱 반영)
 *
 * 상태·반응 카드(kind:'state')를 탭하면 뜨는 하단 시트. `ServiceDetailSheet.tsx`와 같은
 * 구조(Modal, transparent, 하단 카드, 취소/저장)를 재사용한다.
 *
 * 규칙(설계 §1/§4, 웹 ObservationTab과 동일 규약)
 *   - 3단: 양호(초록) / 평소와 같음(회색) / 주의(주황). singleOutcome:'positive' 카드(35번
 *     "일상 양호/특이 없음")는 3단이 없고 양호로 고정 표시만 한다.
 *   - '주의' 선택 시 사유 칩(다중) 또는 "직접 입력" 중 최소 하나가 있어야 저장 가능
 *     (빈 '주의' 저장 차단 — 인라인 안내, 저장 버튼을 막지 않고 눌렀을 때 안내만 띄운다).
 *   - '주의' 선택이 시설 전체에서 금지된 상태(다른 카드에서 '일상 양호/특이 없음'을 이미 선택)면
 *     negativeDisabled=true로 주의 세그먼트 자체를 비활성화한다(§1-4 모순 방지).
 *   - 미리보기 문장 = 저장 문장(N-24) — `buildObservationSentence` 공용 함수 하나만 쓴다.
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';
import { buildObservationSentence } from '@/lib/care/observation-sentence';
import type { ObservationOutcome, ObservationOutcomeTemplates } from '@/lib/data/observation-buttons';

export interface ObservationOutcomeSheetCard {
  key: string;
  buttonName: string;
  icon?: string;
  outcomes?: ObservationOutcomeTemplates;
  reasons?: string[];
  allowFreeReason?: boolean;
  singleOutcome?: 'positive';
}

export interface ObservationOutcomeSelection {
  outcome: ObservationOutcome;
  reasons: string[];
  reasonText: string;
}

interface Props {
  visible: boolean;
  card: ObservationOutcomeSheetCard | null;
  /** 이미 선택돼 있던 값(재편집) — 없으면 기본값(양호 전용 카드는 positive, 그 외는 neutral) */
  initial?: ObservationOutcomeSelection;
  /** true면 '주의' 세그먼트를 비활성화한다(§1-4: '일상 양호/특이 없음'과 동시 선택 금지) */
  negativeDisabled?: boolean;
  /** 시트를 열 때 이미 선택된 카드였으면 "선택 해제" 버튼을 보여준다 */
  alreadySelected?: boolean;
  onCancel: () => void;
  onRemove?: () => void;
  onSave: (result: ObservationOutcomeSelection) => void;
}

const OUTCOME_COLORS: Record<ObservationOutcome, { bg: string; border: string; text: string }> = {
  positive: { bg: COLOR.successBg, border: COLOR.success, text: COLOR.success },
  neutral: { bg: '#F3F4F6', border: COLOR.borderStrong, text: COLOR.textSub },
  negative: { bg: COLOR.cautionBg, border: COLOR.caution, text: COLOR.caution },
};
const OUTCOME_LABELS: Record<ObservationOutcome, string> = { positive: '양호', neutral: '평소와 같음', negative: '주의' };

export default function ObservationOutcomeSheet({
  visible, card, initial, negativeDisabled, alreadySelected, onCancel, onRemove, onSave,
}: Props) {
  const isSingle = card?.singleOutcome === 'positive';

  const [outcome, setOutcome] = useState<ObservationOutcome>('neutral');
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonText, setReasonText] = useState('');
  const [showFreeInput, setShowFreeInput] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // 시트가 새로 열리거나 대상 카드가 바뀌면 초기값으로 리셋(다른 카드의 선택이 새지 않게).
  useEffect(() => {
    if (!visible) return;
    setOutcome(initial?.outcome ?? (isSingle ? 'positive' : 'neutral'));
    setReasons(initial?.reasons ?? []);
    setReasonText(initial?.reasonText ?? '');
    setShowFreeInput(!!initial?.reasonText);
    setBlocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, card?.key]);

  if (!card) return null;

  const toggleReason = (reason: string) => {
    setBlocked(false);
    setReasons(prev => (prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]));
  };

  const preview = buildObservationSentence(card.outcomes, outcome, reasons, reasonText);

  const save = () => {
    if (outcome === 'negative' && reasons.length === 0 && !reasonText.trim()) {
      setBlocked(true);
      return;
    }
    onSave({ outcome, reasons, reasonText: reasonText.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.bg}>
        <View style={st.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={st.title}>{card.icon ? `${card.icon} ` : ''}{card.buttonName}</Text>

            {isSingle ? (
              <View style={[st.singleBadge, { backgroundColor: OUTCOME_COLORS.positive.bg, borderColor: OUTCOME_COLORS.positive.border }]}>
                <Text style={[st.singleBadgeText, { color: OUTCOME_COLORS.positive.text }]}>양호(3단 없음)로 기록됩니다</Text>
              </View>
            ) : (
              <>
                <Text style={st.groupLabel}>상태·반응</Text>
                <View style={st.segmentRow}>
                  {(['positive', 'neutral', 'negative'] as ObservationOutcome[]).map(o => {
                    const active = outcome === o;
                    const disabled = o === 'negative' && !!negativeDisabled;
                    const c = OUTCOME_COLORS[o];
                    return (
                      <TouchableOpacity
                        key={o}
                        disabled={disabled}
                        onPress={() => { setBlocked(false); setOutcome(o); }}
                        style={[
                          st.segment,
                          { borderColor: active ? c.border : COLOR.borderStrong, backgroundColor: active ? c.bg : COLOR.bg },
                          disabled && st.segmentDisabled,
                        ]}>
                        <Text style={[st.segmentText, { color: active ? c.text : COLOR.textSub }]}>{OUTCOME_LABELS[o]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {negativeDisabled && (
                  <Text style={st.hintText}>'일상 양호/특이 없음' 선택 중에는 '주의'를 고를 수 없습니다. 먼저 해제해주세요.</Text>
                )}

                {outcome === 'negative' && (
                  <View style={{ gap: SPACE.sm }}>
                    <Text style={st.groupLabel}>사유(선택)</Text>
                    <View style={st.chipsRow}>
                      {(card.reasons ?? []).map(reason => {
                        const selected = reasons.includes(reason);
                        return (
                          <TouchableOpacity
                            key={reason}
                            style={[st.chip, selected && st.chipSelectedNegative]}
                            onPress={() => toggleReason(reason)}>
                            <Text style={[st.chipText, selected && st.chipTextSelected]}>{reason}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {card.allowFreeReason && (
                        <TouchableOpacity
                          style={[st.chip, showFreeInput && st.chipSelectedNegative]}
                          onPress={() => setShowFreeInput(prev => !prev)}>
                          <Text style={[st.chipText, showFreeInput && st.chipTextSelected]}>✏️ 직접 입력</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {showFreeInput && (
                      <TextInput
                        style={st.freeInput}
                        placeholder="예: 소화가 안 되어서"
                        placeholderTextColor={COLOR.textFaint}
                        value={reasonText}
                        onChangeText={(t) => { setBlocked(false); setReasonText(t); }}
                      />
                    )}
                    {blocked && (
                      <Text style={st.blockedText}>⚠️ '주의'는 사유(칩 선택 또는 직접 입력)가 있어야 저장됩니다.</Text>
                    )}
                  </View>
                )}
              </>
            )}

            {preview ? (
              <View style={st.previewBox}>
                <Text style={st.previewLabel}>미리보기(저장될 문장)</Text>
                <Text style={st.previewText}>“{preview}”</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={st.actions}>
            {alreadySelected && onRemove ? (
              <TouchableOpacity style={st.removeBtn} onPress={onRemove}>
                <Text style={st.removeText}>선택 해제</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
                <Text style={st.cancelText}>취소</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.saveBtn} onPress={save}>
              <Text style={st.saveText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md, maxHeight: '85%' },
  title: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, marginBottom: SPACE.sm },

  groupLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub, marginBottom: SPACE.xs },

  singleBadge: { borderWidth: 1.5, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.md, marginBottom: SPACE.sm },
  singleBadgeText: { fontSize: FONT.body, fontWeight: '700' },

  segmentRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm },
  segment: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xs,
  },
  segmentDisabled: { opacity: 0.4 },
  segmentText: { fontSize: FONT.body, fontWeight: '700' },
  hintText: { fontSize: FONT.caption, color: COLOR.textMuted, marginBottom: SPACE.sm },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    minHeight: 44, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLOR.borderStrong, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLOR.bg,
  },
  chipSelectedNegative: { borderColor: COLOR.caution, backgroundColor: COLOR.cautionBg },
  chipText: { fontSize: FONT.label, fontWeight: '600', color: COLOR.text },
  chipTextSelected: { color: COLOR.caution },

  freeInput: {
    minHeight: TOUCH.min, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.md,
    padding: SPACE.md, fontSize: FONT.label, color: COLOR.text,
  },
  blockedText: { fontSize: FONT.caption, color: COLOR.danger, fontWeight: '600' },

  previewBox: { backgroundColor: COLOR.bg, borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.sm },
  previewLabel: { fontSize: FONT.caption, color: COLOR.textMuted, marginBottom: SPACE.xs, fontWeight: '600' },
  previewText: { fontSize: FONT.label, color: COLOR.textSub, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.md },
  cancelBtn: { flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
  removeBtn: { flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.danger, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.danger },
  saveBtn: { flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.onPrimary },
});
