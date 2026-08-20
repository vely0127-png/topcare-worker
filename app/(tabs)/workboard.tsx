/**
 * 공동 작업판 — 워커앱 v2.0 첫 화면 (2026-08-20 UIUX 철학 정본·공동작업판 상세설계 §1)
 *
 * 왜 이 화면이 있나
 *   대표 확인(2026-08-20): 방 배정·담당 선정은 병원식 형식일 뿐, 실제 업무는 2인 이상
 *   공동 수행이 다수다. 개인 담당 목록이 아니라 **근무 중 모두가 같은 판**을 보고,
 *   자기가 한 어르신을 체크한다 — 벽의 화이트보드를 디지털로 옮긴 것.
 *
 * 답하는 질문
 *   "지금 이 시간에 누구에게 무엇을 해야 하지?" / "누가 이미 했지?" / "몇 분 남았지?"
 *
 * 원칙 (UIUX 철학 정본)
 *   ③ 무비콘 디폴트 — 시간표가 센서다: 오늘 요일의 계획 행이 곧 작업판.
 *   ④ 기록은 예외만 — 정상은 행 탭 1회, [남은 N건 모두 완료]는 블록당 1탭.
 *   기록 1건 원칙 — 이미 기록된 행은 기록자 이름을 보여주고 다시 기록하지 않는다.
 *
 * 소스
 *   GET  /api/care/service-schedules?isActive=true  — 계획 (dayOfWeek null=매일)
 *   GET  /api/care/service-provisions?date=오늘     — 이미 된 것 (20초 자동 갱신 = 공동 판 동기화)
 *   POST /api/care/service-provisions               — 체크(제공기록 초안, 서버가 관찰기록 자동 연계)
 *
 * 정직성
 *   - 조회 실패는 빈 판으로 위장하지 않는다(배너+재시도).
 *   - POST 응답 warning(개인계획 없음 등)은 반드시 사용자에게 보여준다.
 *   - 동시 체크 경합의 서버측 차단(409)은 미구현 — 20초 갱신으로 완화, SCREENS.md 공백 참조.
 */
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert as RNAlert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useServiceSchedules, hhmmToMin, type ServiceSchedule } from '@/lib/hooks/useServiceSchedules';
import { useServiceProvisions, useCreateServiceProvision, type ServiceProvision } from '@/lib/hooks/useServiceProvisions';
import { useSession } from '@/lib/hooks/useAuth';
import { serviceTypeLabel } from '@/lib/care/service-rules';
import { getKSTToday } from '@/lib/utils/date';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

/** 예외 선택지 — 큰 버튼 3종 + 메모는 다음 단계(음성 입력) 예정 */
const EXCEPTIONS = [
  { key: 'refused', label: '거부하심', note: '어르신이 거부하셔서 제공하지 못함' },
  { key: 'partial', label: '절반만·일부만', note: '일부만 제공함' },
  { key: 'issue', label: '이상 발견', note: '제공 중 이상 소견 — 간호 확인 필요' },
] as const;

type Row = {
  schedule: ServiceSchedule;
  done: ServiceProvision | null; // 오늘 이 계획 행의 기록 (선착 1건)
};
type Block = { start: string; rows: Row[] };

export default function WorkboardScreen() {
  const session = useSession();
  const staffId = session?.user.staffId ?? null;
  const today = getKSTToday();
  const todayDow = new Date(`${today}T12:00:00+09:00`).getDay();

  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 300 });
  const { mutate: createProvision, isPending: isSaving } = useCreateServiceProvision();

  const [exceptionFor, setExceptionFor] = useState<Row | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // ── 오늘의 작업판: 계획(오늘 요일+매일) × 기록 매칭 → 시각 블록 ──
  const blocks: Block[] = useMemo(() => {
    const schedules = (schedulesQ.data ?? []).filter(
      (s) => s.isActive && s.plannedStart && (s.dayOfWeek === null || s.dayOfWeek === todayDow),
    );
    const provisions = provisionsQ.data?.items ?? [];
    const byScheduleId = new Map<string, ServiceProvision>();
    for (const p of provisions) {
      if (p.scheduleId && !byScheduleId.has(p.scheduleId)) byScheduleId.set(p.scheduleId, p);
    }
    const byStart = new Map<string, Row[]>();
    for (const s of schedules) {
      const start = s.plannedStart as string;
      const row: Row = { schedule: s, done: byScheduleId.get(s.id) ?? null };
      byStart.set(start, [...(byStart.get(start) ?? []), row]);
    }
    return [...byStart.entries()]
      .sort((a, b) => hhmmToMin(a[0]) - hhmmToMin(b[0]))
      .map(([start, rows]) => ({
        start,
        rows: rows.sort((a, b) => (a.schedule.residentName ?? '').localeCompare(b.schedule.residentName ?? '', 'ko')),
      }));
  }, [schedulesQ.data, provisionsQ.data, todayDow]);

  // "지금" 블록 = 시작 시각이 지났고 다음 블록은 아직인 것 (없으면 첫 미래 블록)
  const nowMin = (() => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const currentIdx = useMemo(() => {
    let idx = -1;
    blocks.forEach((b, i) => { if (hhmmToMin(b.start) <= nowMin + 30) idx = i; });
    return idx >= 0 ? idx : 0;
  }, [blocks, nowMin]);

  const nowIso = () => {
    const d = new Date(Date.now() + 9 * 3600_000);
    return `${today}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:00+09:00`;
  };

  const record = (row: Row, note?: string, onDone?: () => void) => {
    if (row.done) {
      RNAlert.alert('이미 기록됨', `${row.done.staffName ?? '다른 직원'}님이 이미 기록했습니다.`);
      return;
    }
    setSavingIds((prev) => new Set(prev).add(row.schedule.id));
    createProvision(
      {
        residentId: row.schedule.residentId,
        serviceType: row.schedule.serviceType,
        serviceDate: today,
        startAt: nowIso(),
        scheduleId: row.schedule.id,
        staffId,
        source: 'manual',
        note: note ?? null,
      },
      {
        onSuccess: (created) => {
          if (created?.warning) RNAlert.alert('확인 필요', created.warning); // 서버 경고 숨기지 않기
          onDone?.();
        },
        onError: (e) => RNAlert.alert('저장 실패', e?.message ?? '네트워크를 확인하세요'),
        onSettled: () => {
          setSavingIds((prev) => { const s = new Set(prev); s.delete(row.schedule.id); return s; });
          void provisionsQ.refetch();
        },
      },
    );
  };

  const recordRemaining = (block: Block) => {
    const remaining = block.rows.filter((r) => !r.done);
    if (remaining.length === 0) return;
    RNAlert.alert(
      `${block.start} — 남은 ${remaining.length}건 모두 완료`,
      '계획대로 제공한 것으로 기록합니다. 예외가 있는 분은 먼저 [예외]로 기록하세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: `${remaining.length}건 기록`,
          onPress: () => {
            // 순차 저장 — 실패한 건은 그대로 남아 다시 시도 가능 (가짜 성공 금지)
            remaining.forEach((r) => record(r));
          },
        },
      ],
    );
  };

  const isLoading = schedulesQ.isLoading || provisionsQ.isLoading;
  const isError = schedulesQ.isError;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={!!provisionsQ.isRefetching} onRefresh={() => { void schedulesQ.refetch(); void provisionsQ.refetch(); }} />}
      >
        {isError && (
          <View style={st.errorBanner}>
            <Text style={st.errorText}>작업판을 불러오지 못했습니다 — 아래 내용은 실제가 아닐 수 있습니다.</Text>
            <TouchableOpacity style={st.retryBtn} onPress={() => { void schedulesQ.refetch(); }}>
              <Text style={st.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && (
          <View style={st.center}><ActivityIndicator size="large" color={COLOR.primary} /></View>
        )}

        {!isLoading && !isError && blocks.length === 0 && (
          <View style={st.center}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={COLOR.textFaint} />
            <Text style={st.emptyText}>오늘 계획된 서비스가 없습니다</Text>
            <Text style={st.emptyHint}>웹 관리자에서 기초평가 {'>'} 서비스 적용 또는 목욕 배정을 하면 여기에 나타납니다</Text>
          </View>
        )}

        {blocks.map((block, i) => {
          const remaining = block.rows.filter((r) => !r.done).length;
          const isCurrent = i === currentIdx;
          return (
            <View key={block.start} style={[st.block, isCurrent && st.blockCurrent]}>
              <View style={st.blockHeader}>
                <Text style={[st.blockTime, isCurrent && { color: COLOR.primary }]}>{block.start}</Text>
                {isCurrent && <Text style={st.nowChip}>지금</Text>}
                <Text style={st.blockCount}>
                  {block.rows.length - remaining}/{block.rows.length}명 완료
                </Text>
              </View>

              {block.rows.map((row) => {
                const saving = savingIds.has(row.schedule.id);
                const done = row.done;
                return (
                  <View key={row.schedule.id} style={st.rowWrap}>
                    <TouchableOpacity
                      style={[st.row, done ? st.rowDone : null]}
                      disabled={saving}
                      onPress={() => (done
                        ? RNAlert.alert('이미 기록됨', `${done.staffName ?? '다른 직원'}님이 기록했습니다${done.startAt ? ` (${done.startAt.slice(11, 16)})` : ''}.`)
                        : record(row))}
                    >
                      <MaterialCommunityIcons
                        name={done ? 'check-circle' : 'checkbox-blank-circle-outline'}
                        size={30}
                        color={done ? COLOR.success : COLOR.borderStrong}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.rowName, done && st.rowNameDone]}>
                          {row.schedule.residentName ?? '(이름 없음)'}
                        </Text>
                        <Text style={st.rowService}>
                          {serviceTypeLabel(row.schedule.serviceType)}
                          {row.schedule.expectedCount > 1 ? ` ×${row.schedule.expectedCount}회` : ''}
                          {done?.staffName ? ` · ${done.staffName}` : ''}
                        </Text>
                      </View>
                      {saving && <ActivityIndicator size="small" color={COLOR.primary} />}
                    </TouchableOpacity>
                    {!done && (
                      <TouchableOpacity style={st.exceptionBtn} onPress={() => setExceptionFor(row)}>
                        <Text style={st.exceptionBtnText}>예외</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {remaining > 0 && (
                <TouchableOpacity style={st.allDoneBtn} disabled={isSaving} onPress={() => recordRemaining(block)}>
                  <Text style={st.allDoneText}>남은 {remaining}건 모두 완료</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── 예외 기록 시트 — 큰 버튼 3종, 질문 하나 (원칙 5) ── */}
      <Modal visible={!!exceptionFor} transparent animationType="fade" onRequestClose={() => setExceptionFor(null)}>
        <View style={st.modalBg}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>
              {exceptionFor?.schedule.residentName} — {exceptionFor ? serviceTypeLabel(exceptionFor.schedule.serviceType) : ''}
            </Text>
            <Text style={st.modalSub}>무슨 일이 있었나요?</Text>
            {EXCEPTIONS.map((ex) => (
              <TouchableOpacity
                key={ex.key}
                style={st.modalOption}
                onPress={() => {
                  const row = exceptionFor;
                  setExceptionFor(null);
                  if (row) record(row, ex.note);
                }}
              >
                <Text style={st.modalOptionText}>{ex.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={st.modalCancel} onPress={() => setExceptionFor(null)}>
              <Text style={st.modalCancelText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLOR.bg },
  scroll: { padding: SPACE.lg, paddingBottom: SPACE.xxl },
  center: { alignItems: 'center', paddingVertical: SPACE.xxl * 2, gap: SPACE.md },
  emptyText: { fontSize: FONT.body, fontWeight: '600', color: COLOR.textSub },
  emptyHint: { fontSize: FONT.caption, color: COLOR.textMuted, textAlign: 'center', paddingHorizontal: SPACE.xl },

  errorBanner: { backgroundColor: COLOR.dangerBg, borderRadius: RADIUS.md, padding: SPACE.lg, marginBottom: SPACE.lg, gap: SPACE.sm },
  errorText: { fontSize: FONT.label, color: COLOR.danger, fontWeight: '600' },
  retryBtn: { backgroundColor: COLOR.danger, borderRadius: RADIUS.sm, minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },

  block: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: COLOR.border },
  blockCurrent: { borderColor: COLOR.primary, borderWidth: 2 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  blockTime: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  nowChip: { fontSize: FONT.caption, fontWeight: '700', color: '#fff', backgroundColor: COLOR.primary, paddingHorizontal: SPACE.sm, paddingVertical: 2, borderRadius: RADIUS.sm, overflow: 'hidden' },
  blockCount: { marginLeft: 'auto', fontSize: FONT.label, color: COLOR.textMuted, fontWeight: '600' },

  rowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: SPACE.sm, marginBottom: SPACE.sm },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH.min, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface },
  rowDone: { backgroundColor: COLOR.successBg, borderColor: COLOR.successBg },
  rowName: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  rowNameDone: { color: COLOR.textSub },
  rowService: { fontSize: FONT.caption, color: COLOR.textMuted, marginTop: 2 },
  exceptionBtn: { minWidth: 64, minHeight: TOUCH.min, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.caution, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surface },
  exceptionBtnText: { fontSize: FONT.label, fontWeight: '700', color: COLOR.caution },

  allDoneBtn: { marginTop: SPACE.sm, minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center' },
  allDoneText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
  modalTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  modalSub: { fontSize: FONT.label, color: COLOR.textSub },
  modalOption: { minHeight: TOUCH.large, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.bg },
  modalOptionText: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  modalCancel: { minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: FONT.body, color: COLOR.textMuted, fontWeight: '600' },
});
