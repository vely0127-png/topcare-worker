import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/lib/auth/auth-store';
import { homeRouteForRole } from '@/lib/auth/roles';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [orgCode, setOrgCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(orgCode.trim() && email.trim() && password) && !submitting;

  async function handleLogin() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await login({
        orgCode: orgCode.trim(),
        email: email.trim(),
        password,
      });
      router.replace(homeRouteForRole(session.user.role));
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>TC</Text>
          </View>
          <Text style={styles.title}>TopCare</Text>
          <Text style={styles.subtitle}>종사자 앱</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="기관기호"
            autoCapitalize="characters"
            autoCorrect={false}
            value={orgCode}
            onChangeText={setOrgCode}
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="이메일"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginButton, !canSubmit && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginText}>로그인</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A5276' },
  flex: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: 'bold', color: '#1A5276' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 16, fontSize: 16, minHeight: 52,
  },
  error: { color: '#FFD2D2', fontSize: 14, marginTop: 4, textAlign: 'center' },
  loginButton: {
    backgroundColor: '#1ABC9C', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8, minHeight: 52,
    justifyContent: 'center',
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
