import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAlerts, useAcknowledgeAlert, type AlertItem, type AlertSeverity } from '@/lib/hooks/useAlerts';
import EmergencyAlertModal from '@/components/EmergencyAlertModal';

type SeverityConfig = { bg: string; border: string; text: string; label: string };
const SEV_CFG: Record<AlertSeverity, SeverityConfig> = {
  Critical: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', label: 'wg' },
  High: { bg: '#FFF7ED', border: '#FDBA74', text: '#EA580C', label: 'nf' },
  Medium: { bg: '#FFFBEB', border: '#FCD34D', text: '#D97706', label: 'ef' },
  Low: { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A', label: 'ld' },
};

const SEV_LABELS: Record<AlertSeverity, string> = {
  Critical: '위급', High: '높음', Medium: '보통', Low: '낮음',
};

const TYPE_LABELS: Record<string, string> = {
  FALL_DETECTED: '낙상 감지',
  VITAL_CRISIS: '바이탈 위기',
  EXIT_ZONE: '구역 이탈',
  MEDICATION_MISSED: '복약 미실시',
  NO_MOVEMENT: '무움직임',
  STRESS_HIGH: '스트레스 높음',
  DEVICE_OFFLINE: '기기 오프라인',
};

function relTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko }); }
  catch { return iso; }
}

type FilterTab = 'all' | 'new' | 'critical';

interface CardProps { item: AlertItem; onAck: (id: string) => void; acking: boolean; }

function AlertCard({ item, onAck, acking }: CardProps) {
  const cfg = SEV_CFG[item.severity];
  const title = TYPE_LABELS[item.type] ?? item.title;
  const isNew = item.status === 'new';
  return (
    <View style={[s.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={s.row}>
        <View style={[s.badge, { backgroundColor: cfg.text }]}>
          <Text style={s.badgeTxt}>{SEV_LABELS[item.severity]}</Text>
        </View>
        <Text style={s.timeT}>{relTime(item.createdAt)}</Text>
      </View>
      <Text style={s.titleT}>{title}</Text>
      <Text style={s.subT}>{item.residentName} / {item.roomName}</Text>
      {!!item.description && <Text style={s.descT}>{item.description}</Text>}
      {isNew && (
        <TouchableOpacity style={[s.ackBtn, acking && s.ackBtnOff]} onPress={() => onAck(item.id)} disabled={acking}>
          {acking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.ackTxt}>확인했습니다</Text>}
        </TouchableOpacity>
      )}
      {item.status === 'acknowledged' && <Text style={s.doneT}>확인됨</Text>}
      {item.status === 'resolved' && <Text style={[s.doneT, { color: '#16A34A' }]}>해결됨</Text>}
    </View>
  );
}

export default function AlertsScreen() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [emergency, setEmergency] = useState<AlertItem | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const shownRef = useRef(new Set<string>());

  const apiOpts = filter === 'new' ? { status: 'new' as const }
    : filter === 'critical' ? { severity: 'Critical' as const }
    : undefined;

  const { alerts, isLoading, isError, refetch, isFetching } = useAlerts(apiOpts);
  const ackMutation = useAcknowledgeAlert();

  useEffect(() => {
    const found = alerts.find(
      (a) => a.severity === 'Critical' && a.status === 'new' && !shownRef.current.has(a.id),
    );
    if (found) { shownRef.current.add(found.id); setEmergency(found); }
  }, [alerts]);

  const handleAck = useCallback(async (id: string) => {
    if (emergency?.id === id) setEmergency(null);
    setAckingId(id);
    try { await ackMutation.mutateAsync(id); } finally { setAckingId(null); }
  }, [ackMutation, emergency]);

  const handleEmergencyAck = useCallback((id: string) => {
    setEmergency(null); void handleAck(id);
  }, [handleAck]);

  const newCount = alerts.filter((a) => a.status === 'new').length;
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'new', label: '미처리' },
    { key: 'critical', label: '위급' },
  ];

  return (
    <>
      <EmergencyAlertModal alert={emergency} onAcknowledge={handleEmergencyAck} />
      <SafeAreaView style={s.container} edges={['bottom']}>
        {newCount > 0 && (
          <View style={s.banner}>
            <Text style={s.bannerTxt}>미처리 알림 {newCount}건</Text>
          </View>
        )}
        <View style={s.filterRow}>
          {tabs.map((tab) => (
            <TouchableOpacity key={tab.key} style={[s.ftab, filter === tab.key && s.ftabOn]} onPress={() => setFilter(tab.key)}>
              <Text style={[s.ftabTxt, filter === tab.key && s.ftabTxtOn]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} tintColor="#1A5276" />}
        >
          {isLoading && (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#1A5276" />
              <Text style={s.centerTxt}>알림 불러오는 중...</Text>
            </View>
          )}
          {isError && !isLoading && (
            <View style={s.center}>
              <Text style={s.errTxt}>알림을 불러오지 못했습니다</Text>
              <TouchableOpacity onPress={() => void refetch()} style={s.retryBtn}>
                <Text style={s.retryTxt}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isLoading && !isError && alerts.length === 0 && (
            <View style={s.center}><Text style={s.emptyTxt}>알림이 없습니다</Text></View>
          )}
          {alerts.map((a) => (
            <AlertCard key={a.id} item={a} onAck={handleAck} acking={ackingId === a.id} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  banner: { backgroundColor: '#FEE2E2', padding: 12, alignItems: 'center' },
  bannerTxt: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  ftab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  ftabOn: { backgroundColor: '#1A5276' },
  ftabTxt: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  ftabTxtOn: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  centerTxt: { color: '#6B7280', fontSize: 14 },
  errTxt: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1A5276', borderRadius: 8 },
  retryTxt: { color: '#fff', fontWeight: '600' },
  emptyTxt: { color: '#9CA3AF', fontSize: 16 },
  card: { borderRadius: 12, borderWidth: 1.5, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  timeT: { fontSize: 12, color: '#6B7280' },
  titleT: { fontSize: 16, fontWeight: '700', color: '#111827' },
  subT: { fontSize: 13, color: '#6B7280' },
  descT: { fontSize: 13, color: '#6B7280', fontStyle: 'italic' },
  ackBtn: { marginTop: 8, backgroundColor: '#1A5276', borderRadius: 8, padding: 10, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  ackBtnOff: { opacity: 0.6 },
  ackTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  doneT: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginTop: 4 },
});
