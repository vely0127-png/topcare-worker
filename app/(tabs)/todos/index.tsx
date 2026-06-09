/**
 * 일일 투두리스트 탭 — 종사자 전용
 * AI 자동생성 + 관리자 지시 업무를 확인하고 체크하여 보고
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 카테고리 이모지/라벨
const CATEGORIES: Record<string, { emoji: string; label: string }> = {
  vital_check: { emoji: '💓', label: '바이탈' },
  medication: { emoji: '💊', label: '투약' },
  meal_assist: { emoji: '🍚', label: '식사' },
  bathing: { emoji: '🚿', label: '목욕' },
  diaper_change: { emoji: '🧷', label: '기저귀' },
  position_change: { emoji: '🔄', label: '체위변경' },
  exercise: { emoji: '🏃', label: '운동' },
  program: { emoji: '🎨', label: '프로그램' },
  observation: { emoji: '📝', label: '관찰' },
  cleaning: { emoji: '🧹', label: '환경정리' },
  report: { emoji: '📋', label: '인수인계' },
  guardian_request: { emoji: '📞', label: '보호자' },
  manager_task: { emoji: '⚡', label: '관리자지시' },
  other: { emoji: '📌', label: '기타' },
};

interface TodoItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  source: 'ai_generated' | 'manager_assigned' | 'carryover';
  residentName?: string;
  room?: string;
  scheduledTime?: string;
  dueTime?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completionNote?: string;
}

// Mock 투두 데이터
const INITIAL_TODOS: TodoItem[] = [
  { id: '1', title: '김순자 어르신 아침 바이탈 측정', description: '혈압, 맥박, 체온, SpO2', category: 'vital_check', priority: 'high', source: 'ai_generated', residentName: '김순자', room: '201호', scheduledTime: '07:00', dueTime: '08:00', status: 'completed', completionNote: '혈압 130/82' },
  { id: '2', title: '박영수 어르신 아침 투약', description: '고혈압약, 당뇨약', category: 'medication', priority: 'urgent', source: 'ai_generated', residentName: '박영수', room: '203호', scheduledTime: '07:30', dueTime: '08:00', status: 'completed' },
  { id: '3', title: '김순자 어르신 아침식사 보조', category: 'meal_assist', priority: 'normal', source: 'ai_generated', residentName: '김순자', room: '201호', scheduledTime: '08:00', dueTime: '09:00', status: 'in_progress' },
  { id: '4', title: '이영희 어르신 오전 목욕 보조', description: '피부 상태 관찰', category: 'bathing', priority: 'normal', source: 'ai_generated', residentName: '이영희', room: '205호', scheduledTime: '09:30', dueTime: '10:30', status: 'pending' },
  { id: '5', title: '김순자 어르신 체위 변경', description: '욕창 예방', category: 'position_change', priority: 'high', source: 'ai_generated', residentName: '김순자', room: '201호', scheduledTime: '10:00', dueTime: '10:30', status: 'pending' },
  { id: '6', title: '보호자 면회 대비 환경 정리', description: '205호 정리', category: 'manager_task', priority: 'high', source: 'manager_assigned', residentName: '이영희', room: '205호', scheduledTime: '13:00', dueTime: '13:30', status: 'pending' },
  { id: '7', title: '소방훈련 참여', description: '담당 어르신 대피 안내', category: 'manager_task', priority: 'urgent', source: 'manager_assigned', scheduledTime: '15:00', dueTime: '16:00', status: 'pending' },
  { id: '8', title: '근무 인수인계서 작성', category: 'report', priority: 'normal', source: 'ai_generated', scheduledTime: '16:30', dueTime: '17:00', status: 'pending' },
];

export default function TodosScreen() {
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [noteModal, setNoteModal] = useState<{ todoId: string; action: 'complete' | 'skip' } | null>(null);
  const [noteText, setNoteText] = useState('');

  const filtered = todos
    .filter(t => {
      if (filter === 'pending') return t.status === 'pending' || t.status === 'in_progress';
      if (filter === 'completed') return t.status === 'completed' || t.status === 'skipped';
      return true;
    })
    .sort((a, b) => (a.scheduledTime || '99').localeCompare(b.scheduledTime || '99'));

  const completedCount = todos.filter(t => t.status === 'completed').length;
  const totalCount = todos.length;
  const rate = Math.round((completedCount / totalCount) * 100);

  const handleToggle = (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (todo.status === 'completed') return; // 완료된 건 되돌리기 불가

    if (todo.status === 'pending') {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, status: 'in_progress' } : t));
    } else if (todo.status === 'in_progress') {
      setNoteModal({ todoId: id, action: 'complete' });
    }
  };

  const handleComplete = () => {
    if (!noteModal) return;
    setTodos(prev => prev.map(t =>
      t.id === noteModal.todoId
        ? { ...t, status: noteModal.action === 'complete' ? 'completed' : 'skipped', completionNote: noteText || undefined }
        : t
    ));
    setNoteModal(null);
    setNoteText('');
  };

  const handleSkip = (id: string) => {
    setNoteModal({ todoId: id, action: 'skip' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 상단 진행률 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>오늘의 업무</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${rate}%` }]} />
          </View>
          <Text style={styles.progressText}>{completedCount}/{totalCount} ({rate}%)</Text>
        </View>
      </View>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'completed'] as const).map(f => (
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

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.map(todo => {
          const cat = CATEGORIES[todo.category] || CATEGORIES.other;
          return (
            <TouchableOpacity
              key={todo.id}
              style={[styles.todoCard, todo.status === 'completed' && styles.todoDone]}
              onPress={() => handleToggle(todo.id)}
              onLongPress={() => {
                if (todo.status !== 'completed') handleSkip(todo.id);
              }}
            >
              {/* 체크 */}
              <View style={[
                styles.check,
                todo.status === 'completed' && styles.checkDone,
                todo.status === 'in_progress' && styles.checkProgress,
              ]}>
                {todo.status === 'completed' && <Text style={styles.checkMark}>✓</Text>}
                {todo.status === 'in_progress' && <View style={styles.progressDot} />}
              </View>

              {/* 콘텐츠 */}
              <View style={styles.todoContent}>
                <View style={styles.tagRow}>
                  <Text style={styles.catTag}>{cat.emoji} {cat.label}</Text>
                  {todo.source === 'manager_assigned' && (
                    <Text style={styles.managerTag}>⚡ 관리자</Text>
                  )}
                  {todo.priority === 'urgent' && (
                    <Text style={styles.urgentTag}>긴급</Text>
                  )}
                </View>
                <Text style={[styles.todoTitle, todo.status === 'completed' && styles.todoTitleDone]}>
                  {todo.title}
                </Text>
                {todo.description && (
                  <Text style={styles.todoDesc}>{todo.description}</Text>
                )}
                {todo.completionNote && (
                  <Text style={styles.noteText}>✓ {todo.completionNote}</Text>
                )}
              </View>

              {/* 시간 & 대상 */}
              <View style={styles.todoRight}>
                <Text style={styles.timeText}>{todo.scheduledTime || '--:--'}</Text>
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
              {noteModal.action === 'complete' ? '완료 메모를 남겨주세요 (선택)' : '사유를 입력해주세요'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={noteModal.action === 'complete' ? '예: 혈압 130/82, 정상' : '예: 어르신 외출 중'}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setNoteModal(null); setNoteText(''); }}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, noteModal.action === 'skip' && styles.modalSkipBtn]}
                onPress={handleComplete}
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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  progressBar: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#34D399', borderRadius: 4 },
  progressText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterActive: { backgroundColor: '#1A5276' },
  filterText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 12, gap: 8 },
  todoCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  todoDone: { opacity: 0.5 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkProgress: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' },
  todoContent: { flex: 1 },
  tagRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 4 },
  catTag: { fontSize: 10, backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#374151' },
  managerTag: { fontSize: 10, backgroundColor: '#FFF7ED', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#C2410C' },
  urgentTag: { fontSize: 10, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#DC2626', fontWeight: '700' },
  todoTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  todoTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  todoDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  noteText: { fontSize: 11, color: '#16A34A', marginTop: 4, backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  todoRight: { alignItems: 'flex-end', minWidth: 50 },
  timeText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  residentText: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  // Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  modalCancelText: { fontSize: 14, color: '#6B7280' },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#16A34A', alignItems: 'center' },
  modalSkipBtn: { backgroundColor: '#F59E0B' },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
