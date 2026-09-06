/**
 * 프로그램 회차 기록 — 참여자 체크 + 참여도 (vc9 / PoC2 피드백 #12)
 *
 * 왜 있나
 *   #12 조사에서 확인된 공백은 회차 자체가 아니라 **참여자 개인별 평가**였다.
 *   웹에는 모달이 생겼지만(1a97380) 프로그램은 현장에서 진행되므로 폰에서 끝나야
 *   종이 → 웹 이중 입력이 사라진다.
 *
 * 답하는 질문
 *   "누가 참여했지?" / "이분 참여도는?" / "이 회차 기록 끝났나?"
 *
 * 소스
 *   GET  /api/schedule/programs/today            — 회차·참여 대상(그룹원)
 *   POST /api/schedule/programs/provisions       — 저장(참여자별 급여제공기록까지 서버가 연계)
 *
 * 설계 결정
 *   - 참여자는 **전원 선택이 기본**이고 해제할 수 있다. 프로그램은 그룹 단위로 진행되므로
 *     "빠진 사람을 지우는" 쪽이 현장 동작이다(전원 체크하는 것이 아니라).
 *   - 참여도는 **미입력을 허용**한다. 안 본 것을 '중'으로 채우지 않는다(서버도 미입력은 저장 안 함).
 *   - [전원 상] 1탭 — 웹 모달과 같은 편의. 누른 뒤 개별 조정 가능.
 *   - 이미 기록된 회차는 여기서 또 만들지 않는다(같은 회차가 두 줄로 남지 않게). 수정은 웹.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Alert } from '@/lib/ui/alert';
import { useSession } from '@/lib/hooks/useAuth';
import {
  useProgramsToday, useCreateProgramProvision,
  type ParticipantResultEntry, type ResultGrade,
} from '@/lib/hooks/usePrograms';
import { QueuedOfflineError } from '@/lib/queue/offline-queue';
import { getKSTToday } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

const GRADES: ResultGrade[] = ['상', '중', '하'];

export default function ProgramRecordScreen() {
  const router = useRouter();
  const session = useSession();
  const { programId } = useLocalSearchParams<{ programId?: string }>();
  const q = useProgramsToday();
  const { mutateAsync: createProvision, isPending: isSaving } = useCreateProgramProvision();

  const planned = useMemo(
    () => (q.data?.planned ?? []).find((p) => p.programId === programId) ?? null,
    [q.data, programId],
  );
  const alreadyRecorded = useMemo(
    () => (q.data?.recordedToday ?? []).find((p) => p.programId === programId) ?? null,
    [q.data, programId],
  );
  const row = planned ?? alreadyRecorded;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [grades, setGrades] = useState<Record<string, ResultGrade>>({});
  const [notes, setNotes] = useState('');
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  // 참여자 기본값 = 전원 선택 (회차가 바뀌면 다시 초기화)
  useEffect(() => {
    if (!row || initializedFor === row.programId) return;
    setChecked(new Set(row.participantIds));
    setGrades({});
    setInitializedFor(row.programId);
  }, [row, initializedFor]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setGrade = (id: string, grade: ResultGrade) => {
    setGrades((prev) => (prev[id] === grade
      ? (() => { const next = { ...prev }; delete next[id]; return next; })() // 같은 값 재탭 = 해제(미입력)
      : { ...prev, [id]: grade }));
  };

  const allTop = () => {
    const next: Record<string, ResultGrade> = {};
    for (const id of checked) next[id] = '상';
    setGrades(next);
  };

  const save = async () => {
    if (!row) return;
    const participantIds = row.participantIds.filter((id) => checked.has(id));
    if (participantIds.length === 0) {
      Alert.alert('참여자를 확인해주세요', '참여한 어르신이 한 분도 선택되지 않았습니다.');
      return;
    }
    // 참여 체크된 사람의 입력만 보낸다 — 해제된 사람에게 평가가 붙지 않게(서버도 다시 걸러낸다)
    const participantResults: Record<string, ParticipantResultEntry> = {};
    for (const id of participantIds) {
      const g = grades[id];
      if (g) participantResults[id] = { participation: g };
    }

    try {
      const saved = await createProvision({
        programId: row.programId,
        provisionDate: getKSTToday(),
        participantIds,
        participantCount: participantIds.length,
        leadStaffId: session?.user.staffId ?? null,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(Object.keys(participantResults).length > 0 ? { participantResults } : {}),
      });
      // 서버가 알려준 연계 결과를 그대로 전한다 — 0이면 "저장됐다"고만 말하지 않는다
      const linkNote = saved.serviceProvisionsCreated > 0
        ? `참여자 ${saved.serviceProvisionsCreated}명의 급여제공기록에도 반영했습니다.`
        : '⚠ 급여제공기록 연계가 되지 않았습니다 — 웹에서 확인이 필요합니다.';
      Alert.alert('기록 저장됨', `${row.programName} · 참여 ${participantIds.length}명\n${linkNote}`);
      void q.refetch();
      router.back();
    } catch (e: any) {
      // 오프라인 큐(2026-09-06 vc11) — 전파가 약해 큐에 들어간 것은 실패가 아니다.
      // 급여제공기록 연계는 전송 후에나 알 수 있으므로 여기서는 "대기 중"만 알린다.
      if (e instanceof QueuedOfflineError) {
        Alert.alert(
          '대기 중',
          `${row.programName} · 참여 ${participantIds.length}명\n${e.message}\n\n급여제공기록 연계 여부는 전송 뒤 웹에서 확인하세요.`,
        );
        router.back();
        return;
      }
      Alert.alert('저장 실패', e?.message ?? '네트워크를 확인하고 다시 시도하세요');
    }
  };

  // ── 상태별 화면 ──────────────────────────────────────────────
  if (q.isLoading) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}><ActivityIndicator size="large" color={COLOR.primary} /></View>
      </SafeAreaView>
    );
  }

  if (q.isError) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}>
          <Text style={st.errorText}>회차 정보를 불러오지 못했습니다 — {q.error?.message}</Text>
          <TouchableOpacity style={st.retryBtn} onPress={() => void q.refetch()}>
            <Text style={st.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!row) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}>
          <MaterialCommunityIcons name="calendar-remove-outline" size={48} color={COLOR.textFaint} />
          <Text style={st.emptyText}>이 회차를 찾을 수 없습니다</Text>
          <Text style={st.emptyHint}>일정이 바뀌었을 수 있습니다 — 목록으로 돌아가 다시 확인하세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyRecorded) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}>
          <MaterialCommunityIcons name="check-circle" size={48} color={COLOR.success} />
          <Text style={st.emptyText}>{row.programName} — 오늘 이미 기록됨</Text>
          <Text style={st.emptyHint}>
            같은 회차를 두 번 기록하지 않습니다. 내용 수정은 웹 [프로그램]에서 하세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const gradedCount = row.participantIds.filter((id) => checked.has(id) && grades[id]).length;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.scroll}>
        <View style={st.header}>
          <Text style={st.time}>{row.time}</Text>
          <Text style={st.name}>{row.programName}</Text>
          {row.groupNames.length > 0 ? <Text style={st.meta}>{row.groupNames.join(' · ')}</Text> : null}
        </View>

        <View style={st.summaryRow}>
          <Text style={st.summary}>참여 {checked.size} / {row.participantIds.length}명 · 참여도 입력 {gradedCount}명</Text>
          <TouchableOpacity style={st.allTopBtn} onPress={allTop}>
            <Text style={st.allTopText}>전원 상</Text>
          </TouchableOpacity>
        </View>

        {row.participantIds.length === 0 ? (
          <View style={st.center}>
            <Text style={st.emptyText}>참여 대상 어르신이 없습니다</Text>
            <Text style={st.emptyHint}>
              웹 [프로그램]에서 이 프로그램의 그룹·명단을 지정하면 여기 나타납니다.
            </Text>
          </View>
        ) : null}

        {row.participantIds.map((id, i) => {
          const on = checked.has(id);
          const grade = grades[id];
          return (
            <View key={id} style={[st.personCard, !on && st.personCardOff]}>
              <TouchableOpacity style={st.personRow} onPress={() => toggle(id)}>
                <MaterialCommunityIcons
                  name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={32}
                  color={on ? COLOR.primary : COLOR.borderStrong}
                />
                <Text style={[st.personName, !on && st.personNameOff]}>
                  {row.participantNames[i] ?? '(이름 없음)'}
                </Text>
                {!on ? <Text style={st.absentTag}>불참</Text> : null}
              </TouchableOpacity>
              {on ? (
                <View style={st.gradeRow}>
                  {GRADES.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[st.gradeBtn, grade === g && st.gradeBtnOn]}
                      onPress={() => setGrade(id, g)}
                    >
                      <Text style={[st.gradeText, grade === g && st.gradeTextOn]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {row.unresolvedMembers.length > 0 ? (
          <Text style={st.warn}>
            명단의 {row.unresolvedMembers.join(', ')} 은(는) 입소자와 연결되지 않아 참여자에 넣을 수 없습니다 —
            웹 그룹 설정에서 확인하세요.
          </Text>
        ) : null}

        <Text style={st.label}>회차 관찰 메모 (선택)</Text>
        <TextInput
          style={st.textArea}
          value={notes}
          onChangeText={setNotes}
          placeholder="전체 분위기·특이사항이 있으면 적어주세요"
          placeholderTextColor={COLOR.textFaint}
          multiline
        />

        <TouchableOpacity
          style={[st.saveBtn, isSaving && st.saveBtnDisabled]}
          disabled={isSaving}
          onPress={() => void save()}
        >
          {isSaving
            ? <ActivityIndicator color={COLOR.onPrimary} />
            : <Text style={st.saveText}>참여 {checked.size}명으로 기록 저장</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLOR.bg },
  scroll: { padding: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.md },
  center: { alignItems: 'center', paddingVertical: SPACE.xxl, gap: SPACE.md },
  emptyText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub, textAlign: 'center' },
  emptyHint: { fontSize: FONT.caption, color: COLOR.textMuted, textAlign: 'center', paddingHorizontal: SPACE.xl, lineHeight: 20 },
  errorText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: COLOR.danger, borderRadius: RADIUS.sm, minHeight: TOUCH.min, paddingHorizontal: SPACE.xl, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },

  header: { gap: 2 },
  time: { fontSize: FONT.label, fontWeight: '700', color: COLOR.primary },
  name: { fontSize: FONT.title, fontWeight: '800', color: COLOR.text },
  meta: { fontSize: FONT.caption, color: COLOR.textMuted },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  summary: { flex: 1, fontSize: FONT.label, fontWeight: '600', color: COLOR.textSub },
  allTopBtn: {
    minHeight: TOUCH.min, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLOR.primary, alignItems: 'center', justifyContent: 'center',
  },
  allTopText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.primary },

  personCard: {
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.border,
    backgroundColor: COLOR.surface, padding: SPACE.md, gap: SPACE.sm,
  },
  personCardOff: { backgroundColor: COLOR.bg, borderColor: COLOR.border },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH.min },
  personName: { flex: 1, fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  personNameOff: { color: COLOR.textFaint },
  absentTag: { fontSize: FONT.caption, fontWeight: '700', color: COLOR.textMuted },

  gradeRow: { flexDirection: 'row', gap: SPACE.sm },
  gradeBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLOR.borderStrong, backgroundColor: COLOR.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  gradeBtnOn: { backgroundColor: COLOR.primary, borderColor: COLOR.primary },
  gradeText: { fontSize: FONT.body, fontWeight: '800', color: COLOR.textSub },
  gradeTextOn: { color: COLOR.onPrimary },

  warn: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '600', lineHeight: 20 },
  label: { fontSize: FONT.label, fontWeight: '700', color: COLOR.text, marginTop: SPACE.sm },
  textArea: {
    minHeight: 96, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderStrong,
    backgroundColor: COLOR.surface, padding: SPACE.md,
    fontSize: FONT.body, color: COLOR.text, textAlignVertical: 'top',
  },

  saveBtn: {
    minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: SPACE.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '800' },
});
