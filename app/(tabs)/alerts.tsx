/**
 * 알림 탭 - 실시간 알림 및 긴급 알람
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ALERTS = [
  {
    id: '1',
    type: 'FALL_DETECTED',
    title: '낙상 감지',
    resident: '김순자',
    room: '102호',
    time: '10분 전',
    severity: 'Critical',
    status: 'New',
  },
  {
    id: '2',
    type: 'VITAL_CRISIS',
    title: '바이탈 위기',
    resident: '이영철',
    room: '205호',
    time: '32분 전',
    severity: 'High',
    status: 'Acknowledged',
  },
  {
    id: '3',
    type: 'MEDICATION_MISSED',
    title: '복약 미실시',
    resident: '박정희',
    room: '301호',
    time: '1시간 전',
    severity: 'Medium',
    status: 'New',
  },
];

const SEVERITY_CONFIG = {
  Critical: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', label: '위급' },
  High: { bg: '#FFF7ED', border: '#FDBA74', text: '#EA580C', label: '높음' },
  Medium: { bg: '#FFFBEB', border: '#FCD34D', text: '#D97706', label: '보통' },
  Low: { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A', label: '낮음' },
};

export default function AlertsScreen() {
  const newAlerts = ALERTS.filter((a) => a.status === 'New');
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {newAlerts.length > 0 && (
          <View style={styles.urgentBanner}>
            <Text style={styles.urgentText}>⚠️ 미처리 알림 {newAlerts.length}건</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>전체 알림</Text>
        {ALERTS.map((alert) => {
          const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG];
          return (
            <TouchableOpacity
              key={alert.id}
              style={[styles.alertCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
            >
              <View style={styles.alertHeader}>
                <View style={[styles.severityBadge, { backgroundColor: cfg.text }]}>
                  <Text style={styles.severityText}>{cfg.label}</Text>
                </View>
                <Text style={styles.alertTime}>{alert.time}</Text>
              </View>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertResident}>{alert.resident} · {alert.room}</Text>
              
              {alert.status === 'New' && (
                <TouchableOpacity style={styles.ackButton}>
                  <Text style={styles.ackButtonText}>확인했습니다</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 12 },
  urgentBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  urgentText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  alertCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  severityText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  alertTime: { fontSize: 12, color: '#6B7280' },
  alertTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  alertResident: { fontSize: 13, color: '#6B7280' },
  ackButton: {
    marginTop: 8, backgroundColor: '#1A5276',
    borderRadius: 8, padding: 10, alignItems: 'center',
    minHeight: 44,
  },
  ackButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
