/**
 * 건강 기록 탭 — GET/POST /api/meals/intake 실데이터
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResidents } from '../../lib/hooks/useResidents';
import {
  useMealIntakes, useMealIntakeCreate, cycleIntake,
  INTAKE_LABEL, INTAKE_COLOR,
  type MealIntake,
} from '../../lib/hooks/useMealIntake';

const TODAY = new Date().toISOString().slice(0, 10);

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABELS: Record<MealType, string> = { breakfast: '조식', lunch: '중식', dinner: '석식' };

const DAILY_CHECKS = [
  '바이탈 사인 측정',
  '식사 섭취 기록',
  '복약 확인',
  '이동 보조 기록',
  '위생 케어 완료',
  '안전 점검',
];

export default function HealthLogScreen() {
  const { data: residentsData, isLoading: loadingResidents } = useResidents({ status: '입소 중' });
  const {
    data: intakeData,
    isLoading: loadingIntake,
    isRefetching,
    refetch,
  } = useMealIntakes({ date: TODAY });
  const { mutate: createIntake, isPending: isSaving } = useMealIntakeCreate();

  const [checks, setChecks] = useState<boolean[]>(DAILY_CHECKS.map(() => false));
  // 낙관적 UI: 저장 중인 셀 추적
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const residents = residentsData?.items ?? [];
  const intakeItems: MealIntake[] = intakeData?.items ?? [];

  // residentId + mealType → intake 맵
  const intakeMap = new Map<string, MealIntake>();
  for (const item of intakeItems) {
    intakeMap.set(`${item.residentId}:${item.mealType}`, item);
  }

  const handleMealCell = useCallback(
    (residentId: string, mealType: MealType) => {
      if (isSaving) return;
      const key = `${residentId}:${mealType}`;
      const current = intakeMap.get(key)?.intakeAmount ?? null;
      const next = cycleIntake(current);
      setSavingCell(key);
      createIntake(
        { residentId, intakeDate: TODAY, mealType, intakeAmount: next },
        {
          onSettled: () => setSavingCell(null),
          onError: (err) => Alert.alert('저장 실패', err.message),
        },
      );
    },
    [intakeMap, isSaving, createIntake],
  );

  const toggleCheck = (i: number) => {
    setChecks(prev => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const isLoading = loadingResidents || loadingIntake;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {/* Meal Intake */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>식사 섭취 기록 — {TODAY}</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color="#1A5276" style={{ marginVertical: 24 }} />
          ) : (
            <View style={styles.mealTable}>
              {/* 헤더 */}
              <View style={styles.mealHeader}>
                <Text style={[styles.mealCell, styles.nameCell, styles.headerText]}>입주자</Text>
                {MEAL_TYPES.map(m => (
                  <Text key={m} style={[styles.mealCell, styles.headerText]}>{MEAL_LABELS[m]}</Text>
                ))}
              </View>
              {residents.length === 0 && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#9CA3AF' }}>입소 중인 입주자가 없습니다</Text>
                </View>
              )}
              {residents.map(r => (
                <View key={r.id} style={styles.mealRow}>
                  <View style={[styles.mealCell, styles.nameCell]}>
                    <Text style={styles.residentName}>{r.name}</Text>
                    <Text style={styles.roomText}>{r.room || '미배정'}</Text>
                  </View>
                  {MEAL_TYPES.map(mealType => {
                    const key = `${r.id}:${mealType}`;
                    const item = intakeMap.get(key);
                    const isLoading = savingCell === key;
                    return (
                      <MealCell
                        key={mealType}
                        value={item?.intakeAmount ?? null}
                        loading={isLoading}
                        onPress={() => handleMealCell(r.id, mealType)}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Daily Checks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>일일 점검 체크리스트</Text>
          {DAILY_CHECKS.map((item, i) => (
            <TouchableOpacity key={i} style={styles.checkItem} onPress={() => toggleCheck(i)}>
              <View style={[styles.checkbox, checks[i] && styles.checkboxDone]}>
                {checks[i] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, checks[i] && styles.checkLabelDone]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MealCell({
  value, loading, onPress,
}: {
  value: string | null;
  loading: boolean;
  onPress: () => void;
}) {
  if (loading) {
    return (
      <View style={[styles.mealCell, styles.mealCellEmpty]}>
        <ActivityIndicator size="small" color="#6B7280" />
      </View>
    );
  }
  if (!value) {
    return (
      <TouchableOpacity style={[styles.mealCell, styles.mealCellEmpty]} onPress={onPress}>
        <Text style={styles.mealCellEmptyText}>+</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={styles.mealCell} onPress={onPress}>
      <Text style={[styles.intakeText, { color: INTAKE_COLOR[value] ?? '#6B7280' }]}>
        {INTAKE_LABEL[value] ?? value}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  mealTable: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  mealHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 10 },
  mealRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  mealCell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 8, padding: 12, gap: 12, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 50,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  checkLabel: { fontSize: 14, color: '#374151', flex: 1 },
  checkLabelDone: { color: '#9CA3AF', textDecorationLine: 'line-through' },
});
