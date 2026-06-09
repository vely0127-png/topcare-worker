import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/auth/auth-store';
import { homeRouteForRole } from '@/lib/auth/roles';

/**
 * 진입 게이트 ("/") — 인증 상태에 따라 로그인 또는 역할별 홈으로 분기.
 * 루트 레이아웃의 가드와 함께 동작하며, 직접 진입/딥링크 시 폴백 역할.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A5276" />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <Redirect href={homeRouteForRole(session?.user.role)} />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
