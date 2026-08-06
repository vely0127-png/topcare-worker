import { Stack, useRouter } from 'expo-router';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, FONT, SPACE, TOUCH } from '@/lib/theme';

/**
 * 작업 화면 그룹 — **1페이지 1작업** (2026-08-06 요양원 PoC 피드백).
 *
 * 이전에는 하단 탭 6개(내 근무·케어기록·알림·건강기록·자동기록·근태)였다.
 * 50~70대 사용자에게 탭 6개는 "지금 내가 뭘 하는 중인지"를 흐리고,
 * 한 화면 안에서 다른 작업으로 새는 경로가 되어 현장에서 헤맸다.
 * → 탭바를 없애고 스택으로. 홈(역할별 큰 버튼 메뉴)에서 작업 하나를 고르면
 *   그 작업만 전체화면으로 보이고, 상단의 큰 [뒤로]로만 홈에 돌아온다.
 *
 * 폴더명 `(tabs)`는 그대로 둔다 — 이름만 남은 라우트 그룹이고,
 * 바꾸면 (home)/* 등 27곳의 href를 모두 고쳐야 해 이번 변경의 위험만 키운다.
 */

function BigBackButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
    >
      <MaterialCommunityIcons name="chevron-left" size={34} color={COLOR.onPrimary} />
      <Text style={styles.backText}>뒤로</Text>
    </TouchableOpacity>
  );
}

export default function TaskStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLOR.primary },
        headerTintColor: COLOR.onPrimary,
        headerTitleStyle: { fontWeight: 'bold', fontSize: FONT.title },
        headerTitleAlign: 'center',
        headerBackVisible: false,
        headerLeft: () => <BigBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: '오늘 할 일' }} />
      <Stack.Screen name="todos/index" options={{ title: '지시 업무' }} />
      <Stack.Screen name="vitals/index" options={{ title: '바이탈 현황' }} />
      <Stack.Screen name="vitals/measure" options={{ title: '바이탈 측정' }} />
      <Stack.Screen name="care-log" options={{ title: '케어 기록' }} />
      <Stack.Screen name="health-log" options={{ title: '건강 기록' }} />
      <Stack.Screen name="observation/index" options={{ title: '관찰 일지' }} />
      <Stack.Screen name="service-log" options={{ title: '자동 기록' }} />
      <Stack.Screen name="proximity" options={{ title: '비콘 근접' }} />
      <Stack.Screen name="alerts" options={{ title: '알림' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH.min,
    paddingRight: SPACE.md,
    paddingLeft: SPACE.xs,
  },
  backText: {
    color: COLOR.onPrimary,
    fontSize: FONT.body,
    fontWeight: '600',
    marginLeft: -SPACE.xs,
  },
});
