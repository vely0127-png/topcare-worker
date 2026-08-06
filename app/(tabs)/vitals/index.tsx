/**
 * 바이탈 현황 — 조회 전용. 입력은 `vitals/measure`.
 *
 * 답하는 질문: "지금 눈여겨봐야 할 분이 누구인가", "오늘 아직 안 잰 분은 누구인가"
 * 소스: GET /api/vitals (실측 vital_sign 최신 1건. 미측정은 값 전부 null)
 *
 * 정직성: 미측정을 정상으로 그리지 않는다. 값이 없으면 '—'와 '미측정'으로 표시하고
 *        정렬에서 위로 올려 "아직 안 잰 사람"이 먼저 보이게 한다.
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useVitals, toRiskLevel, type VitalItem } from '@/lib/hooks/useVitals';
import { toKSTDate, toKSTTime, getKSTToday } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

const RISK = {
  normal: { bg: COLOR.successBg, text: COLOR.success, label: '정상' },
  caution: { bg: COLOR.warningBg, text: COLOR.warning, label: '주의' },
  warning: { bg: COLOR.cautionBg, text: COLOR.caution, label: '경고' },
  critical: { bg: COLOR.dangerBg, text: COLOR.danger, label: '위험' },
} as const;

type RiskLevel = keyof typeof RISK;

const ORDER: Record<RiskLevel, number> = { critical: 0, warning: 1, caution: 2, normal: 3 };

const show = (v: number | null | undefined) => (v == null ? '—' : String(v));

export default function VitalsScreen() {
  const router = useRouter();
  const today = getKSTToday();
  const { data, isLoading, isError, error, refetch, isRefetching } = useVitals();

  const items = data ?? [];
  const measuredToday = (v: VitalItem) =>
    v.measured && v.measuredAt != null && toKSTDate(v.measuredAt) === today;

  // 미측정 먼저 → 그 다음 위험도순
  const sorted = [...items].sort((a, b) => {
    const am = measuredToday(a) ? 1 : 0;
    const bm = measuredToday(b) ? 1 : 0;
    if (am !== bm) return am - bm;
    return ORDER[toRiskLevel(a)] - ORDER[toRiskLevel(b)];
  });

  const notMeasured = items.filter((v) => !measuredToday(v)).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            불러오지 못했습니다: {(error as Error)?.message ?? '알 수 없는 오류'}
          </Text>
          <TouchableOpacity onPress={() => void refetch()} style={styles.retryHit}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLOR.primary} />
          <Text style={styles.centeredText}>바이탈 불러오는 중…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              오늘 미측정 <Text style={styles.summaryNum}>{notMeasured}</Text>
              <Text> / {items.length}명</Text>
            </Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.centeredText}>입소 중인 분이 없습니다</Text>
            </View>
          ) : null}

          {sorted.map((v) => {
            const done = measuredToday(v);
            const risk = RISK[toRiskLevel(v)];
            return (
              <View
                key={v.residentId}
                style={[styles.card, !done && styles.cardPending]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.name}>{v.name}</Text>
                    <Text style={styles.room}>
                      {v.room}
                      {done && v.measuredAt
                        ? ` · ${toKSTTime(v.measuredAt)} 측정`
                        : ' · 오늘 미측정'}
                    </Text>
                  </View>
                  {done ? (
                    <View style={[styles.badge, { backgroundColor: risk.bg }]}>
                      <Text style={[styles.badgeText, { color: risk.text }]}>{risk.label}</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, styles.badgePending]}>
                      <Text style={[styles.badgeText, styles.badgePendingText]}>미측정</Text>
                    </View>
                  )}
                </View>

                <View style={styles.grid}>
                  <Box label="체온" value={show(v.temp)} unit="°C" warn={v.temp != null && v.temp >= 37.5} />
                  <Box label="산소" value={show(v.spo2)} unit="%" warn={v.spo2 != null && v.spo2 <= 95} />
                  <Box label="혈압" value={v.bp === '-' ? '—' : v.bp} unit="mmHg" warn={v.bpSys != null && v.bpSys >= 135} />
                  <Box label="맥박" value={show(v.hr)} unit="bpm" warn={v.hr != null && (v.hr > 130 || v.hr < 40)} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.measureBtn}
          onPress={() => router.push('/(tabs)/vitals/measure')}
        >
          <MaterialCommunityIcons name="thermometer" size={28} color={COLOR.onPrimary} />
          <Text style={styles.measureText}>바이탈 측정하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Box({ label, value, unit, warn }: { label: string; value: string; unit: string; warn: boolean }) {
  const empty = value === '—';
  return (
    <View style={[styles.box, warn && !empty && styles.boxWarn]}>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={[styles.boxValue, warn && !empty && styles.boxValueWarn, empty && styles.boxValueEmpty]}>
        {value}
      </Text>
      <Text style={styles.boxUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.md, gap: SPACE.md, paddingBottom: SPACE.xxl },

  errorBanner: {
    backgroundColor: COLOR.dangerBg, padding: SPACE.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
  },
  errorText: { flex: 1, fontSize: FONT.label, color: COLOR.danger },
  retryHit: { minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  retryText: { fontSize: FONT.body, color: COLOR.danger, fontWeight: '700' },

  centered: { alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centeredText: { fontSize: FONT.body, color: COLOR.textMuted },

  summary: { paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs },
  summaryText: { fontSize: FONT.body, color: COLOR.textSub },
  summaryNum: { fontSize: FONT.metric, fontWeight: '700', color: COLOR.primary },

  card: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg,
    borderWidth: 1, borderColor: COLOR.border, gap: SPACE.md,
  },
  cardPending: { borderColor: COLOR.borderStrong, borderStyle: 'dashed' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  name: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  room: { fontSize: FONT.label, color: COLOR.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.sm },
  badgeText: { fontSize: FONT.label, fontWeight: '700' },
  badgePending: { backgroundColor: COLOR.border },
  badgePendingText: { color: COLOR.textMuted },

  grid: { flexDirection: 'row', gap: SPACE.sm },
  box: { flex: 1, backgroundColor: COLOR.bg, borderRadius: RADIUS.sm, padding: SPACE.sm, alignItems: 'center' },
  boxWarn: { backgroundColor: COLOR.dangerBg },
  boxLabel: { fontSize: FONT.caption, color: COLOR.textMuted },
  boxValue: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, marginTop: 2 },
  boxValueWarn: { color: COLOR.danger },
  boxValueEmpty: { color: COLOR.textFaint },
  boxUnit: { fontSize: FONT.caption, color: COLOR.textFaint },

  footer: {
    padding: SPACE.lg, backgroundColor: COLOR.surface,
    borderTopWidth: 1, borderTopColor: COLOR.border,
  },
  measureBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.md,
    minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
  },
  measureText: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.onPrimary },
});
