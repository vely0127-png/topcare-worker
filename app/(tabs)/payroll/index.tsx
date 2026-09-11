/**
 * 급여명세서 — 월별 목록 (2026-09-11 대표 결정 "전자로 진행", 자동화 동등성 빌드)
 *
 * 답하는 질문
 *   "이번 달(또는 지난 달) 얼마 받았지?" / "명세서가 확정됐나?"
 *
 * 소스
 *   GET /api/staff/payroll/mine?year=YYYY (팀W2 구현 중 — 2026-09-11 기준 topcare-web에
 *   아직 라우트 파일 없음. 서버가 배포되기 전에는 이 화면이 로딩 실패로 남는다 —
 *   그것도 정직한 상태이므로 목데이터로 가리지 않는다.)
 *
 * 확정본만 온다 — 초안(draft)은 서버가 애초에 내려주지 않는다(급여 정정 중 노출 방지).
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useSession } from '@/lib/hooks/useAuth';
import { useMyPayrollList, formatWon, formatPayPeriod } from '@/lib/hooks/usePayroll';
import { getKSTToday } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export default function PayrollListScreen() {
  const router = useRouter();
  const session = useSession();
  const staffId = session?.user.staffId ?? null;

  const currentYear = getKSTToday().slice(0, 4);
  const [year, setYear] = useState(currentYear);

  const q = useMyPayrollList(year, !!staffId);
  const items = useMemo(
    () => [...(q.data?.items ?? [])].sort((a, b) => b.payPeriod.localeCompare(a.payPeriod)),
    [q.data],
  );

  if (!staffId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>급여명세서를 볼 수 없습니다</Text>
          <Text style={styles.centeredText}>
            이 계정에 직원 정보가 연결되지 않았습니다{'\n'}(웹 설정 {'>'} 사용자에서 연결)
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.yearRow}>
        <TouchableOpacity
          style={styles.yearBtn}
          onPress={() => setYear((y) => String(Number(y) - 1))}
          accessibilityLabel="이전 연도"
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={COLOR.primary} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}년</Text>
        <TouchableOpacity
          style={styles.yearBtn}
          disabled={year >= currentYear}
          onPress={() => setYear((y) => String(Number(y) + 1))}
          accessibilityLabel="다음 연도"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={26}
            color={year >= currentYear ? COLOR.textFaint : COLOR.primary}
          />
        </TouchableOpacity>
      </View>

      {q.isError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            불러오지 못했습니다: {q.error?.message ?? '네트워크를 확인하세요'}
          </Text>
          <TouchableOpacity onPress={() => void q.refetch()} style={styles.retryHit}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {q.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLOR.primary} />
          <Text style={styles.centeredText}>급여명세서 불러오는 중…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        >
          {items.length === 0 && !q.isError ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>{year}년 확정된 급여명세서가 없습니다</Text>
              <Text style={styles.centeredText}>급여 정산이 확정되면 여기에 표시됩니다.</Text>
            </View>
          ) : null}

          {items.map((it) => (
            <TouchableOpacity
              key={it.payPeriod}
              style={styles.card}
              onPress={() => router.push({ pathname: '/(tabs)/payroll/detail', params: { payPeriod: it.payPeriod } })}
            >
              <View style={styles.flex}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{formatPayPeriod(it.payPeriod)}</Text>
                  {!it.viewedAt ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>미열람</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.netPay}>실수령 {formatWon(it.netPay)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={28} color={COLOR.primary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.md, gap: SPACE.md, paddingBottom: SPACE.xxl },

  yearRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.lg,
    paddingVertical: SPACE.md, backgroundColor: COLOR.surface,
  },
  yearBtn: { minWidth: TOUCH.min, minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  yearText: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, minWidth: 88, textAlign: 'center' },

  errorBanner: {
    backgroundColor: COLOR.dangerBg, padding: SPACE.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
  },
  errorText: { flex: 1, fontSize: FONT.label, color: COLOR.danger },
  retryHit: { minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  retryText: { fontSize: FONT.body, color: COLOR.danger, fontWeight: '700' },

  centered: { alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centeredText: { fontSize: FONT.body, color: COLOR.textMuted, textAlign: 'center', lineHeight: 26 },
  emptyTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg,
    borderWidth: 1, borderColor: COLOR.border, minHeight: TOUCH.menu,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  cardTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  newBadge: { backgroundColor: COLOR.primary, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  newBadgeText: { fontSize: FONT.caption, fontWeight: '700', color: COLOR.onPrimary },
  netPay: { fontSize: FONT.body, color: COLOR.textSub, marginTop: 4, fontWeight: '600' },
});
