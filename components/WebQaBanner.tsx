/**
 * WebQaBanner — 웹(expo-web) QA 빌드에서만 보이는 상단 띠.
 *
 * 왜 필요한가
 *   웹 빌드는 화면·흐름 QA용이다. BLE 는 브라우저에서 동작하지 않으므로
 *   비콘에 의존하는 기능(현재 위치·자동기록·체류/행적 수집)은 **여기서 검증되지 않는다.**
 *   이 사실을 화면에 적지 않으면 "웹에서 됐으니 실기기도 되겠지"라는 잘못된 통과가 난다.
 *   (가짜 성공 금지 — 안 되는 건 안 된다고 보이게)
 *
 * 실기기(Android/iOS)에서는 아무것도 렌더링하지 않는다.
 */
import { View, Text, StyleSheet, Platform } from 'react-native';
import { COLOR, FONT, SPACE } from '@/lib/theme';

export function WebQaBanner() {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        웹 QA 모드 — 화면·흐름만 확인용입니다. 비콘(현재 위치·자동기록·행적 수집)은
        브라우저에서 동작하지 않으니 실기기로 확인하세요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#7C2D12',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  text: {
    color: '#FFEDD5',
    fontSize: FONT.caption,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
});

export default WebQaBanner;
