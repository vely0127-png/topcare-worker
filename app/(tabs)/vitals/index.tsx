/**
 * 바이탈 확인 화면 — GET /api/vitals 실데이터
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVitals, toRiskLevel, type VitalItem } from '../../../lib/hooks/useVitals';

const RISK_COLORS = {
  normal:   { bg: '#DCFCE7', text: '#16A34A', label: '정상' },
  caution:  { bg: '#FEF9C3', text: '#CA8A04', label: '주의' },
  warning:  { bg: '#FED7AA', text: '#EA580C', label: '경고' },
  critical: { bg: '#FEE2E2', text: '#DC2626', label: '위험' },
} as const;

type RiskLevel = keyof typeof RISK_COLORS;

interface MappedVital {
  residentId: string;
  name: string;
  room: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  riskLevel: RiskLevel;
  lastCheckedMinutes: number;
}

function mapVital(item: VitalItem): MappedVital {
  return {
    residentId: item.residentId,
    name: item.name,
    room: item.room,
    heartRate: item.hr,
    spo2: item.spo2,
    temperature: item.temp,
    bloodPressure: item.bp,
    riskLevel: toRiskLevel(item),
    lastCheckedMinutes: item.lastCheckMinutes,
  };
}

export default function VitalsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useVitals();
  const [selectedResident, setSelectedResident] = useState<string | null>(null);

  const vitals: MappedVital[] = (data ?? []).map(mapVital).sort((a, b) => {
    const order: Record<RiskLevel, number> = { critical: 0, warning: 1, caution: 2, normal: 3 };
    return order[a.riskLevel] - order[b.riskLevel];
  });

  const summaryCount = (level: RiskLevel) => vitals.filter(v => v.riskLevel === level).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>바이탈 현황</Text>
        <Text style={styles.headerSub}>
          {isLoading ? '로딩 중...' : `담당 입소자 ${vitals.length}명`}
        </Text>
      </View>

      {isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            데이터 로드 실패: {(error as Error)?.message ?? '알 수 없는 오류'}
          </Text>
          <TouchableOpacity onPress={() => void refetch()}>
            <Text style={styles.retryText}>재시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A5276" />
          <Text style={styles.loadingText}>바이탈 데이터 조회 중...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {/* 요약 카드 */}
          <View style={styles.summaryRow}>
            {(Object.keys(RISK_COLORS) as RiskLevel[]).map((level) => {
              const config = RISK_COLORS[level];
              const count = summaryCount(level);
              return (
                <View key={level} style={[styles.summaryCard, { backgroundColor: config.bg }]}>
                  <Text style={[styles.summaryCount, { color: config.text }]}>{count}</Text>
                  <Text style={[styles.summaryLabel, { color: config.text }]}>{config.label}</Text>
                </View>
              );
            })}
          </View>

          {vitals.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>담당 입소자 데이터 없음</Text>
            </View>
          )}

          {vitals.map((vital) => {
            const risk = RISK_COLORS[vital.riskLevel];
            const isExpanded = selectedResident === vital.residentId;
            return (
              <TouchableOpacity
                key={vital.residentId}
                style={[styles.vitalCard, vital.riskLevel === 'critical' && styles.criticalCard]}
                onPress={() => setSelectedResident(isExpanded ? null : vital.residentId)}
              >
                <View style={styles.vitalTop}>
                  <View style={styles.vitalLeft}>
                    <View style={[styles.avatar, { backgroundColor: risk.bg }]}>
                      <Text style={[styles.avatarText, { color: risk.text }]}>{vital.name[0]}</Text>
                    </View>
                    <View>
                      <Text style={styles.vitalName}>{vital.name}</Text>
                      <Text style={styles.vitalRoom}>
                        {vital.room} · {vital.lastCheckedMinutes}분 전 측정
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.riskBadge, { backgroundColor: risk.bg }]}>
                    <Text style={[styles.riskText, { color: risk.text }]}>{risk.label}</Text>
                  </View>
                </View>

                <View style={styles.vitalsGrid}>
                  <VitalBox label="심박" value={`${vital.heartRate}`} unit="bpm" warn={vital.heartRate > 90 || vital.heartRate < 60} />
                  <VitalBox label="SpO2" value={`${vital.spo2}`} unit="%" warn={vital.spo2 < 95} />
                  <VitalBox label="체온" value={`${vital.temperature}`} unit="°C" warn={vital.temperature > 37.5} />
                  <VitalBox label="혈압" value={vital.bloodPressure} unit="mmHg" warn={false} />
                </View>

                {isExpanded && (
                  <View style={styles.expandedSection}>
                    <Text style={styles.expandedInfo}>
                      위험도: {risk.label} · {vital.lastCheckedMinutes}분 전 업데이트
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function VitalBox({
  label, value, unit, warn,
}: {
  label: string; value: string; unit: string; warn: boolean;
}) {
  return (
    <View style={[styles.vitalBox, warn && styles.vitalBoxWarn]}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text style={[styles.vitalValue, warn && styles.vitalValueWarn]}>{value}</Text>
      <Text style={styles.vitalUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#1A5276', padding: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  errorBanner: {
    backgroundColor: '#FEE2E2', padding: 12, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  errorText: { fontSize: 13, color: '#DC2626', flex: 1 },
  retryText: { fontSize: 13, color: '#DC2626', fontWeight: '700', marginLeft: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#6B7280', marginTop: 12, fontSize: 14 },
  emptyContainer: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#9CA3AF', fontSize: 15 },
  content: { padding: 12, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryCount: { fontSize: 22, fontWeight: 'bold' },
  summaryLabel: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  vitalCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  criticalCard: { borderColor: '#FCA5A5', borderWidth: 2 },
  vitalTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  vitalLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: 'bold' },
  vitalName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  vitalRoom: { fontSize: 12, color: '#6B7280' },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  riskText: { fontSize: 12, fontWeight: '700' },
  vitalsGrid: { flexDirection: 'row', gap: 8 },
  vitalBox: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8, alignItems: 'center' },
  vitalBoxWarn: { backgroundColor: '#FEF2F2' },
  vitalLabel: { fontSize: 10, color: '#6B7280' },
  vitalValue: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 2 },
  vitalValueWarn: { color: '#DC2626' },
  vitalUnit: { fontSize: 10, color: '#9CA3AF' },
  expandedSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  expandedInfo: { fontSize: 13, color: '#6B7280' },
});
