/**
 * 서비스 자동기록 탭 (S4c).
 *
 * - BLE 근접 → enter/exit → 서비스 제공 기록 초안 자동 생성
 * - 오늘 서비스 시작/종료 시각, 제공 횟수, 소요시간
 * - 시간표 대비 미준수 Alert 수신 표시
 * - 초안 확인·승인 UI (완전 자동 확정 금지 — 사람이 최종 확정)
 */
import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

import { useBeaconServiceLog } from '@/lib/hooks/useBeaconServiceLog';
import { useConfirmServiceProvision } from '@/lib/hooks/useServiceProvisions';
import { useAlerts } from '@/lib/hooks/useAlerts';
import { useResidents } from '@/lib/hooks/useResidents';
import type { ServiceProvision, ProvisionStatus } from '@/lib/hooks/useServiceProvisions';
import type { PendingSelection } from '@/lib/hooks/useBeaconServiceLog';
import { SERVICE_TYPES, serviceTypeLabel } from '@/lib/care/service-rules';

// ── 포맷 헬퍼 ────────────────────────────────────────────────
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'HH:mm'); }
  catch { return '—'; }
}

function fmtDuration(min: number | null): string {
  if (!min) return '—';
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

// ── 상태 배지 ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<ProvisionStatus, { label: string; bg: string; text: string }> = {
  draft:     { label: '초안', bg: '#FEF3C7', text: '#92400E' },
  confirmed: { label: '확정', bg: '#DCFCE7', text: '#166534' },
  rejected:  { label: '반려', bg: '#FEE2E2', text: '#991B1B' },
};

function StatusBadge({ status }: { status: ProvisionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ── 서비스 기록 카드 ──────────────────────────────────────────
function ProvisionCard({
  item,
  onConfirm,
  onReject,
  isActive,
}: {
  item: ServiceProvision;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isActive: boolean;
}) {
  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      {isActive && (
        <View style={styles.activeBar}>
          <View style={styles.activeDot} />
          <Text style={styles.activeLabel}>서비스 진행 중</Text>
        </View>
      )}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardResident}>{item.residentName ?? item.residentId}</Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.cardServiceType}>{serviceTypeLabel(item.serviceType)}</Text>
      </View>

      <View style={styles.cardTimeRow}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>시작</Text>
          <Text style={styles.timeValue}>{fmtTime(item.startAt)}</Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={16} color="#9CA3AF" />
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>종료</Text>
          <Text style={styles.timeValue}>{isActive ? '진행 중' : fmtTime(item.endAt)}</Text>
        </View>
        <View style={styles.durationBlock}>
          <Text style={styles.timeLabel}>소요</Text>
          <Text style={styles.durationValue}>{fmtDuration(item.durationMin)}</Text>
        </View>
        <View style={styles.sourceBlock}>
          <MaterialCommunityIcons
            name={item.source === 'beacon' ? 'bluetooth' : 'pencil'}
            size={14}
            color="#9CA3AF"
          />
          <Text style={styles.sourceText}>{item.source === 'beacon' ? '자동' : '수기'}</Text>
        </View>
      </View>

      {item.status === 'draft' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.confirmBtn]}
            onPress={() => onConfirm(item.id)}
          >
            <MaterialCommunityIcons name="check" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>확정</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(item.id)}
          >
            <MaterialCommunityIcons name="close" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>반려</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'confirmed' && item.confirmedAt && (
        <Text style={styles.confirmedMeta}>
          확정: {fmtTime(item.confirmedAt)}
        </Text>
      )}
    </View>
  );
}

// ── 수동 선택 모달 ────────────────────────────────────────────
function SelectionModal({
  pending,
  residents,
  onResolve,
  onDismiss,
}: {
  pending: PendingSelection;
  residents: { id: string; name: string; room: string | null }[];
  onResolve: (residentId: string, serviceType: string) => void;
  onDismiss: () => void;
}) {
  const [selectedResident, setSelectedResident] = useState('');
  const [selectedService, setSelectedService] = useState('');

  // P0-4(2026-07-27): serviceType은 웹 코드값 정본 — 한글 라벨을 값으로 보내면
  // 관찰·식사·투약 자동 연동과 개인계획 경고(C5)가 전부 미발동된다.
  const SERVICE_CHOICES = SERVICE_TYPES.filter((t) => t.value !== 'routine');

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>서비스 기록 확인 필요</Text>
          <Text style={styles.modalDesc}>
            비콘 진입이 감지되었습니다. 어느 어르신께 어떤 서비스를 제공하시나요?
          </Text>
          <Text style={styles.modalLabel}>입주자 선택</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
            <View style={styles.chipRow}>
              {residents.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, selectedResident === r.id && styles.chipOn]}
                  onPress={() => setSelectedResident(r.id)}
                >
                  <Text style={[styles.chipText, selectedResident === r.id && styles.chipTextOn]}>
                    {r.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.modalLabel, { marginTop: 12 }]}>서비스 종류</Text>
          <View style={styles.chipGrid}>
            {SERVICE_CHOICES.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.chip, selectedService === s.value && styles.chipOn]}
                onPress={() => setSelectedService(s.value)}
              >
                <Text style={[styles.chipText, selectedService === s.value && styles.chipTextOn]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onDismiss}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalConfirm,
                (!selectedResident || !selectedService) && styles.modalConfirmDisabled,
              ]}
              disabled={!selectedResident || !selectedService}
              onPress={() => onResolve(selectedResident, selectedService)}
            >
              <Text style={styles.modalConfirmText}>기록 시작</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────
export default function ServiceLogScreen() {
  const {
    supported, scanning, scannerState,
    openServices, todayProvisions, provisionsLoading,
    pendingSelections, serviceError, bleError, todaySummary,
    start, stop,
    resolveSelection, dismissSelection,
  } = useBeaconServiceLog();

  const { mutate: confirmProvision, isPending: isConfirming } = useConfirmServiceProvision();

  // service_compliance Alert 만 표시
  const { alerts } = useAlerts({ status: 'new', limit: 20 });
  const complianceAlerts = useMemo(
    () => alerts.filter((a) => a.type === 'service_compliance'),
    [alerts],
  );

  // 입주자 목록 (수동 선택 모달용)
  const { data: residentsData } = useResidents({ status: '입소 중' });
  const residents = (residentsData?.items ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    room: r.room ?? null,
  }));

  // 현재 열린 서비스의 provisionId set
  const openIds = useMemo(
    () => new Set(openServices.map((o) => o.provisionId)),
    [openServices],
  );

  const handleConfirm = (id: string) => {
    Alert.alert('서비스 확정', '이 서비스 기록을 확정하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '확정',
        style: 'default',
        onPress: () =>
          confirmProvision(
            { id, action: 'confirm' },
            {
              onError: (err) => Alert.alert('확정 실패', err.message),
            },
          ),
      },
    ]);
  };

  const handleReject = (id: string) => {
    Alert.alert('서비스 반려', '이 기록을 반려하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '반려',
        style: 'destructive',
        onPress: () =>
          confirmProvision(
            { id, action: 'reject', reviewNote: '직원 반려' },
            { onError: (err) => Alert.alert('반려 실패', err.message) },
          ),
      },
    ]);
  };

  const scanColor = scanning ? '#16A34A' : '#6B7280';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 수동 선택 모달 — 스택 최상위 */}
      {pendingSelections[0] && (
        <SelectionModal
          pending={pendingSelections[0]}
          residents={residents}
          onResolve={(residentId, serviceType) =>
            resolveSelection(pendingSelections[0].id, residentId, serviceType)
          }
          onDismiss={() => dismissSelection(pendingSelections[0].id)}
        />
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {/* BLE 스캔 토글 */}
        <View style={styles.bleBar}>
          <View style={styles.bleStatus}>
            <View style={[styles.bleDot, { backgroundColor: scanColor }]} />
            <Text style={styles.bleStatusText}>
              {scanning ? '비콘 스캔 중' : '스캔 대기'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.scanBtn, scanning ? styles.scanBtnStop : styles.scanBtnStart]}
            onPress={scanning ? stop : start}
            disabled={!supported}
          >
            <MaterialCommunityIcons
              name={scanning ? 'bluetooth-off' : 'bluetooth'}
              size={15}
              color="#fff"
            />
            <Text style={styles.scanBtnText}>{scanning ? '중지' : '시작'}</Text>
          </TouchableOpacity>
        </View>

        {!supported && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              BLE는 development build에서만 동작합니다. (Expo Go/웹 미지원)
            </Text>
          </View>
        )}
        {(bleError || serviceError) && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{bleError ?? serviceError}</Text>
          </View>
        )}

        {/* 오늘 요약 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{todaySummary.confirmedCount}</Text>
            <Text style={styles.summaryLabel}>확정 완료</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, todaySummary.draftCount > 0 && styles.summaryNumWarn]}>
              {todaySummary.draftCount}
            </Text>
            <Text style={styles.summaryLabel}>초안 대기</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{fmtDuration(todaySummary.totalDurationMin)}</Text>
            <Text style={styles.summaryLabel}>누적 소요</Text>
          </View>
        </View>

        {/* 미준수 Alert */}
        {complianceAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#DC2626" />
              <Text style={[styles.sectionTitle, { color: '#DC2626' }]}>
                미준수 알림 ({complianceAlerts.length})
              </Text>
            </View>
            {complianceAlerts.map((a) => (
              <View key={a.id} style={styles.alertCard}>
                <Text style={styles.alertTitle}>{a.title}</Text>
                {a.description ? (
                  <Text style={styles.alertDesc} numberOfLines={2}>{a.description}</Text>
                ) : null}
                <Text style={styles.alertMeta}>{a.residentName} · {a.roomName}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 오늘 서비스 기록 목록 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 서비스 기록</Text>
          {provisionsLoading ? (
            <ActivityIndicator size="small" color="#1A5276" style={{ paddingVertical: 16 }} />
          ) : todayProvisions.length === 0 ? (
            <Text style={styles.empty}>
              {scanning ? '비콘 진입 시 자동으로 기록됩니다.' : '스캔을 시작하면 서비스 기록이 자동 생성됩니다.'}
            </Text>
          ) : (
            todayProvisions
              .slice()
              .sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''))
              .map((p) => (
                <ProvisionCard
                  key={p.id}
                  item={p}
                  isActive={openIds.has(p.id)}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                />
              ))
          )}
        </View>

        {/* 안내 문구 */}
        <View style={styles.guideBox}>
          <MaterialCommunityIcons name="information-outline" size={14} color="#6B7280" />
          <Text style={styles.guideText}>
            자동 생성된 기록은 초안 상태입니다. 내용을 확인한 후 직접 확정해주세요.
          </Text>
        </View>
      </ScrollView>

      {isConfirming && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },

  bleBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bleStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bleDot: { width: 9, height: 9, borderRadius: 5 },
  bleStatusText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7,
  },
  scanBtnStart: { backgroundColor: '#1A5276' },
  scanBtnStop: { backgroundColor: '#DC2626' },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  warnBox: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12 },
  warnText: { color: '#92400E', fontSize: 12, lineHeight: 18 },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  errorText: { color: '#B91C1C', fontSize: 12 },

  summaryRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10,
    padding: 16, borderWidth: 1, borderColor: '#E5E7EB',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summarySep: { width: 1, backgroundColor: '#E5E7EB' },
  summaryNum: { fontSize: 22, fontWeight: '700', color: '#1A5276' },
  summaryNumWarn: { color: '#D97706' },
  summaryLabel: { fontSize: 11, color: '#6B7280' },

  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { fontSize: 13, color: '#9CA3AF', paddingVertical: 12, textAlign: 'center' },

  // Alert card
  alertCard: {
    backgroundColor: '#FFF7F7', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#FECACA', gap: 3,
  },
  alertTitle: { fontSize: 13, fontWeight: '600', color: '#991B1B' },
  alertDesc: { fontSize: 12, color: '#7F1D1D' },
  alertMeta: { fontSize: 11, color: '#B91C1C', marginTop: 2 },

  // Provision card
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 10,
  },
  cardActive: { borderColor: '#3B82F6', borderWidth: 1.5 },
  activeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3B82F6' },
  activeLabel: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  cardHeader: { gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardResident: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardServiceType: { fontSize: 13, color: '#6B7280' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  },
  timeBlock: { alignItems: 'center', gap: 1 },
  timeLabel: { fontSize: 10, color: '#9CA3AF' },
  timeValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  durationBlock: { marginLeft: 'auto', alignItems: 'flex-end', gap: 1 },
  durationValue: { fontSize: 13, fontWeight: '600', color: '#374151' },
  sourceBlock: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sourceText: { fontSize: 11, color: '#9CA3AF' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 7,
  },
  confirmBtn: { backgroundColor: '#1A5276' },
  rejectBtn: { backgroundColor: '#9CA3AF' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  confirmedMeta: { fontSize: 11, color: '#6B7280' },

  // Selection modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 10, paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#D1D5DB',
    borderRadius: 2, alignSelf: 'center', marginBottom: 6,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 },
  hScroll: { flexGrow: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    padding: 13, alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  modalConfirm: {
    flex: 2, backgroundColor: '#1A5276', borderRadius: 8,
    padding: 13, alignItems: 'center',
  },
  modalConfirmDisabled: { backgroundColor: '#D1D5DB' },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  guideBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#F3F4F6', borderRadius: 8, padding: 12,
  },
  guideText: { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 16 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
});
