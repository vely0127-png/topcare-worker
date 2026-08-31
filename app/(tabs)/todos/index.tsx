/**
 * 일일 투두리스트 탭 — GET/PATCH /api/todos 실데이터
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { Alert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useTodos, useTodoPatch, toDisplayStatus, toApiStatus, deriveSource,
  type Todo,
} from '../../../lib/hooks/useTodos';
import { useSession } from '../../../lib/hooks/useAuth';

const CATEGORIES: Record<string, { emoji: string; label: string }> = {
  vital_check:    { emoji: '💓', label: '바이탈' },
  medication:     { emoji: '💊', label: '투약' },
  meal_assist:    { emoji: '🍚', label: '식사' },
  bathing:        { emoji: '🚿', label: '목욕' },
  diaper_change:  { emoji: '🧷', label: '기저귀' },
  position_change:{ emoji: '🔄', label: '체위변경' },
  exercise:       { emoji: '🏃', label: '운동' },
  program:        { emoji: '🎨', label: '프로그램' },
  observation:    { emoji: '📝', label: '관찰' },
  cleaning:       { emoji: '🧹', label: '환경정리' },
  report:         { emoji: '📋', label: '인수인계' },
  guardian_request:{ emoji: '📞', label: '보호자' },
  manager_task:   { emoji: '⚡', label: '관리자지시' },
  other:          { emoji: '📌', label: '기타' },
};

type DisplayStatus = 'pending' | 'in_progress' | 'completed';
type FilterTab = 'all' | 'pending' | 'completed';

export default function TodosScreen() {
  // P1(2026-07-27): 기관 전체 투두가 아니라 "나에게 배정된 것 + 미배정 공용"만 —
  // assignedTo 필터는 웹이 지원. staffId 없으면(계정-직원 미연결) 전체 노출 유지(정직).
  const session = useSession();
  const staffId = session?.user.staffId ?? undefined;
  const { data, isLoading, isError, error, refetch, isRefetching } = useTodos(
    staffId ? { assignedTo: staffId } : undefined,
  );
  const { mutate: patchTodo, isPending: isPatching } = useTodoPatch();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [noteModal, setNoteModal] = useState<{ todoId: string; action: 'complete' | 'skip' } | null>(null);
  const [noteText, setNoteText] = useState('');
  // 낙관적 UI: 업데이트 중인 항목 ID 추적
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const todos: Todo[] = data?.items ?? [];

  const filtered = todos
    .filter((t) => {
      const ds = toDisplayStatus(t.status);
      if (filter === 'pending') return ds === 'pending' || ds === 'in_progress';
      if (filter === 'completed') return ds === 'completed';
      return true;
    })
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const completedCount = todos.filter(t => t.status === 'done').length;
  const totalCount = todos.length;
  const rate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggle = (todo: Todo) => {
    const ds = toDisplayStatus(todo.status);
    if (ds === 'completed') return;

    if (ds === 'pending') {
      // pending → in_progress
      setUpdatingIds(prev => new Set(prev).add(todo.id));
      patchTodo(
        { id: todo.id, status: 'in_progress' },
        {
          onSettled: () =>
            setUpdatingIds(prev => { const s = new Set(prev); s.delete(todo.id); return s; }),
        },
      );
    } else {
      // in_progress → 완료 모달
      setNoteModal({ todoId: todo.id, action: 'complete' });
    }
  };

  const handleSkip = (todo: Todo) => {
    const ds = toDisplayStatus(todo.status);
    if (ds === 'completed') return;
    setNoteModal({ todoId: todo.id, action: 'skip' });
  };

  const handleConfirm = () => {
    if (!noteModal) return;
    const { todoId, action } = noteModal;
    setNoteModal(null);

    setUpdatingIds(prev => new Set(prev).add(todoId));
    patchTodo(
      {
        id: todoId,
        status: toApiStatus(action === 'complete' ? 'completed' : 'skip'),
        ...(noteText ? { description: noteText } : {}),
      },
      {
        onSettled: () =>
          setUpdatingIds(prev => { const s = new Set(prev); s.delete(todoId); return s; }),
      },
    );
    setNoteText('');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A5276" />
          <Text style={styles.loadingText}>업무 목록 로딩 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 상단 진행률 (제목은 네비게이션 헤더가 표시 — 2026-08-06 탭바 제거) */}
      <View style={styles.header}>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${rate}%` as `${number}%` }]} />
          </View>
          <Text style={styles.progressText}>{completedCount}/{totalCount} ({rate}%)</Text>
        </View>
      </View>

      {isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{(error as Error)?.message ?? '로드 실패'}</Text>
          <TouchableOpacity onPress={() => void refetch()}>
            <Text style={styles.retryText}>재시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 필터 */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'completed'] as FilterTab[]).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? '전체' : f === 'pending' ? '미완료' : '완료'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {filtered.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>업무가 없습니다</Text>
          </View>
        )}
        {filtered.map((todo) => {
          const cat = CATEGORIES[todo.category ?? 'other'] ?? CATEGORIES.other;
          const ds: DisplayStatus = toDisplayStatus(todo.status);
          const source = deriveSource(todo.category);
          const isUpdating = updatingIds.has(todo.id);

          return (
            <TouchableOpacity
              key={todo.id}
              style={[styles.todoCard, ds === 'completed' && styles.todoDone]}
              onPress={() => handleToggle(todo)}
              onLongPress={() => handleSkip(todo)}
              disabled={isUpdating || isPatching}
            >
              {/* 체크 */}
              <View style={[
                styles.check,
                ds === 'completed' && styles.checkDone,
                ds === 'in_progress' && styles.checkProgress,
              ]}>
                {isUpdating
                  ? <ActivityIndicator size="small" color="#6B7280" />
                  : ds === 'completed'
                    ? <Text style={styles.checkMark}>✓</Text>
                    : ds === 'in_progress'
                      ? <View style={styles.progressDot} />
                      : null
                }
              </View>

              {/* 콘텐츠 */}
              <View style={styles.todoContent}>
                <View style={styles.tagRow}>
                  <Text style={styles.catTag}>{cat.emoji} {cat.label}</Text>
                  {source === 'manager_assigned' && (
                    <Text style={styles.managerTag}>⚡ 관리자</Text>
                  )}
                  {todo.priority === 'urgent' && (
                    <Text style={styles.urgentTag}>긴급</Text>
                  )}
                </View>
                <Text style={[styles.todoTitle, ds === 'completed' && styles.todoTitleDone]}>
                  {todo.title}
                </Text>
                {todo.description && (
                  <Text style={styles.todoDesc}>{todo.description}</Text>
                )}
              </View>

              {/* 날짜 & 대상 */}
              <View style={styles.todoRight}>
                <Text style={styles.timeText}>{todo.dueDate ?? '--'}</Text>
                {todo.residentName && (
                  <Text style={styles.residentText}>{todo.residentName}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 완료/스킵 메모 모달 */}
      {noteModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {noteModal.action === 'complete' ? '업무 완료' : '업무 건너뛰기'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {noteModal.action === 'complete' ? '완료 메모 (선택)' : '사유를 입력해주세요'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={noteModal.action === 'complete' ? '예: 혈압 130/82, 정상' : '예: 어르신 외출 중'}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setNoteModal(null); setNoteText(''); }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, noteModal.action === 'skip' && styles.modalSkipBtn]}
                onPress={handleConfirm}
              >
                <Text style={styles.modalConfirmText}>
                  {noteModal.action === 'complete' ? '완료' : '건너뛰기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#1A5276', padding: 16, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  progressBar: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#34D399', borderRadius: 4 },
  progressText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBanner: {
    backgroundColor: '#FEE2E2', padding: 12, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  errorText: { fontSize: 16, color: '#DC2626', flex: 1 },
  retryText: { fontSize: 16, color: '#DC2626', fontWeight: '700', marginLeft: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#6B7280', marginTop: 12, fontSize: 16 },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterActive: { backgroundColor: '#1A5276' },
  filterText: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 12, gap: 8 },
  emptyContainer: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#9CA3AF', fontSize: 17 },
  todoCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, gap: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  todoDone: { opacity: 0.5 },
  check: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkProgress: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  checkMark: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' },
  todoContent: { flex: 1 },
  tagRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 4 },
  catTag: {
    fontSize: 14, backgroundColor: '#F3F4F6', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4, color: '#374151',
  },
  managerTag: {
    fontSize: 14, backgroundColor: '#FFF7ED', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4, color: '#C2410C',
  },
  urgentTag: {
    fontSize: 14, backgroundColor: '#FEE2E2', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4, color: '#DC2626', fontWeight: '700',
  },
  todoTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  todoTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  todoDesc: { fontSize: 15, color: '#6B7280', marginTop: 2 },
  todoRight: { alignItems: 'flex-end', minWidth: 56 },
  timeText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  residentText: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center',
    alignItems: 'center', padding: 24,
  },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 16, color: '#6B7280', marginTop: 4, marginBottom: 12 },
  modalInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12,
    fontSize: 16, minHeight: 60, textAlignVertical: 'top',
  },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  modalCancelText: { fontSize: 16, color: '#6B7280' },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#16A34A', alignItems: 'center' },
  modalSkipBtn: { backgroundColor: '#F59E0B' },
  modalConfirmText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
