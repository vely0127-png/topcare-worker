/**
 * 케어 기록 탭 — POST /api/care/records 실데이터
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResidents } from '../../lib/hooks/useResidents';
import { useCareRecordCreate } from '../../lib/hooks/useCareRecords';
import { useSession } from '../../lib/hooks/useAuth';

const SERVICE_TYPES = [
  '개인위생', '식사보조', '배변케어', '체위변경',
  '투약확인', '재활운동', '인지활동', '외출동행',
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

    const today = new Date();
    const content = activeTab === 'service'
      ? `[${selectedService}]${notes ? ' ' + notes : ''}`
      : notes;

    createRecord(
      {
        residentId: selectedResident,
        recordType: activeTab === 'service' ? 'care_service' : 'observation',
        recordDate: today.toISOString().slice(0, 10),
        recordTime: today.toISOString(),
        content,
        staffId: session?.user.staffId ?? null,
      },
      {
        onSuccess: () => {
          const resident = residents.find(r => r.id === selectedResident);
          Alert.alert(
            '저장 완료',
            `${resident?.name ?? '입주자'} 어르신 ${activeTab === 'service' ? '서비스' : '관찰'} 기록이 저장되었습니다`,
          );
          setSelectedService('');
          setNotes('');
        },
        onError: (err) => {
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
              {SERVICE_TYPES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, selectedService === s && styles.chipSelected]}
                  onPress={() => setSelectedService(s)}
                >
                  <Text style={[styles.chipText, selectedService === s && styles.chipTextSelected]}>
                    {s}
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
  tabText: { fontSize: 14, fontWeight: '500', color: '#6B7280' },
  tabTextActive: { color: '#1A5276', fontWeight: '700' },
  content: { padding: 16, gap: 20 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', minHeight: 36,
  },
  chipSelected: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  textarea: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, padding: 12, fontSize: 14, minHeight: 120, color: '#111827',
  },
  submitButton: {
    backgroundColor: '#1A5276', borderRadius: 10,
    padding: 16, alignItems: 'center', minHeight: 52,
  },
  submitButtonDisabled: { backgroundColor: '#6B7280' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
