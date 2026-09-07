/**
 * 홈 위젯 안내 카드 — 첫 로그인 후 1회 (W2, 2026-09-07)
 *
 * "홈 화면에 위젯을 추가하면 경고와 지금 할 서비스를 바로 볼 수 있어요" [추가] [나중에].
 * Android가 아니거나(ADR §4-5 iOS 후순위) 이미 한 번 보여준 적이 있으면 아무것도
 * 렌더링하지 않는다(가짜 카드로 반복 노출 금지 — 정직성 원칙과 동일한 이유).
 *
 * ⚠ 통합 지점(PD가 넣을 것) — 이 컴포넌트는 새 파일이라 아직 아무 화면도 렌더링하지
 *   않는다. `components/RoleHome.tsx`(역할별 홈 공용 컴포넌트, 7개 역할 홈이 공유)의
 *   `ScrollView` 안, `headerRow` 다음 자리에 `<WidgetPromoCard />` 한 줄을 추가하면
 *   전체 역할에 한 번에 적용된다.
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';
import { isWidgetPlatformSupported, hasSeenWidgetPromo, markWidgetPromoShown, requestPinWidget } from '@/lib/widget/pin';
import { Alert as RNAlert } from '@/lib/ui/alert';

export function WidgetPromoCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isWidgetPlatformSupported()) return;
    void hasSeenWidgetPromo().then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    void markWidgetPromoShown();
  };

  const add = async () => {
    const ok = await requestPinWidget();
    dismiss();
    if (!ok) {
      // 네이티브 미구현(스파이크 전) 또는 OS가 거절 — 조용히 감추지 않고 알려준다(정직성).
      RNAlert.alert('지금은 추가할 수 없어요', '휴대폰 홈 화면을 길게 눌러 위젯 목록에서 TopCare를 찾아 추가해 주세요.');
    }
  };

  return (
    <View style={st.card}>
      <MaterialCommunityIcons name="widgets-outline" size={28} color={COLOR.primary} />
      <View style={st.textWrap}>
        <Text style={st.title}>홈 화면에 위젯을 추가하면</Text>
        <Text style={st.body}>경고와 지금 할 서비스를 앱을 열지 않고 바로 볼 수 있어요</Text>
      </View>
      <View style={st.btnRow}>
        <TouchableOpacity style={st.laterBtn} onPress={dismiss}>
          <Text style={st.laterText}>나중에</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.addBtn} onPress={() => void add()}>
          <Text style={st.addText}>추가</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.border,
    padding: SPACE.lg, gap: SPACE.sm, marginBottom: SPACE.lg,
  },
  textWrap: { gap: 2 },
  title: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  body: { fontSize: FONT.label, color: COLOR.textSub },
  btnRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  laterBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    alignItems: 'center', justifyContent: 'center',
  },
  laterText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textMuted },
  addBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.onPrimary },
});

export default WidgetPromoCard;
