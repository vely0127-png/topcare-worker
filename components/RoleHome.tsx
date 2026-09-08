/**
 * 역할별 홈 — 작업 하나를 고르는 큰 버튼 메뉴.
 *
 * 2026-08-06 요양원 PoC 피드백 반영: 사용자층 50~70대 → 1페이지 1작업.
 * 이전 2열 그리드(라벨 15pt, 높이 92)를 1열 큰 버튼(라벨 22pt, 높이 84+)으로 바꿨다.
 * 홈은 "무엇을 할지 고르는 곳"만 담당하고, 고른 작업은 전체화면으로 열린다.
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useSession, useRole } from '@/lib/hooks';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AttendanceCard } from '@/components/AttendanceCard';
import { WidgetPromoCard } from '@/components/WidgetPromoCard';
import { WidgetPinButton } from '@/components/WidgetPinButton';
import { getAppVersionLabel } from '@/lib/utils/app-version';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export interface QuickAction {
  key: string;
  label: string;
  /** 진입 경로. 없으면 홈에 아예 표시하지 않는다(죽은 카드 금지). */
  href?: string;
  hint?: string;
  /** MaterialCommunityIcons 이름 */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** 강조 버튼(그 역할의 주 업무) */
  primary?: boolean;
  /** 처리해야 할 건수 배지. 0이나 undefined면 표시 안 함(가짜 숫자 금지) */
  badge?: number;
}

export function RoleHome({
  title,
  actions,
}: {
  title: string;
  actions: QuickAction[];
}) {
  const router = useRouter();
  const session = useSession();
  const role = useRole();
  const logout = useAuthStore((s) => s.logout);
  const versionLabel = getAppVersionLabel();

  // href 없는 항목은 표시하지 않는다 — 눌러도 아무 일 없는 버튼은
  // 현장에서 "고장난 앱"으로 읽힌다(가짜 성공 금지 원칙과 같은 이유).
  const available = actions.filter((a) => !!a.href);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>{session?.user.name ?? '사용자'}님</Text>
            <Text style={styles.role}>
              {role?.label ?? '-'}
              {session?.orgName ? ` · ${session.orgName}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        {/* 홈 위젯 안내 카드(W2) — 첫 로그인 후 1회만(내부에서 노출 여부 자체 판단),
            Android 아니면 아무것도 렌더링하지 않는다. headerRow 바로 아래(통합 지점 지시). */}
        <WidgetPromoCard />

        {/*
          근태 카드 — 역할 홈 공통 (vc9 GPS 자동 출퇴근).
          여기 있는 이유: 출근은 **앱을 열면 자동으로** 기록되어야 하고(대표 확정),
          홈이 모든 역할의 첫 화면이다. 사람이 누르는 것은 [퇴근] 하나뿐이다.
        */}
        <AttendanceCard />

        <Text style={styles.sectionTitle}>{title}</Text>

        <View style={styles.list}>
          {available.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.button, a.primary && styles.buttonPrimary]}
              onPress={() => router.push(a.href as never)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              {a.icon ? (
                <MaterialCommunityIcons
                  name={a.icon}
                  size={36}
                  color={a.primary ? COLOR.onPrimary : COLOR.primary}
                  style={styles.icon}
                />
              ) : null}
              <View style={styles.flex}>
                <Text style={[styles.label, a.primary && styles.labelPrimary]}>{a.label}</Text>
                {a.hint ? (
                  <Text style={[styles.hint, a.primary && styles.hintPrimary]}>{a.hint}</Text>
                ) : null}
              </View>
              {a.badge && a.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{a.badge > 99 ? '99+' : a.badge}</Text>
                </View>
              ) : null}
              <MaterialCommunityIcons
                name="chevron-right"
                size={32}
                color={a.primary ? COLOR.onPrimary : COLOR.textFaint}
              />
            </TouchableOpacity>
          ))}
        </View>

        {available.length < actions.length ? (
          <Text style={styles.note}>
            그 외 업무는 아직 앱에 없습니다. 웹(관리자 화면)에서 이용하세요.
          </Text>
        ) : null}

        {/* 홈 화면에 위젯 추가 버튼(W2) — 전용 설정 화면이 아직 없어 역할 홈 하단에 둔다
            (components/WidgetPinButton.tsx 통합 지점 주석). Android 아니면 렌더 안 함. */}
        <WidgetPinButton />

        {/* 앱 내 버전 표기(2026-09-08) — 값을 못 구하면 표기 자체를 숨긴다(가짜 값 금지) */}
        {versionLabel ? <Text style={styles.version}>{versionLabel}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  greeting: { fontSize: FONT.title, fontWeight: 'bold', color: COLOR.primary },
  role: { fontSize: FONT.label, color: COLOR.textMuted, marginTop: 2 },
  logoutBtn: {
    paddingHorizontal: SPACE.lg,
    minHeight: TOUCH.min,
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.border,
  },
  logoutText: { color: COLOR.textSub, fontWeight: '600', fontSize: FONT.label },
  sectionTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  list: { gap: SPACE.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    minHeight: TOUCH.menu,
    borderRadius: RADIUS.lg,
    backgroundColor: COLOR.surface,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
    borderWidth: 1,
    borderColor: COLOR.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonPrimary: { backgroundColor: COLOR.primary, borderColor: COLOR.primary },
  icon: { width: 36, textAlign: 'center' },
  label: { fontSize: 22, fontWeight: '700', color: COLOR.text },
  labelPrimary: { color: COLOR.onPrimary },
  hint: { fontSize: FONT.label, color: COLOR.textMuted, marginTop: 2 },
  hintPrimary: { color: 'rgba(255,255,255,0.85)' },
  note: { fontSize: FONT.caption, color: COLOR.textFaint, lineHeight: 20 },
  version: { fontSize: FONT.caption, color: COLOR.textFaint, textAlign: 'center', marginTop: SPACE.sm },
  badge: {
    minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 8,
    backgroundColor: COLOR.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: COLOR.onPrimary, fontSize: FONT.label, fontWeight: '800' },
});
