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
import { getKSTToday } from '../../lib/utils/date';

// KST 기준 오늘 — UTC 슬라이스면 새벽 0~9시에 전날 표가 뜬다(야간 근무 시간대)
const TODAY = getKSTToday();

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABELS: Record<MealType, string> = { breakfast: '조식', lunch: '중식', dinner: '석식' };

// 2026-08-06 제거: '일일 점검 체크리스트' 6줄은 로컬 useState 뿐이라 화면을 나가면
// 사라졌다(서버 저장 없음). 체크했는데 아무 데도 안 남는 = 가짜 성공이라 삭제.
// 같은 일을 하는 정본 화면은 '오늘 할 일'(service-provisions 로 실제 저장)이다.

export default function HealthLogScreen() {
  const { data: residentsData, isLoading: loadingResidents } = useResidents({ status: '입소 중' });
  const {
    data: intakeData,
    isLoading: loadingIntake,
    isRefetching,
    refetch,
  } = useMealIntakes({ date: TODAY });
  const { mutate: createIntake, isPending: isSaving } = useMealIntakeCreate();

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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  mealTable: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  mealHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 10 },
  mealRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  // 터치 타깃 — 50~70대 기준 최소 56 (2026-08-06 PoC)
  mealCell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  nameCell: { flex: 2, alignItems: 'flex-start' },
  headerText: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  residentName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  roomText: { fontSize: 14, color: '#9CA3AF' },
  intakeText: { fontSize: 16, fontWeight: '700' },
  mealCellEmpty: {
    height: 52, borderRadius: 6,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  mealCellEmptyText: { fontSize: 19, color: '#9CA3AF' },
});
