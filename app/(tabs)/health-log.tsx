/**
 * 건강 기록 탭 - 식사 섭취, 체중, 일일 점검
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MEAL_RECORDS = [
  { name: '김순자', room: '102호', breakfast: 'All', lunch: 'Half', dinner: null },
  { name: '이영철', room: '205호', breakfast: 'All', lunch: 'All', dinner: null },
  { name: '박정희', room: '301호', breakfast: 'None', lunch: null, dinner: null },
];

const INTAKE_LABELS: Record<string, string> = {
  All: '전량',
  Half: '반량',
  None: '거부',
};

const INTAKE_COLORS: Record<string, string> = {
  All: '#16A34A',
  Half: '#D97706',
  None: '#DC2626',
};

export default function HealthLogScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Meal Intake */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>식사 섭취 기록</Text>
          <View style={styles.mealTable}>
            <View style={styles.mealHeader}>
              <Text style={[styles.mealCell, styles.nameCell, styles.headerText]}>입주자</Text>
              <Text style={[styles.mealCell, styles.headerText]}>조식</Text>
              <Text style={[styles.mealCell, styles.headerText]}>중식</Text>
              <Text style={[styles.mealCell, styles.headerText]}>석식</Text>
            </View>
            {MEAL_RECORDS.map((r, i) => (
              <View key={i} style={styles.mealRow}>
                <View style={[styles.mealCell, styles.nameCell]}>
                  <Text style={styles.residentName}>{r.name}</Text>
                  <Text style={styles.roomText}>{r.room}</Text>
                </View>
                <MealCell value={r.breakfast} />
                <MealCell value={r.lunch} />
                <MealCell value={r.dinner} />
              </View>
            ))}
          </View>
        </View>

        {/* Daily Checks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>일일 점검 체크리스트</Text>
          {[
            { label: '바이탈 사인 측정', done: true },
            { label: '식사 섭취 기록', done: true },
            { label: '복약 확인', done: false },
            { label: '이동 보조 기록', done: false },
            { label: '위생 케어 완료', done: true },
            { label: '안전 점검', done: false },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.checkItem}>
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                {item.done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, item.done && styles.checkLabelDone]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MealCell({ value }: { value: string | null }) {
  if (!value) {
    return (
      <TouchableOpacity style={[styles.mealCell, styles.mealCellEmpty]}>
        <Text style={styles.mealCellEmptyText}>+</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.mealCell}>
      <Text style={[styles.intakeText, { color: INTAKE_COLORS[value] }]}>
        {INTAKE_LABELS[value]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  mealTable: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  mealHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 10 },
  mealRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  mealCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flex: 2, alignItems: 'flex-start' },
  headerText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  residentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  roomText: { fontSize: 11, color: '#9CA3AF' },
  intakeText: { fontSize: 13, fontWeight: '700' },
  mealCellEmpty: {
    height: 36, borderRadius: 6,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  mealCellEmptyText: { fontSize: 18, color: '#9CA3AF' },
  checkItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    gap: 12, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 50,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  checkLabel: { fontSize: 14, color: '#374151', flex: 1 },
  checkLabelDone: { color: '#9CA3AF', textDecorationLine: 'line-through' },
});
