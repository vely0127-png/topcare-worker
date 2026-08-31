/**
 * 관찰 기록 화면 — GET/POST /api/care/records?recordType=observation
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { Alert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResidents } from '../../../lib/hooks/useResidents';
import { useCareRecords, useCareRecordCreate } from '../../../lib/hooks/useCareRecords';
import { useSession } from '../../../lib/hooks/useAuth';
import { getKSTToday } from '../../../lib/utils/date';

const OBSERVATION_CATEGORIES = [
  { id: 'general',   label: '전반 상태', emoji: '👀' },
  { id: 'mood',      label: '기분/정서', emoji: '😊' },
  { id: 'skin',      label: '피부 상태', emoji: '🩹' },
  { id: 'mobility',  label: '이동/보행', emoji: '🚶' },
  { id: 'appetite',  label: '식욕/섭취', emoji: '🍽️' },
  { id: 'sleep',     label: '수면',      emoji: '😴' },
  { id: 'pain',      label: '통증',      emoji: '⚠️' },
  { id: 'other',     label: '기타',      emoji: '📝' },
];

const QUICK_NOTES: Record<string, string[]> = {
  general:  ['양호', '보통', '불량', '의식 명료', '기력 저하'],
  mood:     ['안정', '우울', '불안', '초조', '즐거움'],
  skin:     ['정상', '발적', '부종', '건조', '욕창 의심'],
  mobility: ['독립보행', '보조기 사용', '휠체어', '침상안정', '낙상위험'],
  appetite: ['양호(80%↑)', '보통(50~80%)', '저하(50%↓)', '거부', '수액 중'],
  sleep:    ['숙면', '수면장애', '주간졸음', '야간배회', '수면제 투여'],
  pain:     ['무통', '경미(1~3)', '중등(4~6)', '심함(7~10)', '진통제 투여'],
  other:    [],
};

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

  const residents = residentsData?.items ?? [];
  const history = historyData?.items ?? [];

  const [selectedResident, setSelectedResident] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('general');
  const [noteText, setNoteText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const resident = residents.find(r => r.id === selectedResident);

  const handleQuickNote = (note: string) => {
    setNoteText(prev => prev ? `${prev}, ${note}` : note);
  };

  const handleSave = () => {
    if (!selectedResident || !noteText) {
      Alert.alert('알림', '입주자와 관찰 내용을 입력해주세요');
      return;
    }
    const today = new Date();
    const catLabel = OBSERVATION_CATEGORIES.find(c => c.id === selectedCategory)?.label ?? selectedCategory;

    createRecord(
      {
        residentId: selectedResident,
        recordType: 'observation',
        // KST 날짜 — UTC 슬라이스면 새벽 0~9시 기록이 전날로 밀린다(야간 근무 시간대)
        recordDate: getKSTToday(),
        recordTime: today.toISOString(),
        content: `[${catLabel}] ${noteText}`,
        staffId: session?.user.staffId ?? null,
      },
      {
        onSuccess: () => {
          Alert.alert('저장 완료', `${resident?.name ?? '입주자'} 어르신 관찰 기록이 저장되었습니다`);
          setNoteText('');
        },
        onError: (err) => {
          Alert.alert('저장 실패', err.message);
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
            <ActivityIndicator size="large" color="#1A5276" style={{ marginTop: 32 }} />
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
        <ScrollView contentContainerStyle={styles.content}>
          {/* 입주자 선택 */}
          <Text style={styles.sectionLabel}>입주자 선택</Text>
          {loadingResidents ? (
            <ActivityIndicator size="small" color="#1A5276" />
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

          {/* 카테고리 선택 */}
          <Text style={styles.sectionLabel}>관찰 항목</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {OBSERVATION_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                style={[styles.catChip, selectedCategory === cat.id && styles.catChipActive]}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={[styles.catLabel, selectedCategory === cat.id && styles.catLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 빠른 입력 */}
          {(QUICK_NOTES[selectedCategory]?.length ?? 0) > 0 && (
            <>
              <Text style={styles.sectionLabel}>빠른 선택</Text>
              <View style={styles.quickRow}>
                {QUICK_NOTES[selectedCategory].map(note => (
                  <TouchableOpacity key={note} onPress={() => handleQuickNote(note)} style={styles.quickChip}>
                    <Text style={styles.quickText}>{note}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* 직접 입력 */}
          <Text style={styles.sectionLabel}>관찰 내용</Text>
          <TextInput
            style={styles.textInput}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="관찰 내용을 입력하세요..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* 저장 */}
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: '#1A5276', paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
  },
  historyHit: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 8 },
  historyBtn: { color: '#93C5FD', fontSize: 18, fontWeight: '600' },
  content: { padding: 16, gap: 16 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: -8 },
  residentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  residentChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  residentChipActive: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  residentChipText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  residentChipTextActive: { color: '#fff' },
  catScroll: { flexGrow: 0 },
  catChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8, minWidth: 64,
  },
  catChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  catEmoji: { fontSize: 22 },
  catLabel: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  catLabelActive: { color: '#2563EB', fontWeight: '600' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EFF6FF' },
  quickText: { fontSize: 16, color: '#2563EB' },
  textInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    padding: 14, fontSize: 16, minHeight: 100, textAlignVertical: 'top',
  },
  saveBtn: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#6B7280' },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 17 },
  entryCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  entryName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  entryTime: { fontSize: 15, color: '#9CA3AF' },
  entryCat: { fontSize: 15, color: '#6B7280', marginBottom: 4 },
  entryContent: { fontSize: 16, color: '#374151', lineHeight: 20 },
});
