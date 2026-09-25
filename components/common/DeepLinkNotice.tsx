/**
 * 위젯 딥링크 대상 없음 안내 — Q22-10(2026-09-25, QA22 P2 후속).
 *
 * 위젯에서 연 행(작업판 일정·경보)을 화면에서 찾지 못했을 때 "열리기만 하고 아무 일도 없는"
 * 상태로 두지 않고, 화면 상단 인라인 1줄로 정직하게 알린다.
 *   - 토스트가 아니다: 자동으로 사라지지 않는다(사용자가 읽고 [닫기]를 누를 때까지).
 *   - 작업판(workboard.tsx)·경보(alerts.tsx) 두 화면이 이 컴포넌트 하나를 같이 쓴다(형식 1곳).
 *   - 문구는 호출부가 넘긴다 — 딥링크 파라미터는 ID만이므로 성명·측정값은 담지 않는다(명세 C-8).
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export interface DeepLinkNoticeProps {
  message: string;
  onDismiss: () => void;
}

export function DeepLinkNotice({ message, onDismiss }: DeepLinkNoticeProps) {
  return (
    <View style={st.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={st.msg}>{message}</Text>
      <TouchableOpacity style={st.btn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="안내 닫기">
        <Text style={st.btnText}>닫기</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    backgroundColor: COLOR.warningBg,
    borderColor: COLOR.warning,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
  },
  msg: { flex: 1, fontSize: FONT.label, color: COLOR.text, fontWeight: '600' },
  btn: { minHeight: TOUCH.min, minWidth: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: FONT.label, color: COLOR.primary, fontWeight: '700' },
});
