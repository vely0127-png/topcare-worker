/**
 * 케어 기록 탭 - 서비스 기록 및 관찰 일지 입력
 */
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

const SERVICE_TYPES = [
  '개인위생', '식사보조', '배변케어', '체위변경',
  '투약확인', '재활운동', '인지활동', '외출동행',
];

const RESIDENTS = [
  { id: '1', name: '김순자', room: '102호' },
  { id: '2', name: '이영철', room: '205호' },
  { id: '3', name: '박정희', room: '301호' },
  { id: '4', name: '최영순', room: '104호' },
];

export default function CareLogScreen() {
  const [selectedResident, setSelectedResident] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'service' | 'observation'>('service');

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
          <View style={styles.chipGroup}>
            {RESIDENTS.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.chip, selectedResident === r.id && styles.chipSelected]}
                onPress={() => setSelectedResident(r.id)}
              >
                <Text style={[styles.chipText, selectedResident === r.id && styles.chipTextSelected]}>
                  {r.name} ({r.room})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {activeTab === 'service' ? (
          <>
            {/* Service Type */}
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
          </>
        ) : null}

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
        <TouchableOpacity style={styles.submitButton}>
          <Text style={styles.submitText}>
            {activeTab === 'service' ? '서비스 기록 저장' : '관찰 일지 저장'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff',
    minHeight: 36,
  },
  chipSelected: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  textarea: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, padding: 12,
    fontSize: 14, minHeight: 120, color: '#111827',
  },
  submitButton: {
    backgroundColor: '#1A5276', borderRadius: 10,
    padding: 16, alignItems: 'center', minHeight: 52,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
