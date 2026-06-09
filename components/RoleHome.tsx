/**
 * 역할별 홈 공용 스캐폴드 (스켈레톤).
 *
 * S1 기반층 단계 — 실데이터는 채우지 않는다(S2 담당).
 * 인사말 + 역할 + 역할별 주요 기능 진입 카드 + 로그아웃만 제공.
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';

import { useSession, useRole } from '@/lib/hooks';
import { useAuthStore } from '@/lib/auth/auth-store';

export interface QuickAction {
  key: string;
  label: string;
  /** 진입 경로. 아직 미구현 화면은 생략 가능(누르면 비활성 안내). */
  href?: Href;
  hint?: string;
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>
              {session?.user.name ?? '사용자'}님
            </Text>
            <Text style={styles.role}>
              {role?.label ?? '-'} · {session?.orgName ?? ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{title}</Text>

        <View style={styles.grid}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.card, !a.href && styles.cardDisabled]}
              disabled={!a.href}
              onPress={() => a.href && router.push(a.href)}
            >
              <Text style={styles.cardLabel}>{a.label}</Text>
              {a.hint ? <Text style={styles.cardHint}>{a.hint}</Text> : null}
              {!a.href ? <Text style={styles.soon}>준비 중 (S2)</Text> : null}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.note}>
          기반층(S1) 스켈레톤입니다. 각 기능 화면의 실데이터 연동은 S2에서 진행됩니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16 },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#1A5276' },
  role: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  logoutBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#E5E7EB',
  },
  logoutText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%', minHeight: 92, borderRadius: 14, backgroundColor: '#fff',
    padding: 16, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardDisabled: { opacity: 0.55 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  cardHint: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  soon: { fontSize: 11, color: '#9CA3AF', marginTop: 8 },
  note: { fontSize: 12, color: '#9CA3AF', marginTop: 8, lineHeight: 18 },
});
