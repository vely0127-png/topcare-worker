/**
 * [홈 화면에 위젯 추가] 버튼 — 설정류 화면에 넣는 용도 (W2, 2026-09-07)
 *
 * WidgetPromoCard(1회성 안내)와 달리 이건 언제든 다시 누를 수 있는 상시 버튼이다.
 * Android가 아니면(ADR §4-5) 아무것도 렌더링하지 않는다.
 *
 * ⚠ 통합 지점(PD가 넣을 것) — 이 저장소에는 아직 전용 "설정" 화면이 없다
 *   (grep 결과 app/(tabs)/settings 등 부재, 로그아웃 버튼도 `components/RoleHome.tsx`
 *   헤더에 직접 있음). 설정 화면이 생기기 전까지는 `components/RoleHome.tsx`의
 *   `headerRow`(로그아웃 버튼 옆) 또는 향후 만들 설정 화면에 `<WidgetPinButton />`을
 *   추가할 것.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';
import { isWidgetPlatformSupported, requestPinWidget } from '@/lib/widget/pin';
import { Alert as RNAlert } from '@/lib/ui/alert';

export function WidgetPinButton() {
  if (!isWidgetPlatformSupported()) return null;

  const onPress = async () => {
    const ok = await requestPinWidget();
    if (!ok) {
      RNAlert.alert('지금은 추가할 수 없어요', '휴대폰 홈 화면을 길게 눌러 위젯 목록에서 TopCare를 찾아 추가해 주세요.');
    }
  };

  return (
    <TouchableOpacity style={st.btn} onPress={() => void onPress()}>
      <MaterialCommunityIcons name="widgets-outline" size={22} color={COLOR.primary} />
      <View style={st.textWrap}>
        <Text style={st.title}>홈 화면에 위젯 추가</Text>
        <Text style={st.hint}>경고·지금 할 서비스를 홈 화면에서 바로 봅니다</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={COLOR.textFaint} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH.min,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface,
  },
  textWrap: { flex: 1 },
  title: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  hint: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
});

export default WidgetPinButton;
