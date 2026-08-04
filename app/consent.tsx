/**
 * 첫 접속 동의 화면 (2026-08-05)
 * 로그인 후 개인정보 수집·이용 동의(worker_privacy) 미서명이면 이 화면으로 강제 이동
 * (_layout useAuthGuard). 문안은 서버(GET /api/consent)가 정본 — 버전 개정 시 자동 재동의.
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { homeRouteForRole } from '@/lib/auth/roles';
import SignaturePad, { type SignatureData } from '@/components/common/SignaturePad';

const CONSENT_TYPE = 'worker_privacy';

interface ConsentStatus {
  required: boolean;
  signedAt: string | null;
  text: { type: string; version: string; title: string; body: string };
}

export default function ConsentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['consent', CONSENT_TYPE],
    queryFn: () => apiFetch<ConsentStatus>(`/api/consent?type=${CONSENT_TYPE}`),
  });

  const goHome = () => router.replace(homeRouteForRole(session?.user.role));

  async function submit() {
    if (!signature) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/consent', {
        method: 'POST',
        body: { type: CONSENT_TYPE, signature },
      });
      await queryClient.invalidateQueries({ queryKey: ['consent-gate'] });
      await queryClient.invalidateQueries({ queryKey: ['consent', CONSENT_TYPE] });
      goHome();
    } catch (e) {
      Alert.alert('제출 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A5276" />
      </View>
    );
  }

  // 이미 동의됨(레이스·재진입) — 홈으로
  if (data && !data.required) {
    goHome();
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{data?.text.title ?? '개인정보 수집·이용 동의'}</Text>
        <Text style={styles.version}>문안 버전 {data?.text.version}</Text>
        <View style={styles.bodyBox}>
          <Text style={styles.body}>{data?.text.body}</Text>
        </View>

        <Text style={styles.signLabel}>
          서명 {session?.user.name ? `(${session.user.name})` : ''}
        </Text>
        <SignaturePad onChange={setSignature} />

        <TouchableOpacity
          style={[styles.submitBtn, (!signature || submitting) && styles.btnDisabled]}
          disabled={!signature || submitting}
          onPress={submit}
        >
          <Text style={styles.submitText}>{submitting ? '제출 중…' : '동의하고 서명 제출'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
          <Text style={styles.logoutText}>동의하지 않고 로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  version: { fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 14 },
  bodyBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  body: { fontSize: 14, lineHeight: 22, color: '#334155' },
  signLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 20, marginBottom: 8 },
  submitBtn: { backgroundColor: '#1A5276', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logoutBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  logoutText: { color: '#94a3b8', fontSize: 13 },
});
