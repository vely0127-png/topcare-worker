/**
 * Alert — react-native Alert 의 드롭인 교체 (2026-08-31)
 *
 * 왜 필요한가
 *   대표 신고: "되돌리기 안됨". 원인은 되돌리기 로직이 아니라 **확인 대화상자**였다.
 *   react-native-web 의 Alert 는 구현이 아예 없다:
 *
 *     // node_modules/react-native-web/dist/exports/Alert/index.js
 *     class Alert { static alert() {} }
 *
 *   즉 웹 QA 빌드에서 Alert.alert(...) 는 **아무 일도 안 하는 빈 함수**다.
 *   되돌리기는 확인창의 [되돌리기] 버튼 onPress 에서 실행되는데 창이 안 뜨니
 *   영영 실행되지 않는다. [남은 N건 모두 완료]도 같은 이유로 죽어 있었다.
 *
 *   더 나쁜 건 조용히 사라진 것들이다 — 저장 실패 알림, '이미 기록됨' 안내,
 *   그리고 **서버 경고(C5 개인계획 없음 · H4 활성처방 없음)**. 워커앱 정직성 원칙은
 *   "POST 응답 warning 은 반드시 사용자에게 보여준다" 인데 웹에서는 전부 증발했다.
 *   웹 QA 로 본 '문제 없음'이 실제로는 '경고가 안 보인 것'일 수 있었다는 뜻이다.
 *
 * 무엇을 하나
 *   - 네이티브(실기기): react-native Alert 로 그대로 위임한다. **동작 변화 없음.**
 *   - 웹: window.confirm / window.alert 로 띄우고 눌린 버튼의 onPress 를 실행한다.
 *
 * 사용법 — 호출부는 그대로 두고 import 만 바꾼다.
 *   - import { Alert } from 'react-native';        ← 이렇게 쓰지 말 것
 *   + import { Alert } from '@/lib/ui/alert';
 *
 * ⚠ 설계 결정 필요(미구현): 웹에서 브라우저 기본 대화상자를 쓰는 건 임시방편이다.
 *   사용자층이 50~70대라 큰 버튼 인앱 모달이 맞지만, 그건 35곳 호출부와 실기기 동작까지
 *   바꾸는 변경이라 여기서 단독 진행하지 않았다. 지금 목적은 '죽은 확인창을 되살리는 것'이다.
 */
import { Alert as RNAlert, Platform } from 'react-native';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
export interface AlertButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: AlertButtonStyle;
}
export interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

function webAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  const body = [title, message].filter(Boolean).join('\n\n');
  const w = globalThis as unknown as {
    alert?: (m?: string) => void;
    confirm?: (m?: string) => boolean;
  };

  // 버튼이 없거나 하나뿐이면 단순 알림 — 확인 후 그 버튼의 동작을 실행한다.
  if (!buttons || buttons.length === 0) {
    w.alert?.(body);
    return;
  }
  if (buttons.length === 1) {
    w.alert?.(body);
    buttons[0]?.onPress?.();
    return;
  }

  // 2개 이상 — 취소(cancel)와 실행(마지막 비-cancel)으로 접는다.
  // RN 관례상 [취소, 실행] 순서이고, 3개 이상은 워커앱에 없다.
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const actionBtn = [...buttons].reverse().find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const label = actionBtn?.text ? `\n\n[확인] = ${actionBtn.text}` : '';

  const ok = w.confirm?.(body + label) ?? false;
  if (ok) actionBtn?.onPress?.();
  else {
    cancelBtn?.onPress?.();
    options?.onDismiss?.();
  }
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    if (Platform.OS === 'web') return webAlert(title, message, buttons, options);
    return RNAlert.alert(title, message, buttons as any, options as any);
  },
};

export default Alert;
