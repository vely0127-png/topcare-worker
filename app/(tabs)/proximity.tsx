/**
 * 근접/출퇴근 탭 — BLE 비콘 근접 엔진 모니터.
 *
 * - 스캔 시작/중지
 * - 어댑터/권한 상태
 * - 비콘별 현재 거리 + inside 여부
 * - enter/exit 이벤트 스트림(시간순)
 * - 정문 비콘 enter/exit 시 자동 출퇴근 결과
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useBeaconProximity } from '@/lib/hooks/useBeaconProximity';
import { useTodayTasks, kstNowHHMM, type DisplayRow } from '@/lib/hooks/useTodayTasks';
import { useCreateServiceProvision } from '@/lib/hooks/useServiceProvisions';
import { serviceTypeLabel, SERVICE_TYPES } from '@/lib/care/service-rules';
import { apiFetch } from '@/lib/api/client';
import { beaconRegistry, type ScannerState } from '@/lib/beacon';

// 현재 업무 시간창: 계획 시각이 [now-120분, now+30분] 이내 → "지금 이 위치의 업무"
const WINDOW_BEFORE_MIN = 120;
const WINDOW_AFTER_MIN = 30;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

// ── 체류 프롬프트 (2026-08-05): 같은 비콘에 머물면 "무슨 서비스?" 질문 ──
// PoC 튜닝(대표 지시): 30초 체류 시 질문, 재질문 간격 3분. 거리 임계는 현장 조절 예정.
const DWELL_PROMPT_MS = 30_000;       // 30초 체류 시 질문
const DWELL_COOLDOWN_MS = 3 * 60_000; // 같은 비콘 재질문 최소 간격
const DWELL_TICK_MS = 5_000;

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
    getStatuses,
    strongest,
    currentBinding,
    manuallyPaused,
  } = useBeaconProximity();

  const status = useMemo(() => STATE_LABEL[scannerState], [scannerState]);
  const router = useRouter();

  // ── 비콘 주도 서비스 기록 (2026-08-05): 현재 위치 입소자의 업무를 자동 제시 ──
  // 자동은 제시까지 — 기록(확인)은 사람이 탭. 완료 체크는 오늘 할 일과 동일 규약.
  const tasks = useTodayTasks();
  const locationRows = useMemo(() => {
    const residentIds = new Set((currentBinding?.residents ?? []).map((r) => r.id));
    if (residentIds.size === 0) return { now: [] as DisplayRow[], upcoming: [] as DisplayRow[] };
    const nowMin = toMin(kstNowHHMM());
    const mine = tasks.rows.filter((r) => residentIds.has(r.residentId) && r.plannedStart);
    const now: DisplayRow[] = [];
    const upcoming: DisplayRow[] = [];
    for (const r of mine) {
      const t = toMin(r.plannedStart!);
      if (t >= nowMin - WINDOW_BEFORE_MIN && t <= nowMin + WINDOW_AFTER_MIN) now.push(r);
      else if (t > nowMin + WINDOW_AFTER_MIN) upcoming.push(r);
    }
    return { now, upcoming: upcoming.slice(0, 5) };
  }, [currentBinding, tasks.rows]);

  const onCheck = (row: DisplayRow) =>
    void tasks.toggle(
      row,
      (msg) => Alert.alert('확인 필요', msg),
      (msg) => Alert.alert('저장 실패', msg),
    );

  // ── 체류 감지 → 서비스 질문 프롬프트 ──────────────────
  const createProvision = useCreateServiceProvision();
  const [promptOpen, setPromptOpen] = useState(false);
  const [dwellMinutes, setDwellMinutes] = useState(0);
  const [otherType, setOtherType] = useState<string | null>(null);
  const [otherResidentId, setOtherResidentId] = useState<string | null>(null);
  const [adhocBusy, setAdhocBusy] = useState(false);
  const dwellUuidRef = useRef<string | null>(null);
  const dwellStartRef = useRef<number>(0);
  const lastPromptAtRef = useRef<Map<string, number>>(new Map());

  // 최강 비콘이 바뀌면 체류 타이머 리셋
  useEffect(() => {
    const uuid = strongest?.uuid ?? null;
    if (uuid !== dwellUuidRef.current) {
      dwellUuidRef.current = uuid;
      dwellStartRef.current = Date.now();
    }
  }, [strongest?.uuid]);

  // 주기 점검: 체류 시간 초과 + 입소자 있는 위치 + 쿨다운 지남 → 질문
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => {
      const uuid = dwellUuidRef.current;
      if (!uuid || promptOpen) return;
      const dwellMs = Date.now() - dwellStartRef.current;
      if (dwellMs < DWELL_PROMPT_MS) return;
      const binding = currentBinding;
      if (!binding || (binding.residents?.length ?? 0) === 0) return;
      const lastAt = lastPromptAtRef.current.get(uuid) ?? 0;
      if (Date.now() - lastAt < DWELL_COOLDOWN_MS) return;

      lastPromptAtRef.current.set(uuid, Date.now());
      setDwellMinutes(Math.round(dwellMs / 60_000));
      setOtherType(null);
      setOtherResidentId(binding.residents!.length === 1 ? binding.residents![0].id : null);
      setPromptOpen(true);
      // 다른 탭에 있어도 보이도록 로컬 알림 (실패해도 무시 — 프롬프트가 정본)
      void Notifications.scheduleNotificationAsync({
        content: {
          title: `${binding.roomLabel}에 ${Math.round(dwellMs / 60_000)}분째 머무르는 중`,
          body: '어떤 서비스를 제공하고 계신가요? 앱에서 기록해주세요.',
        },
        trigger: null,
      }).catch(() => {});
    }, DWELL_TICK_MS);
    return () => clearInterval(timer);
  }, [scanning, promptOpen, currentBinding]);

  // 체류 프롬프트용 업무 정렬: 현재 시각과 가장 가까운 미완료 업무가 최우선 (2026-08-05)
  const promptTasks = useMemo(() => {
    const residentIds = new Set((currentBinding?.residents ?? []).map((r) => r.id));
    if (residentIds.size === 0) return { primary: null as DisplayRow | null, rest: [] as DisplayRow[] };
    const nowMin = toMin(kstNowHHMM());
    const undone = tasks.rows
      .filter((r) => residentIds.has(r.residentId) && r.plannedStart && !tasks.provisionFor(r))
      .sort((a, b) => Math.abs(toMin(a.plannedStart!) - nowMin) - Math.abs(toMin(b.plannedStart!) - nowMin));
    return { primary: undone[0] ?? null, rest: undone.slice(1, 7) };
  }, [currentBinding, tasks.rows, tasks.provisionFor]);

  // ── 가장 가까운 미등록 기기 원버튼 등록 (2026-08-05) ──
  // 미등록 기기가 수십 개일 때 행별 [등록]은 어느 것이 비콘인지 알 수 없어 무의미.
  // 방금 갖다 댄 비콘(새 랜덤 MAC 포함)은 관측·스무딩에 몇 초 걸리므로,
  // 엔진 실시간 스냅샷(getStatuses)을 6초간 재탐색해 1.5m 이내 최강 기기를 잡는다.
  const NEAR_REGISTER_MAX_M = 1.5;
  const NEAR_SEARCH_MS = 6_000;
  const [nearSearching, setNearSearching] = useState(false);
  const registerNearest = async () => {
    if (nearSearching) return;
    setNearSearching(true);
    try {
      let bestDist: number | null = null;
      const deadline = Date.now() + NEAR_SEARCH_MS;
      while (Date.now() < deadline) {
        const now = Date.now();
        const candidates = getStatuses()
          .filter((b) => b.lastSeenAt != null && now - b.lastSeenAt <= 15_000
            && b.smoothedRssi != null && !beaconRegistry.has(b.uuid))
          .sort((a, b) => (b.smoothedRssi ?? -999) - (a.smoothedRssi ?? -999));
        const top = candidates[0];
        if (top?.distanceMeters != null) {
          bestDist = bestDist == null ? top.distanceMeters : Math.min(bestDist, top.distanceMeters);
          if (top.distanceMeters <= NEAR_REGISTER_MAX_M) {
            router.push({ pathname: '/beacon-register', params: { uuid: top.uuid } });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      Alert.alert(
        '비콘을 더 가까이',
        bestDist == null
          ? '미등록 기기가 감지되지 않았습니다 — 스캔이 켜져 있는지 확인해주세요'
          : `등록할 비콘을 폰에 바짝(손바닥 거리) 댄 상태로 다시 눌러주세요.\n탐색 중 가장 가까웠던 미등록 기기: ${bestDist.toFixed(1)}m`,
      );
    } finally {
      setNearSearching(false);
    }
  };

  /** 시간표 외 업무·라뽀 즉석 기록 — source='beacon'으로 추적 가능하게 */
  const recordAdhoc = async (serviceType: string, note: string, residentId: string) => {
    setAdhocBusy(true);
    try {
      const created = await createProvision.mutateAsync({
        residentId,
        serviceType,
        serviceDate: tasks.today,
        startAt: new Date().toISOString(),
        source: 'beacon',
        note,
      });
      if (created?.warning) Alert.alert('확인 필요', created.warning);
      setPromptOpen(false);
      setOtherType(null);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '네트워크 오류');
    } finally {
      setAdhocBusy(false);
    }
  };

  const renderTaskRow = (row: DisplayRow) => {
    const done = Boolean(tasks.provisionFor(row));
    const busy = tasks.pendingKeys.has(row.key);
    return (
      <TouchableOpacity
        key={row.key}
        style={[styles.locTask, done && styles.locTaskDone]}
        onPress={() => onCheck(row)}
        disabled={busy}
      >
        <Text style={styles.locTaskTime}>{row.plannedStart}</Text>
        <View style={[styles.locTaskCheck, done && styles.locTaskCheckDone]}>
          {busy ? <ActivityIndicator size="small" color={done ? '#fff' : '#1A9A8A'} />
            : done ? <Text style={styles.locCheckmark}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.locTaskTitle, done && styles.locTaskTitleDone]}>
            {row.residentName} — {row.note || serviceTypeLabel(row.serviceType)}
          </Text>
          <Text style={styles.locTaskMeta}>{serviceTypeLabel(row.serviceType)} · {row.dayLabel}</Text>
        </View>
        {!done && <Text style={styles.locConfirm}>확인</Text>}
      </TouchableOpacity>
    );
  };

  // 비콘 등록 권한(workeradmin) — 있으면 등록 진입 버튼 노출 (2026-08-05)
  const beaconPerm = useQuery({
    queryKey: ['beacon-permission'],
    queryFn: () => apiFetch<{ canRegister: boolean }>('/api/beacons?permission=1'),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 상태 + 스캔 토글 — 스캔은 앱을 켜면 자동으로 돈다(2026-08-06).
            여기 버튼은 잠시 끄는 용도이고, 끈 상태는 화면에 정직하게 표시한다. */}
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
            <Text style={styles.scanBtnText}>{scanning ? '잠시 끄기' : '스캔 켜기'}</Text>
          </TouchableOpacity>
        </View>

        {manuallyPaused && (
          <View style={styles.pausedCard}>
            <MaterialCommunityIcons name="bluetooth-off" size={22} color="#B45309" />
            <Text style={styles.pausedText}>
              스캔을 꺼두셨습니다. 현재 위치·자동기록·체류시간이 남지 않습니다.
              평소에는 켜두세요 — 앱을 켜면 저절로 돕니다.
            </Text>
          </View>
        )}

        {beaconPerm.data?.canRegister && (
          <TouchableOpacity
            style={styles.registerEntry}
            onPress={() => router.push('/beacon-register')}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={18} color="#1A5276" />
            <Text style={styles.registerEntryText}>비콘 등록 (QR 스캔)</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}

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

        {/* ── 현재 위치 (신호 최강 비콘) + 해당 위치 업무 자동 제시 ── */}
        {scanning && strongest && (
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <MaterialCommunityIcons name="map-marker-radius" size={22} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>
                  현재 위치: {currentBinding?.roomLabel ?? strongest.roomLabel ?? '미등록 비콘'}
                </Text>
                <Text style={styles.locationMeta}>
                  {fmtDistance(strongest.distanceMeters)} · {strongest.smoothedRssi?.toFixed(0) ?? '—'} dBm
                  {(currentBinding?.residents?.length ?? 0) > 0
                    ? ` · ${currentBinding!.residents!.map((r) => r.name).join(', ')}`
                    : ''}
                </Text>
              </View>
            </View>

            {(currentBinding?.residents?.length ?? 0) === 0 ? (
              <Text style={styles.locationEmpty}>
                {currentBinding ? '이 위치에 배정된 입소자가 없습니다 (웹 설정 › 비콘에서 배정)' : '미등록 비콘 — [비콘 등록]에서 등록하면 업무가 자동 제시됩니다'}
              </Text>
            ) : (
              <>
                <Text style={styles.locSection}>지금 이 위치의 업무</Text>
                {locationRows.now.length === 0
                  ? <Text style={styles.locationEmpty}>이 시간대 계획된 업무가 없습니다</Text>
                  : locationRows.now.map(renderTaskRow)}
                {locationRows.upcoming.length > 0 && (
                  <>
                    <Text style={styles.locSection}>다음 업무 (시간 되면 확인)</Text>
                    {locationRows.upcoming.map(renderTaskRow)}
                  </>
                )}
              </>
            )}
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

        {/* 감지된 비콘 — 등록 비콘 우선, 미등록은 가까운 5개만 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>감지된 비콘 ({beacons.length})</Text>
          {scanning && beaconPerm.data?.canRegister && (
            <TouchableOpacity style={[styles.nearestBtn, nearSearching && { opacity: 0.7 }]} onPress={() => void registerNearest()} disabled={nearSearching}>
              {nearSearching
                ? <ActivityIndicator size="small" color="#fff" />
                : <MaterialCommunityIcons name="cellphone-nfc" size={18} color="#fff" />}
              <Text style={styles.nearestBtnText}>
                {nearSearching ? '가까운 비콘 찾는 중… (비콘을 대고 계세요)' : '비콘을 폰에 바짝 대고 등록'}
              </Text>
            </TouchableOpacity>
          )}
          {(() => {
              const sorted = [...beacons].sort((a, b) =>
                Number(beaconRegistry.has(b.uuid)) - Number(beaconRegistry.has(a.uuid))
                || (b.smoothedRssi ?? -999) - (a.smoothedRssi ?? -999));
              const registeredList = sorted.filter((b) => beaconRegistry.has(b.uuid));
              const unregistered = sorted.filter((b) => !beaconRegistry.has(b.uuid));
              const shown = [...registeredList, ...unregistered.slice(0, 5)];
              const hiddenCount = unregistered.length - Math.min(5, unregistered.length);
              // 등록됐지만 현재 신호가 없는 비콘 — 목록에서 사라지지 않게 항상 표시 (2026-08-05)
              const seenIds = new Set(sorted.map((b) => b.uuid));
              const offline = beaconRegistry.all().filter((bd) => !seenIds.has(bd.uuid));
              return (
                <>
                  {beacons.length === 0 && (
                    <View>
                      <Text style={styles.empty}>아직 감지된 비콘이 없습니다.</Text>
                      {scanning && (
                        <Text style={styles.scanHint}>
                          계속 안 잡히면 확인: ① 폰의 위치(GPS) 켜기 ② 블루투스 켜기
                          ③ 설정 › 앱 › TopCare 종사자 › 권한에서 위치·주변기기 허용
                        </Text>
                      )}
                    </View>
                  )}
                  {offline.map((bd) => (
                    <View key={`off-${bd.uuid}`} style={[styles.beaconCard, styles.beaconOffline]}>
                      <View style={[styles.insideBadge, styles.insideOff]}>
                        <MaterialCommunityIcons name="bluetooth-off" size={16} color="#9CA3AF" />
                      </View>
                      <View style={styles.beaconInfo}>
                        <Text style={styles.beaconLabelOffline}>{bd.roomLabel}  · 신호 없음</Text>
                        {(bd.residents?.length ?? 0) > 0 && (
                          <Text style={styles.beaconResidentsOffline}>{bd.residents!.map((r) => r.name).join(' · ')}</Text>
                        )}
                        <Text style={styles.beaconUuid} numberOfLines={1}>{bd.uuid}</Text>
                        <Text style={styles.beaconOfflineHint}>
                          비콘 식별자가 바뀌었을 수 있음 — 비콘을 폰에 대고 등록 후 QR 재스캔하면 이 등록에 재연결됩니다
                        </Text>
                      </View>
                    </View>
                  ))}
                  {shown.map((b) => {
                const isStrongest = strongest?.uuid === b.uuid;
                const binding = beaconRegistry.get(b.uuid);
                const registered = Boolean(binding);
                const residentNames = (binding?.residents ?? []).map((r) => r.name);
                return (
                  <TouchableOpacity
                    key={b.uuid}
                    activeOpacity={0.9}
                    onLongPress={() => Alert.alert('광고 원본 (진단)', `식별자: ${b.uuid}\n\n${b.raw ?? '원본 정보 없음'}`)}
                    style={[
                      styles.beaconCard,
                      registered && styles.beaconRegistered,
                      isStrongest && styles.beaconStrongest,
                    ]}
                  >
                    <View style={[styles.insideBadge, b.inside ? styles.insideOn : styles.insideOff]}>
                      <MaterialCommunityIcons
                        name={isStrongest ? 'map-marker-radius' : registered ? 'map-marker-check' : 'bluetooth'}
                        size={16}
                        color={isStrongest ? '#1D4ED8' : registered ? '#16A34A' : '#9CA3AF'}
                      />
                    </View>
                    <View style={styles.beaconInfo}>
                      <Text style={[
                        styles.beaconLabel,
                        registered && styles.beaconLabelRegistered,
                        isStrongest && styles.beaconLabelStrong,
                      ]}>
                        {registered ? binding!.roomLabel : '미등록 기기'}
                        {isStrongest ? '  ⦿ 현재 위치' : registered ? '  ✓ 등록됨' : ''}
                      </Text>
                      {registered && residentNames.length > 0 && (
                        <Text style={styles.beaconResidents}>
                          {residentNames.join(' · ')}
                        </Text>
                      )}
                      {registered && residentNames.length === 0 && binding!.roomId && (
                        <Text style={styles.beaconNoResident}>입소자 미배정 — 웹 설정 › 비콘에서 배정</Text>
                      )}
                      <Text style={styles.beaconUuid} numberOfLines={1}>
                        {b.name ? `${b.name} · ` : ''}{b.uuid}
                      </Text>
                    </View>
                    <View style={styles.beaconRight}>
                      <Text style={[styles.beaconDist, isStrongest && styles.beaconLabelStrong]}>{fmtDistance(b.distanceMeters)}</Text>
                      <Text style={styles.beaconRssi}>
                        {b.smoothedRssi != null ? `${b.smoothedRssi.toFixed(0)} dBm` : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
                  })}
                  {hiddenCount > 0 && (
                    <Text style={styles.hiddenNote}>
                      미등록 기기 {hiddenCount}개 더 감지됨 — 등록은 비콘을 폰에 대고 위 버튼으로
                    </Text>
                  )}
                </>
              );
            })()}
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

      {/* ── 체류 질문 모달 (2026-08-05): 오래 머문 위치에서 무엇을 했는지 ── */}
      <Modal visible={promptOpen} animationType="slide" transparent onRequestClose={() => setPromptOpen(false)}>
        <View style={styles.promptBackdrop}>
          <View style={styles.promptSheet}>
            <Text style={styles.promptTitle}>
              {currentBinding?.roomLabel ?? '이 위치'}에 {dwellMinutes}분째 머무르는 중
            </Text>
            {/* 이 위치의 입소자 — 웹 등록 이름 하이라이트 */}
            <View style={styles.promptResidents}>
              {(currentBinding?.residents ?? []).map((r) => (
                <View key={r.id} style={styles.promptResidentChip}>
                  <Text style={styles.promptResidentName}>{r.name}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.promptSub}>어떤 서비스를 제공하고 계신가요?</Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* ① 지금 시각과 가장 가까운 업무 — 최우선 강조 */}
              {promptTasks.primary && (
                <>
                  <Text style={styles.promptSection}>지금 할 업무</Text>
                  <TouchableOpacity
                    style={styles.promptPrimary}
                    disabled={tasks.pendingKeys.has(promptTasks.primary.key)}
                    onPress={() => { onCheck(promptTasks.primary!); setPromptOpen(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promptPrimaryType}>
                        {serviceTypeLabel(promptTasks.primary.serviceType)}
                        <Text style={styles.promptPrimaryTime}>  {promptTasks.primary.plannedStart}</Text>
                      </Text>
                      <Text style={styles.promptPrimaryText}>
                        <Text style={styles.promptNameHl}>{promptTasks.primary.residentName}</Text>
                        {'  '}{promptTasks.primary.note || serviceTypeLabel(promptTasks.primary.serviceType)}
                      </Text>
                    </View>
                    <View style={styles.promptPrimaryBtn}>
                      <Text style={styles.promptPrimaryBtnText}>진행함</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {/* ② 나머지 시간표 업무 — 아래에서 선택 */}
              {promptTasks.rest.length > 0 && (
                <>
                  <Text style={styles.promptSection}>다른 시간대 업무</Text>
                  {promptTasks.rest.map((row) => (
                    <TouchableOpacity
                      key={row.key}
                      style={styles.promptOption}
                      disabled={tasks.pendingKeys.has(row.key)}
                      onPress={() => { onCheck(row); setPromptOpen(false); }}
                    >
                      <Text style={styles.promptOptionText}>
                        {row.plannedStart}  <Text style={styles.promptNameHl}>{row.residentName}</Text> — {row.note || serviceTypeLabel(row.serviceType)}
                      </Text>
                      <Text style={styles.promptOptionDo}>진행함</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ③ 라뽀 (대화·놀이) */}
              <Text style={styles.promptSection}>라뽀 (대화·놀이)</Text>
              {(currentBinding?.residents ?? []).map((r) => (
                <TouchableOpacity
                  key={`rapport-${r.id}`}
                  style={[styles.promptOption, styles.promptRapport]}
                  disabled={adhocBusy}
                  onPress={() => void recordAdhoc('routine', '라뽀 — 대화·놀이(정서지원)', r.id)}
                >
                  <Text style={styles.promptOptionText}>{r.name}님과 대화·놀이</Text>
                  <MaterialCommunityIcons name="heart-outline" size={18} color="#DB2777" />
                </TouchableOpacity>
              ))}

              {/* ④ 시간표에 없는 업무 */}
              <Text style={styles.promptSection}>다른 업무</Text>
              <View style={styles.promptChips}>
                {SERVICE_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.promptChip, otherType === t.value && styles.promptChipOn]}
                    onPress={() => setOtherType(otherType === t.value ? null : t.value)}
                  >
                    <Text style={[styles.promptChipText, otherType === t.value && styles.promptChipTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {otherType && (currentBinding?.residents?.length ?? 0) > 1 && (
                <View style={styles.promptChips}>
                  {(currentBinding?.residents ?? []).map((r) => (
                    <TouchableOpacity
                      key={`res-${r.id}`}
                      style={[styles.promptChip, otherResidentId === r.id && styles.promptChipOn]}
                      onPress={() => setOtherResidentId(r.id)}
                    >
                      <Text style={[styles.promptChipText, otherResidentId === r.id && styles.promptChipTextOn]}>{r.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {otherType && (
                <TouchableOpacity
                  style={[styles.promptSubmit, (!otherResidentId || adhocBusy) && { opacity: 0.4 }]}
                  disabled={!otherResidentId || adhocBusy}
                  onPress={() => otherResidentId && void recordAdhoc(otherType, '[비콘] 현장 확인 기록', otherResidentId)}
                >
                  <Text style={styles.promptSubmitText}>
                    {adhocBusy ? '기록 중…' : `${serviceTypeLabel(otherType)} 기록`}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.promptLater} onPress={() => setPromptOpen(false)}>
              <Text style={styles.promptLaterText}>나중에</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 16 },
  registerEntry: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#dbeafe',
  },
  registerEntryText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A5276' },
  // 현재 위치 카드 + 위치 업무 (2026-08-05)
  locationCard: { backgroundColor: '#1A5276', borderRadius: 12, padding: 14, gap: 10 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  locationMeta: { color: '#fff', fontSize: 15, opacity: 0.8, marginTop: 2 },
  locationEmpty: { color: '#fff', fontSize: 16, opacity: 0.75, paddingVertical: 4 },
  locSection: { color: '#fff', fontSize: 15, fontWeight: '700', opacity: 0.85, marginTop: 4 },
  locTask: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12, minHeight: 56,
  },
  locTaskDone: { backgroundColor: '#F0FDFA' },
  locTaskTime: { width: 42, fontSize: 16, fontVariant: ['tabular-nums'], color: '#6B7280', fontWeight: '600' },
  locTaskCheck: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  locTaskCheckDone: { backgroundColor: '#1A9A8A', borderColor: '#1A9A8A' },
  locCheckmark: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  locTaskTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  locTaskTitleDone: { textDecorationLine: 'line-through', color: '#6B7280' },
  locTaskMeta: { fontSize: 14, color: '#9CA3AF', marginTop: 1 },
  locConfirm: { fontSize: 15, fontWeight: '700', color: '#1A9A8A' },
  beaconRegistered: { borderColor: '#86EFAC', borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  beaconStrongest: { borderColor: '#1D4ED8', borderWidth: 2.5, backgroundColor: '#EFF6FF' },
  beaconLabelRegistered: { color: '#15803D', fontWeight: '800' },
  beaconLabelStrong: { color: '#1D4ED8' },
  beaconResidents: { fontSize: 16, fontWeight: '800', color: '#1D4ED8', marginTop: 2 },
  beaconNoResident: { fontSize: 14, color: '#D97706', marginTop: 2 },
  nearestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1A5276', borderRadius: 10, paddingVertical: 13, marginBottom: 10,
  },
  nearestBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hiddenNote: { fontSize: 15, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },
  beaconOffline: { opacity: 0.75, borderStyle: 'dashed', borderColor: '#CBD5E1' },
  beaconLabelOffline: { fontSize: 16, fontWeight: '700', color: '#6B7280' },
  beaconResidentsOffline: { fontSize: 16, fontWeight: '700', color: '#64748B', marginTop: 1 },
  beaconOfflineHint: { fontSize: 14, color: '#D97706', marginTop: 3, lineHeight: 15 },
  scanHint: { fontSize: 15, color: '#D97706', lineHeight: 18, marginTop: 8 },
  registerChip: { backgroundColor: '#1A5276', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  registerChipText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // 체류 질문 모달 (2026-08-05)
  promptBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  promptSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  promptTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  promptSub: { fontSize: 16, color: '#64748b', marginTop: 4, marginBottom: 8 },
  promptSection: { fontSize: 15, fontWeight: '700', color: '#94a3b8', marginTop: 14, marginBottom: 6 },
  promptOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 13, marginBottom: 6,
    borderWidth: 1, borderColor: '#E2E8F0', minHeight: 52,
  },
  promptRapport: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  promptOptionText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  promptOptionDo: { fontSize: 16, fontWeight: '700', color: '#1A9A8A' },
  promptChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  promptChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#fff' },
  promptChipOn: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  promptChipText: { fontSize: 15.5, color: '#334155' },
  promptChipTextOn: { color: '#fff', fontWeight: '700' },
  promptSubmit: { backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  promptSubmitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  promptLater: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  promptLaterText: { color: '#94a3b8', fontSize: 16 },
  promptResidents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  promptResidentChip: { backgroundColor: '#EFF6FF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#BFDBFE' },
  promptResidentName: { fontSize: 16, fontWeight: '800', color: '#1D4ED8' },
  promptNameHl: { fontWeight: '800', color: '#1D4ED8' },
  promptPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0FDFA', borderRadius: 12, padding: 16,
    borderWidth: 2, borderColor: '#1A9A8A', minHeight: 72,
  },
  promptPrimaryType: { fontSize: 16, fontWeight: '700', color: '#0F766E' },
  promptPrimaryTime: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  promptPrimaryText: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 3 },
  promptPrimaryBtn: { backgroundColor: '#1A9A8A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  promptPrimaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
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
  statusText: { fontSize: 17, fontWeight: '600', color: '#111827' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 56, // 터치 최소 — 50~70대 기준(lib/theme TOUCH.min)
    borderRadius: 8,
  },
  pausedCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 14,
  },
  pausedText: { flex: 1, color: '#92400E', fontSize: 16, fontWeight: '600', lineHeight: 23 },
  scanBtnStart: { backgroundColor: '#1A5276' },
  scanBtnStop: { backgroundColor: '#DC2626' },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  warnCard: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12 },
  warnText: { color: '#92400E', fontSize: 15, lineHeight: 18 },
  errorCard: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  errorText: { color: '#B91C1C', fontSize: 15 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  empty: { fontSize: 16, color: '#9CA3AF', paddingVertical: 8 },
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
  attLabel: { fontSize: 15, color: '#6B7280' },
  attValue: { fontSize: 22, fontWeight: '700', color: '#1A5276' },
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
  beaconLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
  beaconUuid: { fontSize: 14, color: '#9CA3AF', marginTop: 2 },
  beaconRight: { alignItems: 'flex-end' },
  beaconDist: { fontSize: 18, fontWeight: '700', color: '#1A5276' },
  beaconRssi: { fontSize: 14, color: '#6B7280', marginTop: 2 },
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
  eventTagText: { fontSize: 14, fontWeight: '800', color: '#374151' },
  eventLabel: { flex: 1, fontSize: 16, color: '#111827' },
  eventDist: { fontSize: 15, color: '#6B7280' },
  eventTime: { fontSize: 15, color: '#9CA3AF', width: 64, textAlign: 'right' },
});
