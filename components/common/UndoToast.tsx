/**
 * 되돌리기 토스트 — H-8(2026-09-23) "사전 확인 Alert 제거 → 5초 되돌리기 토스트".
 *
 * 왜 새로 만드나
 *   일괄 완료가 기존에는 네이티브 확인창(RNAlert.alert)으로 먼저 물었다 — 대표 지시
 *   "누르면 바로 체크하는 방식으로" + CLAUDE.md 네이티브 대화상자 금지 규약(2026-09-08).
 *   확인은 실행 뒤로 미루고, 그 대신 실행을 5초 늦춰 취소할 수 있게 한다(이메일 "실행 취소"
 *   패턴과 동일). 비차단 — 화면 하단에 떠 있을 뿐 다른 조작을 막지 않는다.
 *
 * 카운트다운은 호출부(workboard.tsx)가 소유한다 — 이 컴포넌트는 표시만 한다(초 값을
 * 그대로 받는다). 그래야 타이머가 화면에 하나만 존재하고, 실제 커밋 시점과 화면 표시가
 * 어긋나지 않는다.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export interface UndoToastProps {
  visible: boolean;
  message: string;
  secondsLeft: number;
  onUndo: () => void;
}

export function UndoToast({ visible, message, secondsLeft, onUndo }: UndoToastProps) {
  if (!visible) return null;
  return (
    <View style={st.wrap} pointerEvents="box-none">
      <View style={st.bar}>
        <Text style={st.msg} numberOfLines={2}>{message} · {Math.max(secondsLeft, 0)}초</Text>
        <TouchableOpacity style={st.btn} onPress={onUndo}>
          <Text style={st.btnText}>되돌리기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACE.lg, alignItems: 'stretch' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: COLOR.text, borderRadius: RADIUS.md, padding: SPACE.md, paddingLeft: SPACE.lg,
  },
  msg: { flex: 1, color: '#fff', fontSize: FONT.label, fontWeight: '600' },
  btn: { minHeight: TOUCH.min, minWidth: 96, paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: FONT.label, fontWeight: '700' },
});

export default UndoToast;
