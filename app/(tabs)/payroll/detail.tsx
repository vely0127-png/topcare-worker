/**
 * 급여명세서 상세 (2026-09-11 "자동화 동등성" 빌드)
 *
 * 답하는 질문
 *   "이번 달 실수령액이 어떻게 나왔지?" / "공제 항목이 뭐가 빠져나갔지?"
 *
 * 소스
 *   GET  /api/staff/payroll/payslip?staffId=<본인>&payPeriod=  (topcare-web, 팀W2 정본)
 *   POST /api/staff/payroll/payslip/view { payPeriod }         (열람 기록, 팀W2 — 아직 라우트 없음
 *        · 2026-09-11 감사. 실패해도 화면 표시는 막지 않는다 — 열람 기록은 부가 효과다.)
 *
 * 정직성
 *   - itemized=false(구 방식) 배포에서는 4대보험을 항목별로 쪼개지 않고 합계만 보여준다 —
 *     없는 항목을 지어내지 않는다.
 *   - approxTax=true 면 "근사치" 안내를 숨기지 않는다(세무 프로필 미등록 상태를 그대로 노출).
 *   - basis(계산 근거) 필드가 없는 배포에서는 "계산 근거 보기" 섹션 자체를 렌더링하지 않는다
 *     (없는 것을 있는 것처럼 빈 버튼으로 남기지 않는다).
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useSession } from '@/lib/hooks/useAuth';
import { usePayslip, useMarkPayslipViewed, formatWon, formatPayPeriod } from '@/lib/hooks/usePayroll';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export default function PayrollDetailScreen() {
  const { payPeriod } = useLocalSearchParams<{ payPeriod?: string }>();
  const session = useSession();
  const staffId = session?.user.staffId ?? null;

  const q = usePayslip(staffId, payPeriod ?? null);
  const { mutate: markViewed } = useMarkPayslipViewed();
  const [showEmployer, setShowEmployer] = useState(false);
  const viewedRef = useRef<string | null>(null);

  // 열람 기록은 상세가 성공적으로 뜬 뒤 딱 1회만 — 부가 효과라 실패해도 화면을 막지 않는다.
  useEffect(() => {
    if (q.data && payPeriod && viewedRef.current !== payPeriod) {
      viewedRef.current = payPeriod;
      markViewed({ payPeriod });
    }
  }, [q.data, payPeriod, markViewed]);

  if (!staffId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>급여명세서를 볼 수 없습니다</Text>
          <Text style={styles.centeredText}>이 계정에 직원 정보가 연결되지 않았습니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (q.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLOR.primary} />
          <Text style={styles.centeredText}>명세서 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (q.isError || !q.data) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>명세서를 불러오지 못했습니다</Text>
          <Text style={styles.centeredText}>{q.error?.message ?? '해당 월의 급여 명세가 없습니다'}</Text>
          <TouchableOpacity onPress={() => void q.refetch()} style={styles.retryHit}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const d = q.data;
  const allowanceTotal = d.payItems.allowanceTotal
    ?? d.payItems.allowanceItems.reduce((s, a) => s + a.amount, 0);
  const hasDeductionBreakdown = d.deductionItems.pension != null
    || d.deductionItems.health != null
    || d.deductionItems.ltc != null
    || d.deductionItems.employment != null
    || d.deductionItems.incomeTax != null
    || d.deductionItems.localTax != null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.headerPeriod}>{formatPayPeriod(d.payPeriod)} 급여명세서</Text>
          <Text style={styles.headerSub}>
            {d.facilityName} · {d.staffName}{d.role ? ` · ${d.role}` : ''}
          </Text>
          {d.payDay != null ? <Text style={styles.headerSub}>지급일 매월 {d.payDay}일</Text> : null}
        </View>

        <View style={styles.netCard}>
          <Text style={styles.netLabel}>실수령액</Text>
          <Text style={styles.netValue}>{formatWon(d.netPay)}</Text>
        </View>

        {d.approxTax ? (
          <View style={styles.noticeBanner}>
            <MaterialCommunityIcons name="information-outline" size={20} color={COLOR.warning} />
            <Text style={styles.noticeText}>
              세무 프로필이 등록되지 않아 세금·보험료는 정률로 근사 계산된 값입니다.
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>지급 항목</Text>
          <Row label="기본급" value={formatWon(d.payItems.baseSalary)} />
          {d.payItems.overtimePay > 0 ? <Row label="초과근무수당" value={formatWon(d.payItems.overtimePay)} /> : null}
          {d.payItems.allowanceItems.map((a, i) => (
            <Row key={`${a.name}-${i}`} label={a.name} value={formatWon(a.amount)} />
          ))}
          {d.payItems.allowanceItems.length === 0 && allowanceTotal > 0 ? (
            <Row label="수당" value={formatWon(allowanceTotal)} />
          ) : null}
          <Row label="지급 합계" value={formatWon(d.payItems.grossPay)} strong />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>공제 항목</Text>
          {hasDeductionBreakdown ? (
            <>
              <Row label="국민연금" value={formatWon(d.deductionItems.pension)} />
              <Row label="건강보험" value={formatWon(d.deductionItems.health)} />
              <Row label="장기요양보험" value={formatWon(d.deductionItems.ltc)} />
              <Row label="고용보험" value={formatWon(d.deductionItems.employment)} />
              <Row label="소득세" value={formatWon(d.deductionItems.incomeTax)} />
              <Row label="지방소득세" value={formatWon(d.deductionItems.localTax)} />
            </>
          ) : (
            <>
              {d.deductionItems.insurance != null ? <Row label="4대보험" value={formatWon(d.deductionItems.insurance)} /> : null}
              {d.deductionItems.taxDeduction != null ? <Row label="세금" value={formatWon(d.deductionItems.taxDeduction)} /> : null}
            </>
          )}
          {(d.deductionItems.otherDeductionItems ?? []).map((it, i) => (
            <Row key={`${it.name}-${i}`} label={it.name} value={formatWon(it.amount)} />
          ))}
          {(d.deductionItems.otherDeductionItems ?? []).length === 0 && d.deductionItems.otherDeduction > 0 ? (
            <Row label="기타 공제" value={formatWon(d.deductionItems.otherDeduction)} />
          ) : null}
          <Row label="공제 합계" value={formatWon(d.deductionItems.totalDeduction)} strong />
        </View>

        {d.employerContribution ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapseHeader}
              onPress={() => setShowEmployer((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={styles.sectionTitle}>기관 부담금</Text>
              <MaterialCommunityIcons
                name={showEmployer ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={COLOR.textMuted}
              />
            </TouchableOpacity>
            {showEmployer ? (
              <>
                <Row label="국민연금(기관)" value={formatWon(d.employerContribution.pension)} />
                <Row label="건강보험(기관)" value={formatWon(d.employerContribution.health)} />
                <Row label="장기요양보험(기관)" value={formatWon(d.employerContribution.ltc)} />
                <Row label="고용보험(기관)" value={formatWon(d.employerContribution.employment)} />
                {d.employerContribution.accident != null ? (
                  <Row label="산재보험(기관)" value={formatWon(d.employerContribution.accident)} />
                ) : null}
                {d.employerContribution.severanceReserve != null ? (
                  <Row label="퇴직급여충당(기관)" value={formatWon(d.employerContribution.severanceReserve)} />
                ) : null}
                <Row label="기관 부담 합계" value={formatWon(d.employerContribution.total)} strong />
              </>
            ) : null}
          </View>
        ) : null}

        {d.basis ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계산 근거</Text>
            <Text style={styles.basisText}>{d.basis}</Text>
          </View>
        ) : null}

        {d.workRecord ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>근무 기록</Text>
            {d.workRecord.workDays != null ? <Row label="근무일수" value={`${d.workRecord.workDays}일`} /> : null}
            {d.workRecord.workHours != null ? <Row label="근무시간" value={`${d.workRecord.workHours}시간`} /> : null}
            {d.workRecord.overtimeHours != null ? <Row label="초과근무시간" value={`${d.workRecord.overtimeHours}시간`} /> : null}
            {d.workRecord.nightHours != null ? <Row label="야간시간" value={`${d.workRecord.nightHours}시간`} /> : null}
            {d.workRecord.holidayHours != null ? <Row label="휴일시간" value={`${d.workRecord.holidayHours}시간`} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.md, gap: SPACE.md, paddingBottom: SPACE.xxl },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centeredText: { fontSize: FONT.body, color: COLOR.textMuted, textAlign: 'center', lineHeight: 26 },
  emptyTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, textAlign: 'center' },
  retryHit: { minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.md },
  retryText: { fontSize: FONT.body, color: COLOR.primary, fontWeight: '700' },

  headerCard: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg,
    borderWidth: 1, borderColor: COLOR.border, gap: 2,
  },
  headerPeriod: { fontSize: FONT.title, fontWeight: '700', color: COLOR.text },
  headerSub: { fontSize: FONT.label, color: COLOR.textMuted },

  netCard: {
    backgroundColor: COLOR.primary, borderRadius: RADIUS.lg, padding: SPACE.xl,
    alignItems: 'center', gap: SPACE.xs,
  },
  netLabel: { fontSize: FONT.body, color: COLOR.onPrimary, fontWeight: '600' },
  netValue: { fontSize: FONT.display, color: COLOR.onPrimary, fontWeight: '800' },

  noticeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLOR.warningBg, borderRadius: RADIUS.md, padding: SPACE.md,
  },
  noticeText: { flex: 1, fontSize: FONT.label, color: COLOR.warning, lineHeight: 22 },

  section: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg,
    borderWidth: 1, borderColor: COLOR.border, gap: SPACE.sm,
  },
  sectionTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, marginBottom: SPACE.xs },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH.min },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { fontSize: FONT.label, color: COLOR.textSub },
  rowLabelStrong: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  rowValue: { fontSize: FONT.label, color: COLOR.text, fontVariant: ['tabular-nums'] },
  rowValueStrong: { fontSize: FONT.body, fontWeight: '800', color: COLOR.text, fontVariant: ['tabular-nums'] },

  basisText: { fontSize: FONT.label, color: COLOR.textSub, lineHeight: 24 },
});
