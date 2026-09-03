/**
 * 오늘 프로그램 — 회차 목록 (vc9 / PoC2 피드백 #12·#14)
 *
 * 왜 있나
 *   사회복지사 홈의 '프로그램' 칩은 href 가 없어 표시조차 안 되던 죽은 항목이었다.
 *   프로그램 진행은 케어 행위인데(#14 대표 확정) 앱에서 기록할 방법이 없어,
 *   현장에서 종이에 적고 사무실 웹에 다시 입력하는 이중 입력이 남아 있었다.
 *
 * 답하는 질문
 *   "오늘 무슨 프로그램이 몇 시에 있지?" / "누가 참여 대상이지?" / "이 회차 기록했나?"
 *
 * 소스
 *   GET /api/schedule/programs/today — 오늘 요일 회차(예정/기록됨) + 최근 7일 미기록
 *
 * 정직성
 *   - 0건이면 "오늘 예정된 프로그램이 없습니다" 라고 쓴다(가짜 목록·목데이터 없음).
 *   - 조회 실패는 빈 목록으로 위장하지 않는다(오류 문구 + [다시 시도]).
 *   - 그룹원 중 입소자와 연결하지 못한 이름은 감추지 않고 그 수를 적는다.
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useProgramsToday, type PlannedProgram } from '@/lib/hooks/usePrograms';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export default function ProgramsScreen() {
  const router = useRouter();
  const q = useProgramsToday();

  const planned = q.data?.planned ?? [];
  const recorded = q.data?.recordedToday ?? [];
  const missed = q.data?.missed ?? [];

  const renderRow = (row: PlannedProgram, done: boolean) => (
    <TouchableOpacity
      key={row.programId}
      style={[st.row, done && st.rowDone]}
      disabled={done}
      onPress={() => router.push({ pathname: '/(tabs)/programs/record', params: { programId: row.programId } })}
    >
      <Text style={[st.mark, done && st.markDone]}>{done ? '✓' : '○'}</Text>
      <View style={st.grow}>
        <Text style={st.time}>{row.time}</Text>
        <Text style={st.name}>{row.programName}</Text>
        <Text style={st.meta}>
          {row.groupNames.length > 0 ? `${row.groupNames.join(' · ')} · ` : ''}
          참여 대상 {row.participantIds.length}명
        </Text>
        {row.unresolvedMembers.length > 0 ? (
          <Text style={st.warn}>
            명단 {row.unresolvedMembers.length}명은 입소자와 연결되지 않아 참여자에서 빠집니다
            ({row.unresolvedMembers.slice(0, 3).join(', ')}
            {row.unresolvedMembers.length > 3 ? ' 외' : ''}) — 웹 그룹 설정에서 확인하세요
          </Text>
        ) : null}
      </View>
      {done ? (
        <Text style={st.doneTag}>기록됨</Text>
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={32} color={COLOR.textFaint} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={!!q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        {q.isError ? (
          <View style={st.errorBanner}>
            <Text style={st.errorText}>오늘 프로그램을 불러오지 못했습니다 — {q.error?.message}</Text>
            <TouchableOpacity style={st.retryBtn} onPress={() => void q.refetch()}>
              <Text style={st.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {q.isLoading ? (
          <View style={st.center}><ActivityIndicator size="large" color={COLOR.primary} /></View>
        ) : null}

        {!q.isLoading && !q.isError && planned.length === 0 && recorded.length === 0 ? (
          <View style={st.center}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={COLOR.textFaint} />
            <Text style={st.emptyText}>오늘 예정된 프로그램이 없습니다</Text>
            <Text style={st.emptyHint}>
              웹 [요양업무 {'>'} 기록 {'>'} 프로그램]에서 주간 일정을 저장하면 그 요일에 여기 나타납니다
            </Text>
          </View>
        ) : null}

        {planned.length > 0 ? (
          <View style={st.section}>
            <Text style={st.sectionTitle}>기록할 회차 {planned.length}건</Text>
            {planned.map((row) => renderRow(row, false))}
          </View>
        ) : null}

        {recorded.length > 0 ? (
          <View style={st.section}>
            <Text style={st.sectionTitle}>오늘 기록 완료 {recorded.length}건</Text>
            {recorded.map((row) => renderRow(row, true))}
          </View>
        ) : null}

        {/* 최근 미기록 — 경고까지만. 앱이 지난 회차를 만들어 주지 않는다(없던 프로그램 창작 금지) */}
        {missed.length > 0 ? (
          <View style={st.section}>
            <Text style={st.sectionTitle}>최근 7일 미기록 {missed.length}건</Text>
            <Text style={st.missedHint}>
              지난 회차는 앱에서 만들지 않습니다 — 실제로 진행했다면 웹에서 그 날짜로 기록하세요.
            </Text>
            {missed.slice(0, 10).map((m) => (
              <View key={`${m.programId}-${m.date}`} style={st.missedRow}>
                <Text style={st.missedText}>
                  {m.date}({m.dayLabel}) {m.time} · {m.programName}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLOR.bg },
  scroll: { padding: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  center: { alignItems: 'center', paddingVertical: SPACE.xxl * 2, gap: SPACE.md },
  emptyText: { fontSize: FONT.body, fontWeight: '600', color: COLOR.textSub },
  emptyHint: { fontSize: FONT.caption, color: COLOR.textMuted, textAlign: 'center', paddingHorizontal: SPACE.xl, lineHeight: 20 },
  grow: { flex: 1 },

  errorBanner: { backgroundColor: COLOR.dangerBg, borderRadius: RADIUS.md, padding: SPACE.lg, gap: SPACE.sm },
  errorText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },
  retryBtn: { backgroundColor: COLOR.danger, borderRadius: RADIUS.sm, minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },

  section: { gap: SPACE.sm },
  sectionTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: TOUCH.menu, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface,
  },
  rowDone: { backgroundColor: COLOR.successBg, borderColor: COLOR.successBg },
  mark: { fontSize: FONT.heading, fontWeight: '800', color: COLOR.borderStrong, width: 26, textAlign: 'center' },
  markDone: { color: COLOR.success },
  time: { fontSize: FONT.label, fontWeight: '700', color: COLOR.primary },
  name: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text, marginTop: 2 },
  meta: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  warn: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '600', marginTop: 4, lineHeight: 19 },
  doneTag: { fontSize: FONT.caption, fontWeight: '700', color: COLOR.success },

  missedHint: { fontSize: FONT.caption, color: COLOR.textMuted, lineHeight: 20 },
  missedRow: {
    minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md, backgroundColor: COLOR.warningBg,
  },
  missedText: { fontSize: FONT.label, color: COLOR.text, fontWeight: '600' },
});
