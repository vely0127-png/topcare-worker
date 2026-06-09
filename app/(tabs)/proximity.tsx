/**
 * 근접/출퇴근 탭 — BLE 비콘 근접 엔진 모니터.
 *
 * - 스캔 시작/중지
 * - 어댑터/권한 상태
 * - 비콘별 현재 거리 + inside 여부
 * - enter/exit 이벤트 스트림(시간순)
 * - 정문 비콘 enter/exit 시 자동 출퇴근 결과
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useBeaconProximity } from '@/lib/hooks/useBeaconProximity';
import type { ScannerState } from '@/lib/beacon';

const STATE_LABEL: Record<ScannerState, { text: string; color: string }> = {
  idle: { text: '대기', color: '#6B7280' },
  ready: { text: '준비됨', color: '#2563EB' },
  scanning: { text: '스캔 중', color: '#16A34A' },
  poweredOff: { text: '블루투스 꺼짐', color: '#DC2626' },
  unauthorized: { text: '권한 필요', color: '#D97706' },
  unsupported: { text: '미지원(Expo Go/웹)', color: '#9CA3AF' },
};

function fmtTime(ms: number | null): string {
  if (ms == null) return '-';
  return format(new Date(ms), 'HH:mm:ss');
}

function fmtDistance(m: number | null): string {
  if (m == null || !isFinite(m)) return '—';
  return `${m.toFixed(1)}m`;
}

export default function ProximityScreen() {
  const {
    supported,
    scannerState,
    scanning,
    beacons,
    events,
    attendance,
    error,
    start,
    stop,
  } = useBeaconProximity();

  const status = useMemo(() => STATE_LABEL[scannerState], [scannerState]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 상태 + 스캔 토글 */}
        <View style={styles.headerCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: status.color }]} />
            <Text style={styles.statusText}>{status.text}</Text>
          </View>
          <TouchableOpacity
            style={[styles.scanBtn, scanning ? styles.scanBtnStop : styles.scanBtnStart]}
            onPress={scanning ? stop : start}
            disabled={!supported}
          >
            <MaterialCommunityIcons
              name={scanning ? 'bluetooth-off' : 'bluetooth'}
              size={18}
              color="#fff"
            />
            <Text style={styles.scanBtnText}>{scanning ? '스캔 중지' : '스캔 시작'}</Text>
          </TouchableOpacity>
        </View>

        {!supported && (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              BLE 는 네이티브 모듈이라 Expo Go/웹에서는 동작하지 않습니다. development build
              (eas build --profile development) 에서 실행하세요.
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* 출퇴근 결과 */}
        {attendance && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>오늘 출퇴근</Text>
            <View style={styles.attendanceCard}>
              <View style={styles.attCol}>
                <Text style={styles.attLabel}>출근</Text>
                <Text style={styles.attValue}>{fmtTime(attendance.clockIn ? Date.parse(attendance.clockIn) : null)}</Text>
              </View>
              <View style={styles.attDivider} />
              <View style={styles.attCol}>
                <Text style={styles.attLabel}>퇴근</Text>
                <Text style={styles.attValue}>{fmtTime(attendance.clockOut ? Date.parse(attendance.clockOut) : null)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 감지된 비콘 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>감지된 비콘 ({beacons.length})</Text>
          {beacons.length === 0 ? (
            <Text style={styles.empty}>아직 감지된 비콘이 없습니다.</Text>
          ) : (
            beacons.map((b) => (
              <View key={b.uuid} style={styles.beaconCard}>
                <View style={[styles.insideBadge, b.inside ? styles.insideOn : styles.insideOff]}>
                  <MaterialCommunityIcons
                    name={b.inside ? 'map-marker-check' : 'map-marker-outline'}
                    size={16}
                    color={b.inside ? '#16A34A' : '#9CA3AF'}
                  />
                </View>
                <View style={styles.beaconInfo}>
                  <Text style={styles.beaconLabel}>{b.roomLabel ?? '미등록 비콘'}</Text>
                  <Text style={styles.beaconUuid} numberOfLines={1}>
                    {b.uuid}
                  </Text>
                </View>
                <View style={styles.beaconRight}>
                  <Text style={styles.beaconDist}>{fmtDistance(b.distanceMeters)}</Text>
                  <Text style={styles.beaconRssi}>
                    {b.smoothedRssi != null ? `${b.smoothedRssi.toFixed(0)} dBm` : '—'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* enter/exit 이벤트 스트림 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>근접 이벤트</Text>
          {events.length === 0 ? (
            <Text style={styles.empty}>enter/exit 이벤트가 여기에 표시됩니다.</Text>
          ) : (
            events.map((e, i) => (
              <View key={`${e.uuid}-${e.at}-${i}`} style={styles.eventRow}>
                <View
                  style={[
                    styles.eventTag,
                    e.type === 'enter' ? styles.enterTag : styles.exitTag,
                  ]}
                >
                  <Text style={styles.eventTagText}>{e.type === 'enter' ? 'ENTER' : 'EXIT'}</Text>
                </View>
                <Text style={styles.eventLabel} numberOfLines={1}>
                  {e.roomLabel ?? e.uuid.slice(0, 8)}
                </Text>
                <Text style={styles.eventDist}>{fmtDistance(e.distanceMeters)}</Text>
                <Text style={styles.eventTime}>{fmtTime(e.at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 16 },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanBtnStart: { backgroundColor: '#1A5276' },
  scanBtnStop: { backgroundColor: '#DC2626' },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  warnCard: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12 },
  warnText: { color: '#92400E', fontSize: 12, lineHeight: 18 },
  errorCard: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  errorText: { color: '#B91C1C', fontSize: 12 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  empty: { fontSize: 13, color: '#9CA3AF', paddingVertical: 8 },
  attendanceCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  attCol: { flex: 1, alignItems: 'center', gap: 4 },
  attDivider: { width: 1, backgroundColor: '#E5E7EB' },
  attLabel: { fontSize: 12, color: '#6B7280' },
  attValue: { fontSize: 20, fontWeight: '700', color: '#1A5276' },
  beaconCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  insideBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  insideOn: { backgroundColor: '#DCFCE7' },
  insideOff: { backgroundColor: '#F3F4F6' },
  beaconInfo: { flex: 1 },
  beaconLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  beaconUuid: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  beaconRight: { alignItems: 'flex-end' },
  beaconDist: { fontSize: 16, fontWeight: '700', color: '#1A5276' },
  beaconRssi: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  eventTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  enterTag: { backgroundColor: '#DCFCE7' },
  exitTag: { backgroundColor: '#FEE2E2' },
  eventTagText: { fontSize: 10, fontWeight: '800', color: '#374151' },
  eventLabel: { flex: 1, fontSize: 13, color: '#111827' },
  eventDist: { fontSize: 12, color: '#6B7280' },
  eventTime: { fontSize: 12, color: '#9CA3AF', width: 64, textAlign: 'right' },
});
