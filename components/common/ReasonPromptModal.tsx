/**
 * 소급 사유 입력 모달 — 지난 날짜(D-2 이상) 기록 전에 사유 한 줄을 받는다 (기본서비스 설계 B-9, 26차-a R8)
 *
 * 왜 새로 만드나
 *   앱에 "한 줄 입력을 받는 확인 모달"이 없다 — ConfirmModal은 입력 칸이 없고, ServiceDetailSheet의 비고 칸은
 *   서비스 상세 시트 안에 묶여 있다. 네이티브 Alert.prompt는 쓰지 않는다(안드로이드 미지원 + 웹 폴백 window.prompt 금지 규칙).
 *   그래서 ConfirmModal과 같은 패턴(투명 RN Modal + 카드, 앱 자체 모달)에 TextInput 하나를 더한 최소 컴포넌트다.
 *
 * 규칙
 *   - 사유가 비어 있으면 [기록] 버튼이 비활성(서버도 422로 막는다 — 화면은 한 번 더 막을 뿐).
 *   - 사유 길이 상한 100자(서버 backfillNotePrefix가 100자에서 자른다 — 같은 값을 maxLength로 보여 준다).
 *   - 일괄 완료는 이 모달을 1번만 띄우고 그 사유를 전부에 적용한다(호출 화면 책임).
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export const REASON_MAX_LENGTH = 100;

export interface ReasonPromptModalProps {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** 사유 확정(공백 제거된 1~100자) */
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

export function ReasonPromptModal({
  visible, title, message, placeholder = '예: 야간 근무 중 입력하지 못함', confirmText = '사유 저장 후 기록', cancelText = '취소',
  onSubmit, onCancel,
}: ReasonPromptModalProps) {
  const [value, setValue] = useState('');
  // 열릴 때마다 빈 칸에서 시작(이전 사유가 다른 날짜 기록에 따라붙지 않게)
  useEffect(() => { if (visible) setValue(''); }, [visible]);
  const trimmed = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={st.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.card}>
          <Text style={st.title}>{title}</Text>
          {message ? <Text style={st.message}>{message}</Text> : null}
          <TextInput
            style={st.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={COLOR.textFaint}
            maxLength={REASON_MAX_LENGTH}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (trimmed) onSubmit(trimmed); }}
            accessibilityLabel="소급 사유"
          />
          <Text style={st.counter}>{trimmed.length}/{REASON_MAX_LENGTH}</Text>
          <View style={st.row}>
            <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
              <Text style={st.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.confirmBtn, !trimmed && st.confirmBtnDisabled]}
              disabled={!trimmed}
              onPress={() => onSubmit(trimmed)}
            >
              <Text style={st.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  input: {
    minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderStrong,
    paddingHorizontal: SPACE.md, fontSize: FONT.body, color: COLOR.text, backgroundColor: COLOR.bg,
  },
  counter: { fontSize: FONT.caption, color: COLOR.textMuted, textAlign: 'right', marginTop: -SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
  cancelBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
  confirmBtn: {
    flex: 1.4, minHeight: TOUCH.min, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.onPrimary },
});

export default ReasonPromptModal;
