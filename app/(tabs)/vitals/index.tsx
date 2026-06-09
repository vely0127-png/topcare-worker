/**
 * 바이탈 확인 화면 — 담당 입소자 바이탈 현황
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface VitalData {
  residentId: string;
  name: string;
  room: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  riskLevel: 'normal' | 'caution' | 'warning' | 'critical';
  lastUpdated: string;
  trend: 'stable' | 'improving' | 'declining';
}

const MOCK_VITALS: VitalData[] = [
  { residentId: '1', name: '김순자', room: '201호', heartRate: 72, spo2: 97, temperature: 36.5, bloodPressure: '130/82', riskLevel: 'normal', lastUpdated: '07:23', trend: 'stable' },
  { residentId: '2', name: '박영수', room: '203호', heartRate: 88, spo2: 94, temperature: 37.2, bloodPressure: '148/92', riskLevel: 'warning', lastUpdated: '07:35', trend: 'declining' },
  { residentId: '3', name: '이영희', room: '205호', heartRate: 68, spo2: 98, temperature: 36.3, bloodPressure: '122/78', riskLevel: 'normal', lastUpdated: '06:50', trend: 'improving' },
  { residentId: '4', name: '최정호', room: '207호', heartRate: 95, spo2: 91, temperature: 37.8, bloodPressure: '155/98', riskLevel: 'critical', lastUpdated: '07:40', trend: 'declining' },
];

const RISK_COLORS = {
  normal: { bg: '#DCFCE7', text: '#16A34A', label: '정상' },
  caution: { bg: '#FEF9C3', text: '#CA8A04', label: '주의' },
  warning: { bg: '#FED7AA', text: '#EA580C', label: '경고' },
  critical: { bg: '#FEE2E2', text: '#DC2626', label: '위험' },
};

export default function VitalsScreen() {
  const [selectedResident, setSelectedResident] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>바이탈 현황</Text>
        <Text style={styles.headerSub}>담당 입소자 {MOCK_VITALS.length}명</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 요약 카드 */}
        <View style={styles.summaryRow}>
          {Object.entries(RISK_COLORS).map(([level, config]) => {
            const count = MOCK_VITALS.filter(v => v.riskLevel === level).length;
            return (
              <View key={level} style={[styles.summaryCard, { backgroundColor: config.bg }]}>
                <Text style={[styles.summaryCount, { color: config.text }]}>{count}</Text>
                <Text style={[styles.summaryLabel, { color: config.text }]}>{config.label}</Text>
              </View>
            );
          })}
        </View>

        {/* 입소자별 바이탈 카드 */}
        {MOCK_VITALS.sort((a, b) => {
          const order = { critical: 0, warning: 1, caution: 2, normal: 3 };
          return order[a.riskLevel] - order[b.riskLevel];
        }).map(vital => {
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
                    <Text style={styles.vitalRoom}>{vital.room} · {vital.lastUpdated} 측정</Text>
                  </View>
                </View>
                <View style={[styles.riskBadge, { backgroundColor: risk.bg }]}>
                  <Text style={[styles.riskText, { color: risk.text }]}>{risk.label}</Text>
                </View>
              </View>

              {/* 바이탈 수치 */}
              <View style={styles.vitalsGrid}>
                <VitalBox label="심박" value={`${vital.heartRate}`} unit="bpm" warn={vital.heartRate > 90 || vital.heartRate < 60} />
                <VitalBox label="SpO2" value={`${vital.spo2}`} unit="%" warn={vital.spo2 < 95} />
                <VitalBox label="체온" value={`${vital.temperature}`} unit="°C" warn={vital.temperature > 37.5} />
                <VitalBox label="혈압" value={vital.bloodPressure} unit="mmHg" warn={false} />
              </View>

              {/* 추세 */}
              {isExpanded && (
                <View style={styles.expandedSection}>
                  <View style={styles.trendRow}>
                    <Text style={styles.trendLabel}>추세:</Text>
                    <Text style={[styles.trendValue, {
                      color: vital.trend === 'improving' ? '#16A34A' : vital.trend === 'declining' ? '#DC2626' : '#6B7280'
                    }]}>
                      {vital.trend === 'improving' ? '↑ 개선중' : vital.trend === 'declining' ? '↓ 악화 주의' : '→ 안정'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.detailBtn}>
                    <Text style={styles.detailBtnText}>상세 이력 보기</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function VitalBox({ label, value, unit, warn }: { label: string; value: string; unit: string; warn: boolean }) {
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
  content: { padding: 12, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryCount: { fontSize: 22, fontWeight: 'bold' },
  summaryLabel: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  vitalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  criticalCard: { borderColor: '#FCA5A5', borderWidth: 2 },
  vitalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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
  trendRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  trendLabel: { fontSize: 13, color: '#6B7280' },
  trendValue: { fontSize: 13, fontWeight: '600' },
  detailBtn: { marginTop: 10, backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  detailBtnText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
});
