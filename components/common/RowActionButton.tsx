/**
 * 행 액션 버튼 — 디자인정리 설계 G-14(2026-09-25 대표 "웹이든 앱이든 같은 라인에 있는 버튼은 동일하게").
 *
 * 한 목록의 같은 열에 놓이는 버튼([되돌리기]·[상세]·[배변·이상] 등)은 폭·높이·테두리 두께·모서리·
 * 글자 크기·굵기가 같다. 의미 차이는 variant(색)로만 낸다.
 *   - neutral: 되돌리기 등 보조 동작(회색)
 *   - accent : 상세·배변·이상 등 기록 보강(주황)
 *   - danger : 삭제 등(예비 — 아직 사용처 없음)
 * 폭은 고정(width)이다 — minWidth만 두면 라벨 길이에 따라 같은 열의 버튼 폭이 달라진다.
 * 높이는 부모 행이 alignItems:'stretch'면 행 높이를 따르고, 최소 TOUCH.min을 보장한다.
 * 첫 사용처 = 공동 작업판(app/(tabs)/workboard.tsx). 새 목록 화면의 행 버튼은 이것만 쓴다.
 */
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

export type RowActionVariant = 'neutral' | 'accent' | 'danger';

export interface RowActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: RowActionVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** 버튼 폭(px) — 같은 열 정렬의 기준값. 4~5자 한글 라벨(배변·이상, 되돌리기)이 줄바꿈 없이 들어간다. */
export const ROW_ACTION_WIDTH = 104;

const VARIANT: Record<RowActionVariant, { border: string; text: string }> = {
  neutral: { border: COLOR.borderStrong, text: COLOR.textSub },
  accent: { border: COLOR.caution, text: COLOR.caution },
  danger: { border: COLOR.danger, text: COLOR.danger },
};

export function RowActionButton({ label, onPress, variant = 'neutral', disabled, accessibilityLabel }: RowActionButtonProps) {
  const v = VARIANT[variant];
  return (
    <TouchableOpacity
      style={[st.btn, { borderColor: v.border }, disabled && st.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[st.text, { color: v.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  // variant와 무관하게 같은 규격(G-14) — 여기 값을 variant별로 바꾸지 않는다.
  btn: {
    width: ROW_ACTION_WIDTH,
    minHeight: TOUCH.min,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.surface,
  },
  text: { fontSize: FONT.label, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
