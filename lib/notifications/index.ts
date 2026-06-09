/**
 * 푸시 알림 모듈 — Expo Notifications + FCM.
 *
 * 역할:
 *  1. 권한 요청 & Expo Push Token 획득
 *  2. /api/notifications/register-device 로 서버 등록
 *  3. Android 알림 채널 설정 (기본 / 긴급)
 *  4. 포그라운드 알림 핸들러 설정
 *  5. 알림 탭 이동 링크 핸들러
 *
 * 사용: app/_layout.tsx 에서 authenticated 상태가 되면 initPushNotifications() 호출.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '../api/client';

// ── 포그라운드 핸들러 (앱 열려있을 때 배너/뱃지/소리) ───────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isEmergency =
      data?.severity === 'critical' ||
      data?.type === 'FALL_DETECTED' ||
      data?.type === 'VITAL_CRISIS';

    return {
      shouldShowAlert: true,
      shouldPlaySound: isEmergency,
      shouldSetBadge: true,
    };
  },
});

// ── Android 채널 ──────────────────────────────────────────────
async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('topcare-alerts', {
    name: 'TopCare 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1A5276',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('topcare-emergency', {
    name: 'TopCare 긴급 알람',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#DC2626',
    sound: 'default',
    bypassDnd: true,
  });
}

// ── 토큰 획득 & 서버 등록 ─────────────────────────────────────
export async function initPushNotifications(): Promise<string | null> {
  // 웹은 미지원
  if (Platform.OS === 'web') return null;

  // 권한 요청
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[Push] 알림 권한이 거부되었습니다.');
    return null;
  }

  // Android 채널 설정
  await setupAndroidChannels();

  // Expo Push Token 획득
  const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId: string | undefined = expoExtra?.eas?.projectId;

  let token: string | null = null;
  try {
    const tokenOpts = projectId ? { projectId } : {};
    const result = await Notifications.getExpoPushTokenAsync(tokenOpts);
    token = result.data;
  } catch (e) {
    console.error('[Push] getExpoPushTokenAsync 실패:', e);
    return null;
  }

  // 서버에 토큰 등록
  try {
    await api.post('/api/notifications/register-device', {
      token,
      platform: Platform.OS === 'ios' ? 'apns' : 'fcm',
      deviceName: `${Platform.OS}-worker`,
    });
    console.log('[Push] 토큰 서버 등록 완료:', token.slice(0, 30) + '…');
  } catch (e) {
    // 토큰 등록 실패가 앱 사용을 막아선 안 됨 (graceful)
    console.warn('[Push] 서버 등록 실패 (무시):', e);
  }

  return token;
}

// ── 로그아웃 시 토큰 해제 ─────────────────────────────────────
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    await api.delete('/api/notifications/register-device', {
      body: { token: result.data },
    } as Parameters<typeof api.delete>[1]);
  } catch {
    // 무시
  }
}

// ── 수신 알림 데이터 타입 ──────────────────────────────────────
export interface PushAlertData {
  alertId?: string;
  type?: string;
  severity?: string;
  residentName?: string;
  roomName?: string;
}

/** 알림 수신 시 emergency 여부 판단. */
export function isEmergencyNotification(data: Record<string, unknown>): boolean {
  return (
    (data.severity as string)?.toLowerCase() === 'critical' ||
    data.type === 'FALL_DETECTED' ||
    data.type === 'VITAL_CRISIS'
  );
}
