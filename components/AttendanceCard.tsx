/**
 * 근태 카드 — 역할 홈 공통 상단 (GPS 자동 출퇴근, vc9 / 2026-09-01 대표 확정 설계)
 *
 * 왜 홈에 있나
 *   출근 = **앱 실행(포그라운드) + 시설 반경 판정**의 그날 최초 성립 시각, 자동 기록.
 *   출근 버튼을 없애는 것이 이 기능의 목적이므로, 사용자가 아무것도 누르지 않아도
 *   홈에 들어오면 기록된다. 사람이 누르는 것은 [퇴근] 하나뿐이다.
 *
 * 답하는 질문
 *   "내 출근이 찍혔나?" / "위치가 확인됐나?" / "퇴근 어디서 누르지?"
 *
 * 정직성 (가짜 성공 금지)
 *   - 시각·판정은 **서버 응답만** 표시한다. 폰 시계로 "07:58" 을 그리지 않는다.
 *   - 위치 권한 거부·GPS 실패도 출근은 기록하고 **"위치 확인 없이 기록됨"** 이라고 적는다.
 *     권한 강요 화면으로 앱을 막지 않는다(W2 교훈).
 *   - 전송이 실패하면 "출근 기록됨" 이라고 쓰지 않는다 — 실패를 적고 [다시 시도]를 준다.
 *   - 직원 정보가 연결되지 않은 계정은 근태 대상이 아니다 — 빈 카드로 위장하지 않고 그 사실을 적는다.
 *
 * 설계 제약 (대표 확정 — 어기지 말 것)
 *   포그라운드 위치 1회만. 백그라운드 추적 없음. 좌표는 서버 판정 후 폐기.
 *   비콘은 세션·근태를 연장하는 근거로 쓰지 않는다(이 카드는 비콘과 무관하다).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, AppState, type AppStateStatus } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Alert } from '@/lib/ui/alert';
import { useSession, useRole } from '@/lib/hooks/useAuth';
import {
  useMyAttendanceToday, usePostAttendance, useAttendanceGeo, useRegisterAttendanceGeo,
  verdictLabel, type PostAttendanceVars,
} from '@/lib/hooks/useAttendance';
import { useConsentGate } from '@/lib/hooks/useConsentGate';
import { acquireLocationOnce } from '@/lib/attendance/location';
import { loadAutoCheckinDate, saveAutoCheckinDate } from '@/lib/attendance/day-memo';
import { QueuedOfflineError } from '@/lib/queue/offline-queue';
import { getKSTToday, toKSTTime } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

/** 좌표를 붙인 POST 본문 만들기 — 오차를 모르면 키를 아예 넣지 않는다(관대한 오판정 방지) */
async function buildBody(type: 'checkin' | 'checkout', promptIfNeeded: boolean): Promise<{
  body: PostAttendanceVars;
  locationNote: string | null;
}> {
  const result = await acquireLocationOnce(promptIfNeeded);
  if (!result.ok) {
    return { body: { type }, locationNote: result.message };
  }
  const { lat, lng, accuracyM, mockFlag } = result.fix;
  return {
    body: { type, lat, lng, mockFlag, ...(accuracyM != null ? { accuracyM } : {}) },
    locationNote: null,
  };
}

export function AttendanceCard() {
  const session = useSession();
  const role = useRole();
  const staffId = session?.user.staffId ?? null;
  const isManager = role?.key === 'owner' || role?.key === 'director';
  const today = getKSTToday();

  // 개인정보 동의 게이트가 통과된 뒤에만 움직인다 — 동의 리다이렉트가 걸리기 전
  // 한 프레임 사이에 위치를 재고 출근을 기록하면 동의 없는 개인정보 처리가 된다.
  const consentQ = useConsentGate();
  const consentCleared = consentQ.data?.required === false;

  const attendanceQ = useMyAttendanceToday(today, !!staffId);
  const { mutateAsync: postAttendance } = usePostAttendance();
  const geoQ = useAttendanceGeo(!!staffId && isManager);
  const { mutateAsync: registerGeo } = useRegisterAttendanceGeo();

  /** 위치를 못 써서 좌표 없이 기록한 경우의 안내문(서버 판정과 별개로 사용자에게 원인을 알린다) */
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'checkin' | 'checkout' | 'geo'>(null);
  const autoRunRef = useRef(false);

  const record = attendanceQ.data?.items?.[0] ?? null;
  const checkedIn = !!record?.clockIn;
  const checkedOut = !!record?.clockOut;

  // ── 자동 출근 — 포그라운드 진입 시 1회, 하루 첫 성공 후 재전송 없음 ──
  const autoCheckin = useCallback(async () => {
    if (!staffId || autoRunRef.current) return;
    if (!consentCleared) return; // 동의 미확인 — 위치도 재지 않고 기록도 하지 않는다
    // 조회가 끝나기 전엔 판단하지 않는다(이미 찍힌 출근을 모르는 채 또 보내지 않게)
    if (attendanceQ.isLoading || attendanceQ.isError) return;
    if (checkedIn) {
      autoRunRef.current = true;
      void saveAutoCheckinDate(today);
      return;
    }
    const memo = await loadAutoCheckinDate();
    if (memo === today) { autoRunRef.current = true; return; }

    autoRunRef.current = true;
    setBusy('checkin');
    setSendError(null);
    try {
      // 자동 출근은 하루 1회뿐이므로 권한이 없으면 이때 한 번 물어본다(그 뒤로는 묻지 않는다).
      const { body, locationNote: note } = await buildBody('checkin', true);
      await postAttendance(body);
      setLocationNote(note);
      await saveAutoCheckinDate(today);
      void attendanceQ.refetch();
    } catch (e: any) {
      // 오프라인 큐(2026-09-06 vc11) — 큐에 들어간 것은 유실이 아니다. 하루 1회 재전송 방지
      // 메모를 그대로 남겨(전송은 큐가 보장) 포그라운드마다 중복으로 큐잉되지 않게 한다.
      if (e instanceof QueuedOfflineError) {
        setLocationNote(`출근 요청이 ${e.message}`);
        await saveAutoCheckinDate(today);
        return;
      }
      // 실패는 성공으로 위장하지 않는다 — 메모도 남기지 않아 다음 진입에서 다시 시도한다.
      autoRunRef.current = false;
      setSendError(e?.message ?? '출근 기록 전송에 실패했습니다');
    } finally {
      setBusy(null);
    }
  }, [staffId, consentCleared, attendanceQ.isLoading, attendanceQ.isError, checkedIn, today, postAttendance]);

  useEffect(() => {
    void autoCheckin();
    // 비콘 스캔과 같은 패턴 — 포그라운드로 돌아올 때 재확인(하루 1회 가드는 위에서)
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void autoCheckin();
    });
    return () => sub.remove();
  }, [autoCheckin]);

  // ── 퇴근 — 탭 1번, 같은 위치 판정 ──
  const checkout = async () => {
    if (busy) return;
    setBusy('checkout');
    setSendError(null);
    try {
      // 퇴근은 사람이 누른 동작 — 권한을 아직 안 줬으면 여기서도 한 번 물어본다.
      const { body, locationNote: note } = await buildBody('checkout', true);
      const saved = await postAttendance(body);
      setLocationNote(note);
      void attendanceQ.refetch();
      const at = saved.clockOut ? toKSTTime(saved.clockOut) : null;
      Alert.alert(
        '퇴근 기록됨',
        `${at ? `${at} 퇴근으로 기록했습니다.` : '퇴근으로 기록했습니다.'}\n위치: ${verdictLabel(saved.checkMeta?.checkout?.verdict)}${note ? `\n\n${note}` : ''}`,
      );
    } catch (e: any) {
      // 오프라인 큐(2026-09-06 vc11) — 큐에 들어간 것은 실패가 아니다. "대기 중"으로 안내한다.
      if (e instanceof QueuedOfflineError) {
        Alert.alert('대기 중', `퇴근 요청이 ${e.message}`);
        return;
      }
      setSendError(e?.message ?? '퇴근 기록 전송에 실패했습니다');
      Alert.alert('퇴근 기록 실패', e?.message ?? '네트워크를 확인하고 다시 시도하세요');
    } finally {
      setBusy(null);
    }
  };

  // ── 시설 위치 등록 (시설장·원장) — 현장에서 1탭 ──
  const registerFacilityGeo = async () => {
    if (busy) return;
    setBusy('geo');
    try {
      const result = await acquireLocationOnce(true);
      if (!result.ok) {
        Alert.alert('위치를 확인할 수 없습니다', result.message);
        return;
      }
      const { lat, lng, accuracyM } = result.fix;
      if (accuracyM == null) {
        Alert.alert('정확도를 알 수 없습니다', '창가나 실외에서 잠시 뒤 다시 시도해 주세요.');
        return;
      }
      // 서버도 100m 초과를 거부한다(MAX_ACCURACY_M) — 왕복 전에 현장에서 바로 안내한다.
      if (accuracyM > 100) {
        Alert.alert(
          '정확도가 낮습니다',
          `현재 오차 약 ${accuracyM}m입니다. 창가나 실외에서 다시 시도해 주세요.`,
        );
        return;
      }
      const saved = await registerGeo({ lat, lng, accuracyM });
      Alert.alert(
        '시설 위치 등록 완료',
        `오차 약 ${saved.accuracyM ?? accuracyM}m · 인정 반경 ${saved.radiusM}m로 등록했습니다.\n이제 직원이 앱을 열면 출근이 자동으로 기록됩니다.`,
      );
    } catch (e: any) {
      Alert.alert('등록 실패', e?.message ?? '네트워크를 확인하고 다시 시도하세요');
    } finally {
      setBusy(null);
    }
  };

  // 근태 대상이 아닌 계정 — 빈 카드로 위장하지 않고 사실을 적는다
  if (!staffId) {
    return (
      <View style={st.card}>
        <Text style={st.noStaff}>
          근태: 이 계정에 직원 정보가 연결되지 않아 출퇴근이 기록되지 않습니다 (웹 설정 {'>'} 사용자에서 연결)
        </Text>
      </View>
    );
  }

  const checkinVerdict = record?.checkMeta?.checkin?.verdict;

  return (
    <View style={st.card}>
      <View style={st.row}>
        <MaterialCommunityIcons
          name={checkedIn ? 'account-clock' : 'account-clock-outline'}
          size={30}
          color={checkedIn ? COLOR.success : COLOR.textFaint}
        />
        <View style={st.grow}>
          {attendanceQ.isLoading ? (
            <Text style={st.status}>오늘 근태 확인 중…</Text>
          ) : attendanceQ.isError ? (
            <Text style={st.statusError}>근태를 불러오지 못했습니다</Text>
          ) : checkedIn ? (
            <>
              <Text style={st.status}>
                오늘 출근 {toKSTTime(record!.clockIn!)}
                {checkinVerdict === 'verified' ? ' ✅' : ''}
              </Text>
              <Text style={st.sub}>
                위치 {verdictLabel(checkinVerdict)}
                {checkedOut ? ` · 퇴근 ${toKSTTime(record!.clockOut!)}` : ''}
              </Text>
            </>
          ) : busy === 'checkin' ? (
            <Text style={st.status}>출근 기록 중…</Text>
          ) : (
            <Text style={st.status}>오늘 출근 기록 없음</Text>
          )}
        </View>
        {busy ? <ActivityIndicator size="small" color={COLOR.primary} /> : null}
        {checkedIn && !checkedOut ? (
          <TouchableOpacity style={st.checkoutBtn} disabled={!!busy || !consentCleared} onPress={() => void checkout()}>
            <Text style={st.checkoutText}>퇴근</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 동의 확인이 안 되면 근태가 아예 안 돈다 — 조용히 비워두지 않고 이유를 적는다 */}
      {consentQ.isError ? (
        <Text style={st.note}>
          개인정보 동의 상태를 확인하지 못해 출퇴근이 기록되지 않았습니다 — 앱을 다시 열어 주세요
        </Text>
      ) : null}

      {/* 좌표 없이 기록된 이유 — 조용히 삼키지 않는다 */}
      {locationNote ? (
        <Text style={st.note}>위치 확인 없이 기록됨 — {locationNote}</Text>
      ) : null}
      {sendError ? (
        <View style={st.errorRow}>
          <Text style={st.errorText}>{sendError}</Text>
          <TouchableOpacity
            style={st.retryBtn}
            onPress={() => { autoRunRef.current = false; setSendError(null); void autoCheckin(); }}
          >
            <Text style={st.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 시설장·원장 — 시설 위치 등록(현장 1탭). 미등록이면 판정이 전부 '위치 미확인'이 된다. */}
      {isManager ? (
        <View style={st.managerBlock}>
          <Text style={st.managerStatus}>
            {geoQ.isLoading
              ? '시설 위치 등록 상태 확인 중…'
              : geoQ.isError
                ? '시설 위치 등록 상태를 불러오지 못했습니다'
                : geoQ.data?.registered
                  ? `시설 위치 등록됨 · 인정 반경 ${geoQ.data.radiusM}m${geoQ.data.registeredByName ? ` (${geoQ.data.registeredByName})` : ''}`
                  : '시설 위치가 아직 등록되지 않았습니다 — 등록 전에는 모든 출근이 "위치 미확인"으로 남습니다'}
          </Text>
          <TouchableOpacity style={st.geoBtn} disabled={!!busy || !consentCleared} onPress={() => void registerFacilityGeo()}>
            <Text style={st.geoBtnText}>
              {geoQ.data?.registered ? '시설 위치 다시 등록' : '시설 위치 등록'}
            </Text>
          </TouchableOpacity>
          {!geoQ.data?.registered && !geoQ.isLoading ? (
            <Text style={st.geoHint}>시설 안(가능하면 창가나 마당)에서 눌러 주세요.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.border,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  grow: { flex: 1 },
  status: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  statusError: { fontSize: FONT.body, fontWeight: '700', color: COLOR.danger },
  sub: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  note: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '600' },
  noStaff: { fontSize: FONT.caption, color: COLOR.textMuted, lineHeight: 20 },

  checkoutBtn: {
    minHeight: TOUCH.min, minWidth: 92, paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkoutText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '800' },

  errorRow: { gap: SPACE.sm },
  errorText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },
  retryBtn: {
    minHeight: TOUCH.min, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLOR.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  retryText: { fontSize: FONT.body, color: COLOR.danger, fontWeight: '700' },

  managerBlock: { gap: SPACE.sm, borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACE.md },
  managerStatus: { fontSize: FONT.caption, color: COLOR.textSub, lineHeight: 20 },
  geoBtn: {
    minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surface,
  },
  geoBtnText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.primary },
  geoHint: { fontSize: FONT.caption, color: COLOR.textMuted },
});

export default AttendanceCard;
