/**
 * 오늘 할 일 — 정본 6단계 중 5단계: "요양보호사가 담당 서비스 목록을 확인하고 체크"
 * (P0-2·3, 2026-07-27 워커 감사 재작성 — 이전엔 전면 하드코딩 mock이었고,
 *  체크 화면 자체가 없어 비콘 없는 시설에선 체크할 방법이 0이었다)
 *
 * 웹 ServiceTodoList와 동일 규약:
 *  - 행 = 실제 개인 계획(ServiceSchedule, 반복주기 전개 포함) + 시설 일과표 × 입소자(개인화 유형은 계획 보유자만)
 *  - 체크 = POST service-provisions (startAt=계획 시각 — 슬롯 오판 방지 H8), 해제 = DELETE(연동 기록도 정리)
 *  - 서버 경고(개인계획 없음 C5·활성처방 없음 H4)는 반드시 노출
 */
import { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useServiceSchedules } from '../../lib/hooks/useServiceSchedules';
import {
  useServiceProvisions, useCreateServiceProvision, useDeleteServiceProvision,
  type ServiceProvision,
} from '../../lib/hooks/useServiceProvisions';
import { useResidents } from '../../lib/hooks/useResidents';
import { useApiQuery } from '../../lib/hooks/useApi';
import { SERVICE_TYPES, PERSONAL_TYPES, inferTypeFromActivity, serviceTypeLabel } from '../../lib/care/service-rules';

// ── KST 헬퍼 ──
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
function kstHHMM(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = (d.getUTCHours() * 60 + d.getUTCMinutes() + 9 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function expandInterval(start: string, end: string, intervalMin: number): string[] {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const s = toMin(start), e = toMin(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || intervalMin < 30) return [start];
  const times: string[] = [];
  for (let t = s; t <= e && times.length < 24; t += intervalMin) {
    times.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return times;
}

interface DisplayRow {
  key: string;
  residentId: string;
  residentName: string;
  serviceType: string;
  plannedStart: string | null;
  note: string | null;
  scheduleId: string | null; // null = 일과표 파생(가상)
  dayLabel: string;
}

interface FacilityConfig {
  scheduleConfig?: { dailyRoutine?: { time: string; activity: string }[] } | null;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function TodayTasksScreen() {
  const today = kstToday();
  const todayDow = new Date(`${today}T12:00:00+09:00`).getUTCDay();

  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 500 });
  const residentsQ = useResidents({ status: 'admitted', limit: 200 });
  const facilityQ = useApiQuery<FacilityConfig>(['facility'], '/api/settings/facility', {
    query: { staleTime: 5 * 60_000 },
  });

  const createProvision = useCreateServiceProvision();
  const deleteProvision = useDeleteServiceProvision();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const schedules = schedulesQ.data ?? [];
  const provisions = provisionsQ.data?.items ?? [];
  const residents = residentsQ.data?.items ?? [];
  const routine = (facilityQ.data?.scheduleConfig?.dailyRoutine ?? []).filter((r) => r.time && r.activity);

  const loading = schedulesQ.isLoading || provisionsQ.isLoading || residentsQ.isLoading;
  const fetchError = schedulesQ.error?.message || provisionsQ.error?.message || residentsQ.error?.message || null;

  // ── 행 구성 — 웹 ServiceTodoList와 동일 규약 ──
  const rows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    const nameOf = new Map(residents.map((r) => [r.id, r.name]));

    // 1) 실제 개인 계획 (오늘 요일, 반복주기 전개)
    const real = schedules.filter((s) => s.dayOfWeek == null || s.dayOfWeek === todayDow);
    for (const s of real) {
      const isInterval = Boolean(s.intervalMin && s.plannedStart && s.plannedEnd);
      const times = isInterval ? expandInterval(s.plannedStart!, s.plannedEnd!, s.intervalMin!) : [s.plannedStart];
      for (const t of times) {
        out.push({
          key: isInterval ? `${s.id}|${t}` : s.id,
          residentId: s.residentId,
          residentName: s.residentName ?? nameOf.get(s.residentId) ?? '-',
          serviceType: s.serviceType,
          plannedStart: t,
          note: s.note ?? null,
          scheduleId: s.id,
          dayLabel: isInterval
            ? `${s.intervalMin! >= 60 ? `${Math.floor(s.intervalMin! / 60)}시간` : `${s.intervalMin}분`} 주기`
            : s.dayOfWeek == null ? '매일' : `${DAY_LABELS[s.dayOfWeek]}요일`,
        });
      }
    }

    // 2) 시설 일과표 × 입소자 — 개인화 유형은 개인 계획 보유자에게만 (기저귀 비사용자 제외 규칙)
    const realKeys = new Set(real.map((s) => `${s.residentId}|${s.plannedStart}|${s.note ?? ''}`));
    const personalByResident = new Map<string, Set<string>>();
    for (const s of schedules) {
      if (!personalByResident.has(s.residentId)) personalByResident.set(s.residentId, new Set());
      personalByResident.get(s.residentId)!.add(s.serviceType);
    }
    for (const item of routine) {
      const itemType = inferTypeFromActivity(item.activity);
      for (const r of residents) {
        if (PERSONAL_TYPES.has(itemType) && !personalByResident.get(r.id)?.has(itemType)) continue;
        if (realKeys.has(`${r.id}|${item.time}|${item.activity}`)) continue;
        out.push({
          key: `v|${r.id}|${item.time}|${item.activity}`,
          residentId: r.id,
          residentName: r.name,
          serviceType: itemType,
          plannedStart: item.time,
          note: item.activity,
          scheduleId: null,
          dayLabel: '일과표',
        });
      }
    }

    return out.sort((a, b) =>
      (a.plannedStart ?? '99:99').localeCompare(b.plannedStart ?? '99:99')
      || a.residentName.localeCompare(b.residentName, 'ko'));
  }, [schedules, routine, residents, todayDow]);

  // ── 행 ↔ 제공기록 매칭 (웹과 동일: 실계획=scheduleId(+주기행은 시각), 파생=note→시각 폴백) ──
  const provisionFor = useCallback((row: DisplayRow): ServiceProvision | undefined => {
    if (row.scheduleId) {
      const candidates = provisions.filter((p) => p.scheduleId === row.scheduleId);
      if (row.key.includes('|')) {
        return candidates.find((p) => row.plannedStart != null && kstHHMM(p.startAt) === row.plannedStart);
      }
      return candidates[0];
    }
    const virtuals = provisions.filter((p) => p.scheduleId == null && p.residentId === row.residentId);
    return virtuals.find((p) => p.note === row.note)
      ?? virtuals.find((p) => p.serviceType === row.serviceType && row.plannedStart != null && kstHHMM(p.startAt) === row.plannedStart);
  }, [provisions]);

  const doneCount = rows.filter((r) => provisionFor(r)).length;

  const toggle = async (row: DisplayRow) => {
    if (pendingKeys.has(row.key)) return;
    setPendingKeys((prev) => new Set(prev).add(row.key));
    try {
      const existing = provisionFor(row);
      if (existing) {
        await deleteProvision.mutateAsync({ id: existing.id });
      } else {
        const created = await createProvision.mutateAsync({
          residentId: row.residentId,
          serviceType: row.serviceType,
          serviceDate: today,
          scheduleId: row.scheduleId ?? undefined,
          note: row.scheduleId ? undefined : row.note,
          // H8: 슬롯 판정은 계획 시각 기준 — 체크한 시각을 보내면 식사/투약이 엉뚱한 슬롯에 기록됨
          startAt: row.plannedStart
            ? new Date(`${today}T${row.plannedStart}:00+09:00`).toISOString()
            : new Date().toISOString(),
          source: 'manual',
        });
        // 서버 경고(C5 개인계획 없음·H4 처방 없음)는 반드시 노출
        if (created?.warning) Alert.alert('확인 필요', created.warning);
      }
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '네트워크 오류 — 다시 시도하세요');
    } finally {
      setPendingKeys((prev) => { const n = new Set(prev); n.delete(row.key); return n; });
    }
  };

  const refetchAll = () => {
    void schedulesQ.refetch(); void provisionsQ.refetch(); void residentsQ.refetch(); void facilityQ.refetch();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetchAll} />}
      >
        {/* 헤더 — 날짜 + 진행률 */}
        <View style={styles.dateCard}>
          <Text style={styles.dateText}>{format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}</Text>
          <Text style={styles.progressText}>오늘 서비스 {doneCount}/{rows.length} 완료</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${rows.length ? Math.round((doneCount / rows.length) * 100) : 0}%` }]} />
          </View>
          <Text style={styles.hintText}>체크 = 급여제공기록(초안) 생성 — 관찰·식사·투약 기록에 자동 반영됩니다</Text>
        </View>

        {/* 오류 — 목데이터 폴백 금지, 정직하게 */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBox} onPress={refetchAll}>
            <Text style={styles.errorText}>불러오기 실패: {fetchError}</Text>
            <Text style={styles.errorRetry}>탭하여 다시 시도</Text>
          </TouchableOpacity>
        )}

        {/* 목록 */}
        {loading && rows.length === 0 ? (
          <View style={styles.centerBox}><ActivityIndicator size="large" color="#1A9A8A" /></View>
        ) : rows.length === 0 && !fetchError ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>
              {residents.length === 0
                ? '등록된 입소자가 없습니다'
                : '오늘 계획이 없습니다 — 관리자 웹의 설정>일과표 또는 [계획 추가]에서 등록됩니다'}
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            const done = Boolean(provisionFor(row));
            const busy = pendingKeys.has(row.key);
            return (
              <TouchableOpacity
                key={row.key}
                style={[styles.taskItem, done && styles.taskDone]}
                onPress={() => void toggle(row)}
                disabled={busy}
              >
                <Text style={styles.taskTime}>{row.plannedStart ?? '--:--'}</Text>
                <View style={[styles.taskCheck, done && styles.taskCheckDone]}>
                  {busy ? <ActivityIndicator size="small" color={done ? '#fff' : '#1A9A8A'} />
                    : done ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>
                    {row.residentName} — {row.note || serviceTypeLabel(row.serviceType)}
                  </Text>
                  <Text style={styles.taskMeta}>{serviceTypeLabel(row.serviceType)} · {row.dayLabel}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.footNote}>
          ※ 이 목록의 목적은 서비스제공기록지 작성입니다. 확정은 관리자가 웹에서 수행하며,
          비콘이 설치되면 근접 시 자동으로 초안이 잡힙니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 10 },
  dateCard: { backgroundColor: '#134E4A', borderRadius: 12, padding: 16, gap: 6 },
  dateText: { color: '#fff', fontSize: 14, opacity: 0.85 },
  progressText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#2DD4BF' },
  hintText: { color: '#fff', fontSize: 11, opacity: 0.7, marginTop: 2 },
  errorBox: { backgroundColor: '#FEE2E2', borderColor: '#DC2626', borderWidth: 1, borderRadius: 8, padding: 12 },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '600' },
  errorRetry: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  centerBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  taskItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB', minHeight: 64, // 장갑 낀 손 — 큰 터치 영역
  },
  taskDone: { backgroundColor: '#F0FDFA', borderColor: '#2DD4BF' },
  taskTime: { width: 44, fontSize: 13, fontVariant: ['tabular-nums'], color: '#6B7280', fontWeight: '600' },
  taskCheck: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckDone: { backgroundColor: '#1A9A8A', borderColor: '#1A9A8A' },
  checkmark: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#6B7280' },
  taskMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  footNote: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, marginTop: 8, marginBottom: 24 },
});
