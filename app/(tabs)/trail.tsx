/**
 * 내 행적 — "오늘 내가 다녀온 곳"
 *
 * 왜 있나 (2026-08-06 대표 제안)
 *   어르신 앞에서 폰을 꺼내 모달에 답하게 만들지 않는다. 비콘이 접촉을 조용히 쌓아두고,
 *   나중에 본인 행적을 보며 "무얼 했는지"만 고르게 한다. 시각·대상·체류시간은 이미
 *   비콘이 객관적으로 남겨놨으니 사람이 채울 건 하나뿐이다.
 *
 * 답하는 질문
 *   - 오늘 누구한테 몇 시 몇 분에 갔었나
 *   - 그때 무얼 했나  ← 사람이 고르는 유일한 항목
 *   - 아직 안 적은 게 몇 건 남았나
 *
 * 규칙 (대표 지시)
 *   - **방문 1건 = 질문 1건.** 같은 어르신을 5번 찾아갔으면 질문도 5건이다.
 *     한 건 적었다고 나머지가 사라지지 않는다. 카운트된 횟수만큼 물어본다.
 *   - 자동 작성(묻지 않고 채우기)은 **데이터가 쌓여 행동 패턴 분석이 된 뒤**의 일이다.
 *     그때까지는 전부 사람이 고른다.
 *   - 당일 근무 중에만 등록 가능(서버도 409로 막는다). 지난 날짜는 조회만.
 */
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal
} from 'react-native';
import { Alert as RNAlert } from '@/lib/ui/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTrail, SHORT_VISIT_SEC, type Visit } from '@/lib/hooks/useTrail';
import { SERVICE_TYPES, serviceTypeLabel } from '@/lib/care/service-rules';
import { toKSTTime } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';
import ServiceDetailSheet, { type ServiceDetailSheetResult } from '@/components/care/ServiceDetailSheet';

const fmtDur = (sec: number | null): string => {
  if (sec == null) return '진행 중';
  if (sec < 60) return `${sec}초`;
  return `${Math.round(sec / 60)}분`;
};

export default function TrailScreen() {
  const {
    mainVisits, shortVisits, contactCount, pendingCount, isToday,
    isLoading, isRefetching, error, refetch, register,
  } = useTrail();

  const [picking, setPicking] = useState<Visit | null>(null);
  /** 2단계(#23, 2026-09-11) — 1단계(종류)를 고르면 여기 채워지고 상세 시트가 뜬다 */
  const [pickedType, setPickedType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 짧은 접촉(1분 미만)은 목록에 넣지 않는다 — 묻지 않기로 했으므로.
  const rows = mainVisits;

  const closePicking = () => {
    setPicking(null);
    setPickedType(null);
  };

  /**
   * 2단계 등록(#23): 종류 확정 뒤 상세 시트에서 고른 selection(그룹키→선택 라벨)·비고까지
   * 함께 보낸다. 실패 시 시트는 이미 닫혀 있고(아래 onSave) picking 은 남아 있어 1단계
   * 종류 목록으로 자연히 돌아간다 — 다시 골라 재시도할 수 있다(가짜 성공 금지).
   */
  const choose = async (serviceType: string, detail?: { selection: Record<string, string[]>; note: string }) => {
    if (!picking) return;
    setSaving(true);
    try {
      await register(picking, serviceType, detail);
      closePicking();
    } catch (e) {
      // 가짜 성공 금지 — 실패는 실패로
      RNAlert.alert('등록 실패', (e as Error)?.message ?? '네트워크를 확인하세요');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLOR.primary} />
          <Text style={styles.centeredText}>행적 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.summary}>
        <View style={styles.flex}>
          <Text style={styles.summaryText}>
            아직 안 적은 방문 <Text style={styles.summaryNum}>{pendingCount}</Text>
            <Text> / {mainVisits.length}건</Text>
          </Text>
          {/* 접촉 횟수는 짧은 것까지 전부 센다(사실이므로) — 묻는 건 1분 이상만 */}
          <Text style={styles.contactLine}>
            오늘 접촉 {contactCount}회
            {shortVisits.length > 0 ? ` (짧은 접촉 ${shortVisits.length}회 포함)` : ''}
          </Text>
        </View>
        {!isToday ? <Text style={styles.closed}>지난 날짜 — 조회만</Text> : null}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>불러오지 못했습니다: {error}</Text>
          <TouchableOpacity onPress={() => void refetch()} style={styles.retryHit}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {rows.length === 0 && !error ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>오늘 기록된 방문이 없습니다</Text>
            <Text style={styles.centeredText}>
              비콘 스캔이 켜져 있어야 방문이 쌓입니다.{'\n'}
              근접 화면에서 스캔 상태를 확인하세요.
            </Text>
          </View>
        ) : null}

        {rows.map((v) => {
          const done = !!v.provision;
          return (
            <TouchableOpacity
              key={v.enterEventId}
              style={[styles.card, done && styles.cardDone]}
              disabled={done || !isToday}
              onPress={() => { setPickedType(null); setPicking(v); }}
            >
              <View style={styles.timeCol}>
                <Text style={styles.time}>{toKSTTime(v.enterAt)}</Text>
                <Text style={styles.dur}>{fmtDur(v.durationSec)}</Text>
              </View>

              <View style={styles.flex}>
                <Text style={styles.name}>{v.residentName}</Text>
                <Text style={styles.room}>{v.roomNumber ? `${v.roomNumber}호` : '호실 미상'}</Text>
                {done ? (
                  <View style={styles.doneChip}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={COLOR.success} />
                    <Text style={styles.doneText}>
                      {serviceTypeLabel(v.provision!.serviceType)} 기록됨
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.askText}>무얼 하셨나요? — 눌러서 선택</Text>
                )}
              </View>

              {!done && isToday ? (
                <MaterialCommunityIcons name="chevron-right" size={30} color={COLOR.primary} />
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* 짧은 접촉 — 횟수만 알리고 묻지 않는다(대표 결정 2026-08-06) */}
        {shortVisits.length > 0 ? (
          <View style={styles.shortNote}>
            <MaterialCommunityIcons name="information-outline" size={20} color={COLOR.textMuted} />
            <Text style={styles.shortNoteText}>
              {SHORT_VISIT_SEC}초 미만 짧은 접촉 {shortVisits.length}회는 횟수만 세고
              무얼 했는지 묻지 않습니다.
            </Text>
          </View>
        ) : null}

        <Text style={styles.footNote}>
          ※ 시각·대상·체류시간은 비콘이 남긴 기록입니다. 무얼 했는지만 고르시면
          급여제공기록 초안이 만들어집니다(확정은 관리자가 웹에서).
          {'\n'}※ 같은 어르신을 여러 번 찾아가셨으면 방문마다 따로 물어봅니다.
        </Text>
      </ScrollView>

      {/* 1단계 — 무얼 했는지(종류) 고르기. 종류를 고르면 2단계 상세 시트로 넘어간다(#23). */}
      <Modal
        visible={!!picking && !pickedType}
        transparent
        animationType="slide"
        onRequestClose={closePicking}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {picking?.residentName}님 · {picking ? toKSTTime(picking.enterAt) : ''}
            </Text>
            <Text style={styles.modalSub}>
              {picking ? fmtDur(picking.durationSec) : ''} 머무셨습니다. 무얼 하셨나요?
            </Text>

            <ScrollView style={styles.modalList}>
              {SERVICE_TYPES.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={styles.typeBtn}
                  disabled={saving}
                  onPress={() => setPickedType(s.value)}
                >
                  <Text style={styles.typeBtnText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={closePicking}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLOR.textSub} />
              ) : (
                <Text style={styles.cancelText}>나중에</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2단계 — 서비스 상세 시트(#23). 취소하면 1단계 종류 목록으로 돌아간다. */}
      <ServiceDetailSheet
        visible={!!pickedType}
        serviceType={pickedType}
        title={picking && pickedType ? `${picking.residentName}님 · ${serviceTypeLabel(pickedType)}` : ''}
        onCancel={() => setPickedType(null)}
        onSave={(result: ServiceDetailSheetResult) => {
          const t = pickedType;
          setPickedType(null);
          if (t) void choose(t, { selection: result.selection, note: result.note });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.md, gap: SPACE.md, paddingBottom: SPACE.xxl },

  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, backgroundColor: COLOR.surface,
  },
  summaryText: { fontSize: FONT.body, color: COLOR.textSub },
  summaryNum: { fontSize: FONT.metric, fontWeight: '700', color: COLOR.danger },
  closed: { fontSize: FONT.caption, color: COLOR.textMuted },

  errorBanner: {
    backgroundColor: COLOR.dangerBg, padding: SPACE.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
  },
  errorText: { flex: 1, fontSize: FONT.label, color: COLOR.danger },
  retryHit: { minHeight: TOUCH.min, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  retryText: { fontSize: FONT.body, color: COLOR.danger, fontWeight: '700' },

  centered: { alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centeredText: { fontSize: FONT.body, color: COLOR.textMuted, textAlign: 'center', lineHeight: 26 },
  emptyTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: SPACE.lg,
    borderWidth: 2, borderColor: COLOR.primary, minHeight: TOUCH.menu,
  },
  cardDone: { borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.bg },
  timeCol: { alignItems: 'center', width: 62 },
  time: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text, fontVariant: ['tabular-nums'] },
  dur: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  name: { fontSize: 22, fontWeight: '700', color: COLOR.text },
  room: { fontSize: FONT.label, color: COLOR.textMuted, marginTop: 2 },
  askText: { fontSize: FONT.label, color: COLOR.primary, fontWeight: '700', marginTop: SPACE.sm },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.sm },
  doneText: { fontSize: FONT.label, color: COLOR.success, fontWeight: '600' },

  contactLine: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  shortNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm,
    backgroundColor: COLOR.border, borderRadius: RADIUS.md, padding: SPACE.md,
  },
  shortNoteText: { flex: 1, fontSize: FONT.caption, color: COLOR.textSub, lineHeight: 20 },
  footNote: { fontSize: FONT.caption, color: COLOR.textFaint, lineHeight: 21, marginTop: SPACE.sm },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLOR.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACE.xl, gap: SPACE.md, maxHeight: '85%',
  },
  modalTitle: { fontSize: FONT.title, fontWeight: '700', color: COLOR.text },
  modalSub: { fontSize: FONT.body, color: COLOR.textSub },
  modalList: { flexGrow: 0 },
  typeBtn: {
    minHeight: TOUCH.large, justifyContent: 'center', paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md, backgroundColor: COLOR.bg,
    borderWidth: 1, borderColor: COLOR.border, marginBottom: SPACE.sm,
  },
  typeBtnText: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  cancelBtn: {
    minHeight: TOUCH.large, justifyContent: 'center', alignItems: 'center',
    borderRadius: RADIUS.md, backgroundColor: COLOR.border,
  },
  cancelText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.textSub },
});
