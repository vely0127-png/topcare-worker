/**
 * 앱 자체 확인 모달 — 되돌릴 수 없는 동작(퇴근 기록 등) 전에 한 번 더 묻는다.
 *
 * 왜 새로 만드나
 *   `@/lib/ui/alert` 는 네이티브에서는 OS Alert, **웹에서는 `window.confirm`** 으로 대체된다
 *   (lib/ui/alert.ts 상단 주석 — "임시방편"이라 명시). 대표 지시(2026-09-11 GPS 자동 출퇴근
 *   설계)는 퇴근 확인에 "앱 자체 모달, 네이티브 alert 금지"를 못박았다 — 웹 CLAUDE.md의
 *   `window.confirm()` 금지 규칙(2026-09-08 QA에서 네이티브 대화상자가 자동화를 막아 오진
 *   유발)과 같은 이유다. 그래서 이 화면만은 `Alert.alert` 대신 진짜 RN `Modal` 을 쓴다.
 *
 * 패턴은 `app/(tabs)/trail.tsx` 1단계 선택 모달과 동일(transparent + 하단 시트).
 */
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 확인 버튼을 누른 뒤 처리 중 — 스피너 표시 + 버튼 비활성화(중복 탭 방지) */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible, title, message, confirmText = '확인', cancelText = '취소', busy = false,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.bg}>
        <View style={st.card}>
          <Text style={st.title}>{title}</Text>
          {message ? <Text style={st.message}>{message}</Text> : null}
          <View style={st.row}>
            <TouchableOpacity style={st.cancelBtn} onPress={onCancel} disabled={busy}>
              <Text style={st.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.confirmBtn} onPress={onConfirm} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={COLOR.onPrimary} />
              ) : (
                <Text style={st.confirmText}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg,
    padding: SPACE.xl, gap: SPACE.md,
  },
  title: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  message: { fontSize: FONT.body, color: COLOR.textSub, lineHeight: 24 },
  row: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
  cancelBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
  confirmBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.onPrimary },
});

export default ConfirmModal;
