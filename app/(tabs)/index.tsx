/**
 * 오늘 할 일 — 정본 6단계 중 5단계: "요양보호사가 담당 서비스 목록을 확인하고 체크"
 * (P0-2·3, 2026-07-27 워커 감사 재작성 — 이전엔 전면 하드코딩 mock)
 *
 * 2026-08-05: 행 구성·체크 로직을 lib/hooks/useTodayTasks로 추출 —
 * 근접 탭(비콘 현재 위치 업무)과 공유. 규약(웹 ServiceTodoList 미러)은 훅 참조.
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTodayTasks, type DisplayRow } from '../../lib/hooks/useTodayTasks';
import { serviceTypeLabel } from '../../lib/care/service-rules';

export default function TodayTasksScreen() {
  const {
    rows, residents, provisionFor, toggle, pendingKeys, doneCount, loading, fetchError, refetchAll,
  } = useTodayTasks();

  const onToggle = (row: DisplayRow) =>
    void toggle(
      row,
      (msg) => Alert.alert('확인 필요', msg),
      (msg) => Alert.alert('저장 실패', msg),
    );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetchAll} />}
      >
        {/* 헤더 — 날짜 + 진행률 */}
        <View style={styles.dateCard}>
          <Text style={styles.dateText}>{format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}</Text>
          <Text style={styles.progressText}>오늘 서비스 {doneCount}/{rows.length} 완료</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${rows.length ? Math.round((doneCount / rows.length) * 100) : 0}%` }]} />
          </View>
          <Text style={styles.hintText}>체크 = 급여제공기록(초안) 생성 — 관찰·식사·투약 기록에 자동 반영됩니다</Text>
        </View>

        {/* 오류 — 목데이터 폴백 금지, 정직하게 */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBox} onPress={refetchAll}>
            <Text style={styles.errorText}>불러오기 실패: {fetchError}</Text>
            <Text style={styles.errorRetry}>탭하여 다시 시도</Text>
          </TouchableOpacity>
        )}

        {/* 목록 */}
        {loading && rows.length === 0 ? (
          <View style={styles.centerBox}><ActivityIndicator size="large" color="#1A9A8A" /></View>
        ) : rows.length === 0 && !fetchError ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>
              {residents.length === 0
                ? '등록된 입소자가 없습니다'
                : '오늘 계획이 없습니다 — 관리자 웹의 설정>일과표 또는 [계획 추가]에서 등록됩니다'}
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            const done = Boolean(provisionFor(row));
            const busy = pendingKeys.has(row.key);
            return (
              <TouchableOpacity
                key={row.key}
                style={[styles.taskItem, done && styles.taskDone]}
                onPress={() => onToggle(row)}
                disabled={busy}
              >
                <Text style={styles.taskTime}>{row.plannedStart ?? '--:--'}</Text>
                <View style={[styles.taskCheck, done && styles.taskCheckDone]}>
                  {busy ? <ActivityIndicator size="small" color={done ? '#fff' : '#1A9A8A'} />
                    : done ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>
                    {row.residentName} — {row.note || serviceTypeLabel(row.serviceType)}
                  </Text>
                  <Text style={styles.taskMeta}>{serviceTypeLabel(row.serviceType)} · {row.dayLabel}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.footNote}>
          ※ 이 목록의 목적은 서비스제공기록지 작성입니다. 확정은 관리자가 웹에서 수행하며,
          비콘 근접 시 근접/출퇴근 탭에서 해당 위치의 업무가 자동으로 제시됩니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 10 },
  dateCard: { backgroundColor: '#134E4A', borderRadius: 12, padding: 16, gap: 6 },
  dateText: { color: '#fff', fontSize: 14, opacity: 0.85 },
  progressText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#2DD4BF' },
  hintText: { color: '#fff', fontSize: 11, opacity: 0.7, marginTop: 2 },
  errorBox: { backgroundColor: '#FEE2E2', borderColor: '#DC2626', borderWidth: 1, borderRadius: 8, padding: 12 },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '600' },
  errorRetry: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  centerBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  taskItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB', minHeight: 64, // 장갑 낀 손 — 큰 터치 영역
  },
  taskDone: { backgroundColor: '#F0FDFA', borderColor: '#2DD4BF' },
  taskTime: { width: 44, fontSize: 13, fontVariant: ['tabular-nums'], color: '#6B7280', fontWeight: '600' },
  taskCheck: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckDone: { backgroundColor: '#1A9A8A', borderColor: '#1A9A8A' },
  checkmark: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#6B7280' },
  taskMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  footNote: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, marginTop: 8, marginBottom: 24 },
});
