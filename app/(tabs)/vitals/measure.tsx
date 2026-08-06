/**
 * 바이탈 측정 — **입소자 한 분 = 한 화면** (2026-08-06 요양원 PoC 피드백).
 *
 * 왜 이 화면이 있나
 *   간호(조무)사의 오전 라운드는 "한 분 앞에 서서 재고, 적고, 다음 분으로" 이동한다.
 *   기존 앱에는 조회 화면(`vitals/index`)만 있고 **입력 화면이 없었다** — 현장에서 측정한
 *   값을 앱에 넣을 방법 자체가 없었다는 뜻. 웹 care 화면의 표 형태 일괄입력은
 *   폰에서 칸이 좁아 50~70대에게 쓸 수 없다.
 *
 * 답하는 질문
 *   "지금 이분 값 어디에 적지?" / "오늘 누구까지 쟀지?" / "이 값 이상한가?"
 *
 * 소스
 *   GET  /api/vitals  — 입소자 전원 + 오늘 측정 여부(measured/measuredAt)
 *   POST /api/vitals  — 한 분씩 즉시 저장(라운드 중 앱이 죽어도 앞사람 기록 보존)
 *
 * 정직성
 *   - 저장 실패면 다음 분으로 넘어가지 않는다(가짜 성공 금지).
 *   - 서버가 범위 밖 값을 조용히 버리므로 저장 전에 앱에서 막고 사유를 보여준다.
 *   - 이상치는 "확인 권장"까지만. 진단 문구를 쓰지 않는다.
 */
import { useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert as RNAlert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useVitals, useVitalsSave, vitalRangeError, alertReasons, cautionNotes,
  type VitalItem, type VitalField, type VitalNumbers,
} from '@/lib/hooks/useVitals';
import { getKSTToday, toKSTDate, toKSTTime } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

type Draft = Record<VitalField, string>;
const EMPTY_DRAFT: Draft = { temp: '', spo2: '', bpSys: '', bpDia: '', hr: '', bloodSugar: '' };

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function VitalMeasureScreen() {
  const router = useRouter();
  const today = getKSTToday();
  const { data, isLoading, isError, error, refetch } = useVitals();
  const { mutateAsync: save, isPending: saving } = useVitalsSave();

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // 이번 라운드에서 방금 저장한 사람 — 서버 재조회를 기다리지 않고 진행 표시에 반영
  const [savedNow, setSavedNow] = useState<Record<string, string[]>>({});

  const residents = useMemo(() => data ?? [], [data]);

  const measuredToday = (v: VitalItem) =>
    !!savedNow[v.residentId] ||
    (v.measured && v.measuredAt != null && toKSTDate(v.measuredAt) === today);

  const doneCount = residents.filter(measuredToday).length;
  const current: VitalItem | undefined = residents[index];

  const numbers: VitalNumbers = {
    temp: num(draft.temp), spo2: num(draft.spo2), bpSys: num(draft.bpSys),
    bpDia: num(draft.bpDia), hr: num(draft.hr), bloodSugar: num(draft.bloodSugar),
  };

  const rangeErrors = (Object.keys(EMPTY_DRAFT) as VitalField[])
    .map((f) => vitalRangeError(f, draft[f]))
    .filter((m): m is string => m !== null);

  const hasAnyValue = Object.values(draft).some((v) => v.trim() !== '');
  const alerts = alertReasons(numbers);
  const cautions = cautionNotes(numbers);

  const goTo = (next: number) => {
    setIndex(next);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const finish = () => {
    RNAlert.alert(
      '측정 마치기',
      `오늘 ${doneCount}명 기록했습니다.`,
      [{ text: '확인', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) }],
    );
  };

  const handleNext = (skip: boolean) => {
    const isLast = index >= residents.length - 1;
    if (skip || !hasAnyValue) {
      if (isLast) finish();
      else goTo(index + 1);
      return;
    }
    if (rangeErrors.length > 0) {
      setSaveError('값이 정상 범위를 벗어났습니다. 확인 후 다시 입력하세요.');
      return;
    }
    if (!current) return;

    setSaveError(null);
    void (async () => {
      try {
        const res = await save({
          measuredDate: today,
          entries: [{
            residentId: current.residentId,
            temp: draft.temp || null, spo2: draft.spo2 || null,
            bpSys: draft.bpSys || null, bpDia: draft.bpDia || null,
            hr: draft.hr || null, bloodSugar: draft.bloodSugar || null,
          }],
        });
        if (!res || res.saved < 1) {
          setSaveError('저장되지 않았습니다. 값을 확인하고 다시 시도하세요.');
          return;
        }
        setSavedNow((prev) => ({ ...prev, [current.residentId]: alerts }));
        if (alerts.length > 0) {
          RNAlert.alert(
            '확인 권장',
            `${current.name}님 — ${alerts.join(', ')}\n\n간호사에게 알림이 전달됐습니다.`,
            [{ text: '확인', onPress: () => (isLast ? finish() : goTo(index + 1)) }],
          );
          return;
        }
        if (isLast) finish();
        else goTo(index + 1);
      } catch (e) {
        // 가짜 성공 금지 — 실패하면 그 자리에 머문다(입력값 유지)
        setSaveError(`저장 실패: ${(e as Error)?.message ?? '네트워크를 확인하세요'}`);
      }
    })();
  };

  // ── 로딩 / 오류 / 빈 목록 ──
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLOR.primary} />
          <Text style={styles.centeredText}>입소자 명단 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorBig}>명단을 불러오지 못했습니다</Text>
          <Text style={styles.centeredText}>{(error as Error)?.message ?? '알 수 없는 오류'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorBig}>입소 중인 분이 없습니다</Text>
          <Text style={styles.centeredText}>웹에서 입소자를 등록한 뒤 이용하세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const already = measuredToday(current);
  const isLast = index >= residents.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 진행 표시 */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          <Text style={styles.progressNum}>{doneCount}</Text>
          <Text> / {residents.length}명 측정</Text>
        </Text>
        <Text style={styles.progressPos}>{index + 1}번째</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${(doneCount / residents.length) * 100}%` }]} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* 이 화면의 주인공 — 지금 이 한 분 */}
          <View style={styles.personCard}>
            <Text style={styles.personName}>{current.name}</Text>
            <Text style={styles.personRoom}>
              {current.room}
              {current.grade != null ? ` · ${current.grade}등급` : ''}
            </Text>
            {already ? (
              <View style={styles.doneChip}>
                <MaterialCommunityIcons name="check-circle" size={20} color={COLOR.success} />
                <Text style={styles.doneChipText}>
                  오늘 측정함
                  {current.measuredAt ? ` (${toKSTTime(current.measuredAt)})` : ''} · 다시 재면 새 기록으로 남습니다
                </Text>
              </View>
            ) : null}
          </View>

          <Field
            label="체온" unit="°C" field="temp" value={draft.temp}
            onChange={(v) => setDraft((d) => ({ ...d, temp: v }))}
          />
          <Field
            label="산소포화도" unit="%" field="spo2" value={draft.spo2}
            onChange={(v) => setDraft((d) => ({ ...d, spo2: v }))}
          />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              혈압 <Text style={styles.fieldUnit}>mmHg</Text>
            </Text>
            <View style={styles.bpRow}>
              <TextInput
                style={styles.input}
                value={draft.bpSys}
                onChangeText={(v) => setDraft((d) => ({ ...d, bpSys: v }))}
                keyboardType="number-pad"
                placeholder="수축기"
                placeholderTextColor={COLOR.textFaint}
                maxLength={3}
              />
              <Text style={styles.bpSlash}>/</Text>
              <TextInput
                style={styles.input}
                value={draft.bpDia}
                onChangeText={(v) => setDraft((d) => ({ ...d, bpDia: v }))}
                keyboardType="number-pad"
                placeholder="이완기"
                placeholderTextColor={COLOR.textFaint}
                maxLength={3}
              />
            </View>
            {[vitalRangeError('bpSys', draft.bpSys), vitalRangeError('bpDia', draft.bpDia)]
              .filter(Boolean)
              .map((m) => <Text key={m} style={styles.fieldError}>{m}</Text>)}
          </View>

          <Field
            label="맥박" unit="bpm" field="hr" value={draft.hr}
            onChange={(v) => setDraft((d) => ({ ...d, hr: v }))}
          />

          {/* 혈당은 당뇨 대상자만 — 웹 설정에서 지정한 사람에게만 뜬다(스키마 018: 격일) */}
          {current.bloodSugarTarget ? (
            <Field
              label="혈당" unit="mg/dL" field="bloodSugar" value={draft.bloodSugar}
              onChange={(v) => setDraft((d) => ({ ...d, bloodSugar: v }))}
              hint="당뇨 대상자 · 격일"
            />
          ) : null}

          {alerts.length > 0 ? (
            <View style={[styles.notice, styles.noticeAlert]}>
              <MaterialCommunityIcons name="alert" size={24} color={COLOR.danger} />
              <Text style={styles.noticeAlertText}>
                {alerts.join(', ')} — 확인이 필요합니다. 저장하면 간호사에게 알림이 갑니다.
              </Text>
            </View>
          ) : cautions.length > 0 ? (
            <View style={[styles.notice, styles.noticeCaution]}>
              <MaterialCommunityIcons name="information" size={24} color={COLOR.warning} />
              <Text style={styles.noticeCautionText}>{cautions.join(', ')} — 눈여겨보세요.</Text>
            </View>
          ) : null}

          {saveError ? (
            <View style={[styles.notice, styles.noticeAlert]}>
              <MaterialCommunityIcons name="close-circle" size={24} color={COLOR.danger} />
              <Text style={styles.noticeAlertText}>{saveError}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* 하단 고정 동작 — 이 화면에서 할 수 있는 일은 둘뿐 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => handleNext(true)}
            disabled={saving}
          >
            <Text style={styles.skipText}>{isLast ? '마치기' : '건너뛰기'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (saving || !hasAnyValue) && styles.saveBtnDim]}
            onPress={() => handleNext(false)}
            disabled={saving || !hasAnyValue}
          >
            {saving ? (
              <ActivityIndicator color={COLOR.onPrimary} />
            ) : (
              <Text style={styles.saveText}>
                {isLast ? '저장하고 마치기' : '저장하고 다음 분'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, unit, field, value, onChange, hint,
}: {
  label: string;
  unit: string;
  field: VitalField;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const err = vitalRangeError(field, value);
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        {label} <Text style={styles.fieldUnit}>{unit}</Text>
        {hint ? <Text style={styles.fieldHint}>  {hint}</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, styles.inputWide, !!err && styles.inputError]}
        value={value}
        onChangeText={onChange}
        keyboardType={field === 'temp' ? 'decimal-pad' : 'number-pad'}
        placeholder="—"
        placeholderTextColor={COLOR.textFaint}
        maxLength={5}
      />
      {err ? <Text style={styles.fieldError}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },

  progressBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm,
    backgroundColor: COLOR.surface,
  },
  progressText: { fontSize: FONT.body, color: COLOR.textSub },
  progressNum: { fontSize: FONT.metric, fontWeight: '700', color: COLOR.primary },
  progressPos: { fontSize: FONT.label, color: COLOR.textMuted },
  track: { height: 8, backgroundColor: COLOR.border },
  trackFill: { height: 8, backgroundColor: COLOR.success },

  content: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl },

  personCard: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.lg,
    padding: SPACE.xl, alignItems: 'center', gap: SPACE.xs,
    borderWidth: 1, borderColor: COLOR.border,
  },
  personName: { fontSize: FONT.display, fontWeight: '700', color: COLOR.text },
  personRoom: { fontSize: FONT.heading, color: COLOR.textSub },
  doneChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLOR.successBg, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginTop: SPACE.sm,
  },
  doneChipText: { flex: 1, fontSize: FONT.caption, color: COLOR.success, fontWeight: '600' },

  fieldBlock: { gap: SPACE.sm },
  fieldLabel: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  fieldUnit: { fontSize: FONT.label, fontWeight: '400', color: COLOR.textMuted },
  fieldHint: { fontSize: FONT.caption, fontWeight: '400', color: COLOR.textFaint },
  fieldError: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },

  input: {
    flex: 1, minHeight: TOUCH.large,
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md,
    borderWidth: 2, borderColor: COLOR.borderStrong,
    paddingHorizontal: SPACE.lg,
    fontSize: FONT.value, fontWeight: '700', color: COLOR.text,
    textAlign: 'center',
  },
  inputWide: { alignSelf: 'stretch' },
  inputError: { borderColor: COLOR.danger, backgroundColor: COLOR.dangerBg },
  bpRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  bpSlash: { fontSize: FONT.metric, color: COLOR.textMuted, fontWeight: '700' },

  notice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md,
    borderRadius: RADIUS.md, padding: SPACE.lg,
  },
  noticeAlert: { backgroundColor: COLOR.dangerBg },
  noticeAlertText: { flex: 1, fontSize: FONT.body, color: COLOR.danger, fontWeight: '600', lineHeight: 26 },
  noticeCaution: { backgroundColor: COLOR.warningBg },
  noticeCautionText: { flex: 1, fontSize: FONT.body, color: COLOR.warning, fontWeight: '600', lineHeight: 26 },

  footer: {
    flexDirection: 'row', gap: SPACE.md,
    padding: SPACE.lg, paddingBottom: SPACE.lg,
    backgroundColor: COLOR.surface,
    borderTopWidth: 1, borderTopColor: COLOR.border,
  },
  skipBtn: {
    minHeight: TOUCH.large, paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.md, backgroundColor: COLOR.border,
    alignItems: 'center', justifyContent: 'center',
  },
  skipText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
  saveBtn: {
    flex: 1, minHeight: TOUCH.large,
    borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDim: { opacity: 0.45 },
  saveText: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.onPrimary },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centeredText: { fontSize: FONT.body, color: COLOR.textMuted, textAlign: 'center' },
  errorBig: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, textAlign: 'center' },
  retryBtn: {
    minHeight: TOUCH.min, paddingHorizontal: SPACE.xl, justifyContent: 'center',
    borderRadius: RADIUS.md, backgroundColor: COLOR.primary, marginTop: SPACE.md,
  },
  retryBtnText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.onPrimary },
});
