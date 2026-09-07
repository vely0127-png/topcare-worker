/**
 * 케어 기록 탭 — POST /api/care/records 실데이터
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native';
import { Alert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResidents } from '../../lib/hooks/useResidents';
import { useCareRecordCreate } from '../../lib/hooks/useCareRecords';
import { useSession } from '../../lib/hooks/useAuth';
import { getKSTToday, getKSTNowWallClockIso } from '../../lib/utils/date';
import { QueuedOfflineError } from '../../lib/queue/offline-queue';
import { measure } from '../../lib/measure/client';

// P0-4(2026-07-27): recordType 'care_service'는 웹 어디에도 없는 값 — 보이지 않는 쓰기였다.
// 웹이 실제로 읽는 recordType으로 매핑 (배설관찰·목욕·간호 탭, 기록지, 주간 변화 리포트에 반영됨).
// 투약은 시간표/MAR가 정본이라 여기서 제외(이원 입력 방지), 식사는 건강기록 탭(MealIntake)이 정본.
const SERVICE_OPTIONS: { label: string; recordType: string }[] = [
  { label: '배변 케어', recordType: 'defecation' },
  { label: '목욕·개인위생', recordType: 'bathing' },
  { label: '간호 처치', recordType: 'nursing' },
  { label: '이동·체위', recordType: 'mobility' },
  { label: '인지활동', recordType: 'observation' },
  { label: '외출동행', recordType: 'observation' },
];

export default function CareLogScreen() {
  const session = useSession();
  const { data: residentsData, isLoading: loadingResidents } = useResidents({ status: '입소 중' });
  const { mutate: createRecord, isPending: isSaving } = useCareRecordCreate();

  const residents = residentsData?.items ?? [];

  const [selectedResident, setSelectedResident] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'service' | 'observation'>('service');

  const handleSubmit = () => {
    if (!selectedResident) {
      Alert.alert('알림', '입주자를 선택해주세요');
      return;
    }
    if (activeTab === 'service' && !selectedService) {
      Alert.alert('알림', '서비스 종류를 선택해주세요');
      return;
    }
    if (activeTab === 'observation' && !notes) {
      Alert.alert('알림', '관찰 내용을 입력해주세요');
      return;
    }

    const content = activeTab === 'service'
      ? `[${selectedService}]${notes ? ' ' + notes : ''}`
      : notes;

    const serviceOpt = SERVICE_OPTIONS.find((s) => s.label === selectedService);
    createRecord(
      {
        residentId: selectedResident,
        // P0-4: 웹이 읽는 recordType 코드값 사용 (이전 'care_service'는 어디서도 안 보였음)
        recordType: activeTab === 'service' ? (serviceOpt?.recordType ?? 'observation') : 'observation',
        recordDate: getKSTToday(), // KST 날짜 (새벽 전날 밀림 방지)
        // ⛔ toISOString() = UTC 벽시계. recordTime 은 시각만 담는 컬럼이라
        //    07:00 기록이 22:00으로 남았다(2026-09-03 QA P2) → KST 벽시계로 보낸다.
        recordTime: getKSTNowWallClockIso(),
        content,
        staffId: session?.user.staffId ?? null,
      },
      {
        onSuccess: () => {
          // 실증 측정 — 케어 기록 저장 성공(ADR-001 §7). residentId·성명·내용은 담지 않는다.
          measure.save('care-log:save');
          const resident = residents.find(r => r.id === selectedResident);
          Alert.alert(
            '저장 완료',
            `${resident?.name ?? '입주자'} 어르신 ${activeTab === 'service' ? '서비스' : '관찰'} 기록이 저장되었습니다`,
          );
          setSelectedService('');
          setNotes('');
        },
        onError: (err) => {
          // 오프라인 큐(2026-09-06 vc11) — 큐에 들어간 것은 유실이 아니다. "대기 중"으로 안내하고
          // 입력값은 성공과 동일하게 비운다(이미 로컬 큐에 안전하게 담겼으므로 재입력 불필요).
          if (err instanceof QueuedOfflineError) {
            measure.step('care-log:save:queued');
            const resident = residents.find(r => r.id === selectedResident);
            Alert.alert('대기 중', `${resident?.name ?? '입주자'} 어르신 기록 — ${err.message}`);
            setSelectedService('');
            setNotes('');
            return;
          }
          Alert.alert('저장 실패', err.message);
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tab Switch */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'service' && styles.tabActive]}
          onPress={() => setActiveTab('service')}
        >
          <Text style={[styles.tabText, activeTab === 'service' && styles.tabTextActive]}>
            서비스 기록
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'observation' && styles.tabActive]}
          onPress={() => setActiveTab('observation')}
        >
          <Text style={[styles.tabText, activeTab === 'observation' && styles.tabTextActive]}>
            관찰 일지
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Resident Selection */}
        <View style={styles.field}>
          <Text style={styles.label}>입주자 선택 *</Text>
          {loadingResidents ? (
            <ActivityIndicator size="small" color="#1A5276" />
          ) : (
            <View style={styles.chipGroup}>
              {residents.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, selectedResident === r.id && styles.chipSelected]}
                  onPress={() => setSelectedResident(r.id)}
                >
                  <Text style={[styles.chipText, selectedResident === r.id && styles.chipTextSelected]}>
                    {r.name} ({r.room || '미배정'})
                  </Text>
                </TouchableOpacity>
              ))}
              {residents.length === 0 && (
                <Text style={styles.emptyText}>입소 중인 입주자가 없습니다</Text>
              )}
            </View>
          )}
        </View>

        {activeTab === 'service' && (
          <View style={styles.field}>
            <Text style={styles.label}>서비스 종류 *</Text>
            <View style={styles.chipGroup}>
              {SERVICE_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={[styles.chip, selectedService === s.label && styles.chipSelected]}
                  onPress={() => setSelectedService(s.label)}
                >
                  <Text style={[styles.chipText, selectedService === s.label && styles.chipTextSelected]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {activeTab === 'service' ? '특이사항' : '관찰 내용 *'}
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder={
              activeTab === 'service'
                ? '특이사항을 입력하세요...'
                : '입주자 상태, 행동, 건강 변화 등을 상세히 기록하세요...'
            }
            multiline
            numberOfLines={6}
            value={notes}
            onChangeText={setNotes}
            textAlignVertical="top"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {activeTab === 'service' ? '서비스 기록 저장' : '관찰 일지 저장'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1A5276' },
  tabText: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  tabTextActive: { color: '#1A5276', fontWeight: '700' },
  content: { padding: 16, gap: 20 },
  field: { gap: 8 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', minHeight: 36,
  },
  chipSelected: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  chipText: { fontSize: 16, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 16, color: '#9CA3AF', fontStyle: 'italic' },
  textarea: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, padding: 12, fontSize: 16, minHeight: 120, color: '#111827',
  },
  submitButton: {
    backgroundColor: '#1A5276', borderRadius: 10,
    padding: 16, alignItems: 'center', minHeight: 52,
  },
  submitButtonDisabled: { backgroundColor: '#6B7280' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
