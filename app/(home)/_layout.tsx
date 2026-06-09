import { Stack } from 'expo-router';

/**
 * 역할별 홈 그룹 레이아웃. 각 홈은 자체 SafeAreaView 헤더를 가지므로
 * 네이티브 헤더는 숨긴다.
 */
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
