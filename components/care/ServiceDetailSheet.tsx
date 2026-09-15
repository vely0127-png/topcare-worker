/**
 * 서비스 상세 시트 — 서비스 종류가 확정된 뒤 뜨는 공용 2단계 입력 시트 (#23, 2026-09-11)
 *
 * 왜: 배변·목욕만 상세 선택지가 있었고 나머지 8종은 예외 문구 3개(COMMON_OPTIONS)뿐이었다.
 * 10종 전부 같은 방식(그룹별 칩 선택 + 비고)으로 통일한다 — 정본은 useServiceDetailOptions
 * (서버 specs 우선, 실패 시 내장 사본).
 *
 * 규칙
 *   - 그룹 multi=true 면 다중 선택(토글), multi=false 면 단일 선택(다시 탭하면 해제).
 *   - required 그룹을 비운 채 저장하면 인라인 안내만 하고 막는다(강제 선택 UI 없음).
 *   - exception 옵션을 하나라도 고르면 상단에 "간호 확인 신호로 기록됩니다" 배지.
 *   - 저장은 부모가 준다: onSave({ selection, note, hasException }) — 실제 전송·롤백은 호출부 책임.
 *   - 터치 타깃 ≥48px, 글자 ≥14 — 테마 상수(COLOR/FONT/RADIUS/SPACE/TOUCH) 사용, 하드코딩 금지.
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView } from 'react-native';
import { useServiceDetailOptions } from '@/lib/hooks/useServiceDetailOptions';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export interface ServiceDetailSheetResult {
  selection: Record<string, string[]>;
  /** 숫자 입력 그룹 값(정본 group.input, 예 ml) — 비운 칸은 키 없음(측정 안 한 것을 0으로 창작하지 않음) */
  inputs: Record<string, number>;
  note: string;
  hasException: boolean;
}

interface Props {
  visible: boolean;
  /** 확정된 서비스 종류(SERVICE_TYPES 값). null 이면 시트를 렌더하지 않는다. */
  serviceType: string | null;
  /** 시트 상단 제목(예: "홍길동님 — 배변 케어") */
  title: string;
  onCancel: () => void;
  onSave: (result: ServiceDetailSheetResult) => void;
}

export default function ServiceDetailSheet({ visible, serviceType, title, onCancel, onSave }: Props) {
  const { specFor, fallbackNotice } = useServiceDetailOptions();
  const spec = serviceType ? specFor(serviceType) : null;

  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [blockedGroup, setBlockedGroup] = useState<string | null>(null);

  // 시트가 새로 열리거나 서비스 종류가 바뀌면 선택 상태를 비운다(이전 대상의 선택이 새지 않게).
  useEffect(() => {
    if (visible) {
      setSelection({});
      setInputs({});
      setNote('');
      setBlockedGroup(null);
    }
  }, [visible, serviceType]);

  const toggle = (groupKey: string, label: string, multi: boolean) => {
    setBlockedGroup(null);
    setSelection((prev) => {
      const cur = prev[groupKey] ?? [];
      if (multi) {
        const next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
        return { ...prev, [groupKey]: next };
      }
      // 단일 선택 — 같은 걸 다시 탭하면 해제(강요 금지)
      const next = cur.includes(label) ? [] : [label];
      return { ...prev, [groupKey]: next };
    });
  };

  const hasException = !!spec?.groups.some((g) =>
    (selection[g.key] ?? []).some((label) => g.options.find((o) => o.label === label)?.exception),
  );

  const save = () => {
    if (spec) {
      const missing = spec.groups.find((g) => g.required && (selection[g.key] ?? []).length === 0);
      if (missing) {
        setBlockedGroup(missing.key);
        return;
      }
    }
    // 숫자 입력 그룹: 범위 안의 숫자만 넘긴다(빈 칸·범위 밖은 키 없음)
    const numInputs: Record<string, number> = {};
    for (const g of spec?.groups ?? []) {
      if (!g.input || g.input.kind !== 'number') continue;
      if (!isInputShown(g)) continue;
      const raw = (inputs[g.key] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < (g.input.min ?? 0) || n > (g.input.max ?? 1_000_000)) continue;
      numInputs[g.key] = Math.round(n);
    }
    onSave({ selection, inputs: numInputs, note, hasException });
  };

  // showWhen: 지정 그룹의 현재 선택 라벨이 anyOf 안에 있을 때만 숫자 칸을 그린다
  const isInputShown = (g: { input?: { showWhen?: { groupKey: string; anyOf: string[] } } }) => {
    const sw = g.input?.showWhen;
    if (!sw) return true;
    return (selection[sw.groupKey] ?? []).some((label) => sw.anyOf.includes(label));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.bg}>
        <View style={st.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={st.title}>{title}</Text>

            {hasException && (
              <View style={st.exceptionBadge}>
                <Text style={st.exceptionBadgeText}>간호 확인 신호로 기록됩니다</Text>
              </View>
            )}

            {!spec && (
              <Text style={st.emptyText}>이 서비스에는 추가 항목이 없습니다. 비고만 남기고 저장할 수 있습니다.</Text>
            )}
            {fallbackNotice && <Text style={st.fallbackNotice}>{fallbackNotice}</Text>}

            {spec?.groups.filter((g) => !g.input || isInputShown(g)).map((g) => (
              <View key={g.key} style={st.group}>
                <Text style={st.groupLabel}>
                  {g.label}
                  {g.required ? ' *' : ''}
                </Text>
                {g.input?.kind === 'number' && (
                  <View style={st.numberRow}>
                    <TextInput
                      style={st.numberInput}
                      keyboardType="number-pad"
                      placeholder={g.input.placeholder ?? ''}
                      placeholderTextColor={COLOR.textFaint}
                      value={inputs[g.key] ?? ''}
                      onChangeText={(v) => setInputs((prev) => ({ ...prev, [g.key]: v.replace(/[^0-9]/g, '').slice(0, 5) }))}
                      maxLength={5}
                    />
                    <Text style={st.numberUnit}>{g.input.unit}</Text>
                  </View>
                )}
                <View style={st.chipsRow}>
                  {g.options.map((o) => {
                    const selected = (selection[g.key] ?? []).includes(o.label);
                    return (
                      <TouchableOpacity
                        key={o.key}
                        style={[st.chip, selected && (o.exception ? st.chipSelectedException : st.chipSelected)]}
                        onPress={() => toggle(g.key, o.label, g.multi)}
                      >
                        <Text style={[st.chipText, selected && st.chipTextSelected]}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {blockedGroup === g.key && <Text style={st.blockedText}>이 항목을 선택하세요</Text>}
              </View>
            ))}

            <Text style={st.noteLabel}>비고(선택)</Text>
            <TextInput
              style={st.noteInput}
              placeholder={spec?.noteHint ?? '메모를 남기려면 입력하세요'}
              placeholderTextColor={COLOR.textFaint}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </ScrollView>

          <View style={st.actions}>
            <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
              <Text style={st.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.saveBtn} onPress={save}>
              <Text style={st.saveText}>저장</Text>
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

  exceptionBadge: { backgroundColor: COLOR.cautionBg, borderRadius: RADIUS.sm, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, marginBottom: SPACE.md },
  exceptionBadgeText: { color: COLOR.caution, fontWeight: '700', fontSize: FONT.label },

  emptyText: { fontSize: FONT.label, color: COLOR.textMuted, marginBottom: SPACE.md },
  fallbackNotice: { fontSize: FONT.caption, color: COLOR.textFaint, marginBottom: SPACE.md },

  group: { marginBottom: SPACE.lg },
  groupLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub, marginBottom: SPACE.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    minHeight: 48, minWidth: 48, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLOR.borderStrong, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLOR.bg,
  },
  chipSelected: { borderColor: COLOR.primary, backgroundColor: COLOR.primary },
  chipSelectedException: { borderColor: COLOR.caution, backgroundColor: COLOR.caution },
  chipText: { fontSize: FONT.label, fontWeight: '600', color: COLOR.text },
  chipTextSelected: { color: '#fff' },
  blockedText: { fontSize: FONT.caption, color: COLOR.danger, marginTop: SPACE.xs, fontWeight: '600' },

  numberRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
  numberInput: {
    flex: 1, minHeight: 52, borderWidth: 1.5, borderColor: COLOR.borderStrong, borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md, fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, backgroundColor: COLOR.bg,
  },
  numberUnit: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub, minWidth: 32 },

  noteLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  noteInput: {
    minHeight: 48, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.md,
    padding: SPACE.md, fontSize: FONT.label, color: COLOR.text, textAlignVertical: 'top',
  },

  actions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.md },
  cancelBtn: { flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
  saveBtn: { flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.onPrimary },
});
