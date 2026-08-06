/**
 * 긴급 알람 전체화면 인터럽트 모달.
 *
 * 트리거: severity === 'Critical' (낙상·바이탈 위기)
 * - 전체화면 빨간 오버레이
 * - 진동 패턴 반복
 * - "확인했습니다" 탭으로만 닫힘 (뒤로 버튼 차단)
 */
import { useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  Platform,
  BackHandler,
} from 'react-native';
import type { AlertItem } from '@/lib/hooks/useAlerts';

interface Props {
  alert: AlertItem | null;
  onAcknowledge: (id: string) => void;
}

const ALERT_ICONS: Record<string, string> = {
  FALL_DETECTED: '🆘',
  VITAL_CRISIS: '❤️',
  EXIT_ZONE: '🚪',
  DEFAULT: '⚠️',
};

// 진동 패턴: 500ms on, 200ms off, 3회
const VIBRATION_PATTERN = [0, 500, 200, 500, 200, 500];

export default function EmergencyAlertModal({ alert, onAcknowledge }: Props) {
  const isVisible = !!alert;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const vibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 맥박 애니메이션
  useEffect(() => {
    if (!isVisible) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isVisible, pulseAnim]);

  // 진동
  useEffect(() => {
    if (!isVisible) {
      Vibration.cancel();
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }
      return;
    }

    // 최초 즉시 진동
    Vibration.vibrate(VIBRATION_PATTERN);

    // 3초마다 반복 (안드로이드는 repeat 파라미터 사용, iOS는 수동 반복)
    if (Platform.OS === 'ios') {
      vibrationRef.current = setInterval(() => {
        Vibration.vibrate(VIBRATION_PATTERN);
      }, 3500);
    } else {
      Vibration.vibrate(VIBRATION_PATTERN, true);
    }

    return () => {
      Vibration.cancel();
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }
    };
  }, [isVisible]);

  // 안드로이드 뒤로 버튼 차단
  useEffect(() => {
    if (!isVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isVisible]);

  const handleAcknowledge = useCallback(() => {
    if (alert) onAcknowledge(alert.id);
  }, [alert, onAcknowledge]);

  if (!alert) return null;

  const icon = ALERT_ICONS[alert.type] ?? ALERT_ICONS.DEFAULT;
  const timeStr = new Date(alert.createdAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={() => {/* 뒤로 버튼 무시 */}}
    >
      <View style={styles.overlay}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>⚠ 긴급 알람</Text>
          <Text style={styles.headerTime}>{timeStr}</Text>
        </View>

        {/* 메인 카드 */}
        <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.title}>{alert.title}</Text>
          {alert.description ? (
            <Text style={styles.description}>{alert.description}</Text>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>환자</Text>
            <Text style={styles.infoValue}>{alert.residentName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>위치</Text>
            <Text style={styles.infoValue}>{alert.roomName}</Text>
          </View>
        </Animated.View>

        {/* 확인 버튼 */}
        <TouchableOpacity
          style={styles.ackButton}
          onPress={handleAcknowledge}
          activeOpacity={0.8}
          accessible
          accessibilityLabel="긴급 알람 확인했습니다"
          accessibilityRole="button"
        >
          <Text style={styles.ackButtonText}>✓ 확인했습니다</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>버튼을 눌러야 알람이 해제됩니다</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    position: 'absolute',
    top: 60,
    width: '100%',
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    color: '#FCA5A5',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTime: {
    color: '#FCA5A5',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  icon: { fontSize: 56 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  infoLabel: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '600',
    minWidth: 36,
  },
  infoValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  ackButton: {
    marginTop: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    alignItems: 'center',
    minHeight: 60,
    width: '100%',
  },
  ackButtonText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 19,
  },
  hint: {
    marginTop: 16,
    color: '#FCA5A5',
    fontSize: 15,
    textAlign: 'center',
  },
});
