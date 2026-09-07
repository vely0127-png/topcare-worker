/**
 * 오프라인 큐 배지 — 앱 전체 상단(WebQaBanner 아래)에 떠서 "미전송 N건"을 알린다.
 *
 * 왜 필요한가
 *   전파가 약해 기록이 큐에 들어가도 화면에 아무 표시가 없으면 사용자는 "저장됐다"고
 *   착각한다(가짜 성공과 같은 효과). 큐가 있는 동안은 항상 보이게 하고, 탭하면
 *   무엇을·언제·왜(오류) 대기 중인지 목록으로 보여준다. 전송 성공 전엔 "저장됨"이
 *   아니라 "대기 중"이라고 정직하게 적는다.
 *
 * 큐가 비어 있으면 아무것도 렌더링하지 않는다.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { describeQueueError, isQueueItemExpired, type QueueKind } from '@/lib/queue/offline-queue';
import { COLOR, FONT, RADIUS, SPACE, TOUCH } from '@/lib/theme';

const KIND_LABEL: Record<QueueKind, string> = {
  attendance: '출퇴근',
  'beacon-presence': '비콘 체류',
  'service-provision': '작업판 기록',
  'care-record': '케어/관찰 기록',
  'program-provision': '프로그램 기록',
  vitals: '바이탈',
};

export function OfflineQueueBadge() {
  const {
    pending, failed, otherOwnerCount, unknownOwner, expiredCount, total,
    retry, discard, claim, flushNow, resolvedNotice, dismissResolvedNotice,
  } = useOfflineQueue();
  const [open, setOpen] = useState(false);

  if (total === 0 && !resolvedNotice) return null;

  const mineCount = pending.length + failed.length;

  return (
    <>
      {/* 409 ALREADY_RECORDED로 조용히 제거된 항목 안내 — 탭하면 닫힘(한 번만 보여준다) */}
      {resolvedNotice && (
        <TouchableOpacity style={st.resolvedBar} onPress={dismissResolvedNotice} accessibilityRole="button">
          <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
          <Text style={st.resolvedText}>{resolvedNotice}</Text>
          <Text style={st.barLink}>닫기</Text>
        </TouchableOpacity>
      )}

      {total > 0 && (
        <TouchableOpacity style={st.bar} onPress={() => setOpen(true)} accessibilityRole="button">
          <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={COLOR.onPrimary} />
          <Text style={st.barText}>
            미전송 {mineCount}건 대기 중{failed.length > 0 ? ` · 실패함 ${failed.length}건` : ''}
            {otherOwnerCount > 0 ? ` · 다른 사용자 ${otherOwnerCount}건` : ''}
            {unknownOwner.length > 0 ? ` · 인수 대기 ${unknownOwner.length}건` : ''}
          </Text>
          <Text style={st.barLink}>목록 보기</Text>
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={st.modalBg}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>전송 대기 목록</Text>
            <Text style={st.modalSub}>
              전파가 약할 때 저장한 기록입니다. 신호가 돌아오면 자동으로 전송됩니다 — 아직 전송되지
              않았으니 목록에서 사라지기 전까지는 "저장됨"이 아니라 "대기 중"입니다.
            </Text>

            {/* S-13 — 다른 사용자 소유 항목은 건수만, 조작 불가 */}
            {otherOwnerCount > 0 && (
              <Text style={st.otherOwnerNotice}>
                다른 사용자의 미전송 {otherOwnerCount}건 — 해당 사용자가 로그인하면 전송됩니다.
              </Text>
            )}
            {/* S-15 — 14일 초과 항목은 자동 삭제하지 않고 경고만 */}
            {expiredCount > 0 && (
              <Text style={st.expiredNotice}>
                14일 넘은 대기 건 {expiredCount} — 확인 후 폐기하세요.
              </Text>
            )}

            <ScrollView style={st.list}>
              {unknownOwner.length > 0 && (
                <Text style={st.sectionLabel}>앱 업데이트 전 대기 건 — 기록한 직원이 인수 ({unknownOwner.length}건)</Text>
              )}
              {unknownOwner.map((item) => (
                <View key={item.id} style={st.itemCard}>
                  <Text style={st.itemLabel}>{item.label}</Text>
                  <Text style={st.itemMeta}>
                    {KIND_LABEL[item.kind]} · {item.occurredAt}
                    {isQueueItemExpired(item) ? ' · 만료' : ''}
                  </Text>
                  <TouchableOpacity style={st.retryBtn} onPress={() => claim(item.id)}>
                    <Text style={st.retryBtnText}>내 기록으로 전송</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {failed.length > 0 && (
                <Text style={st.sectionLabel}>실패함 — 확인 필요 ({failed.length}건)</Text>
              )}
              {failed.map((item) => (
                <View key={item.id} style={st.itemCardFailed}>
                  <Text style={st.itemLabel}>{item.label}</Text>
                  <Text style={st.itemMeta}>
                    {KIND_LABEL[item.kind]} · {item.occurredAt}
                    {isQueueItemExpired(item) ? ' · 만료' : ''}
                  </Text>
                  <Text style={st.itemError}>{describeQueueError(item)}</Text>
                  <View style={st.itemBtnRow}>
                    <TouchableOpacity style={st.retryBtn} onPress={() => retry(item.id)}>
                      <Text style={st.retryBtnText}>다시 시도</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.discardBtn} onPress={() => discard(item.id)}>
                      <Text style={st.discardBtnText}>폐기(이 기록 포기)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {pending.length > 0 && (
                <Text style={st.sectionLabel}>대기 중 ({pending.length}건)</Text>
              )}
              {pending.map((item) => (
                <View key={item.id} style={st.itemCard}>
                  <Text style={st.itemLabel}>{item.label}</Text>
                  <Text style={st.itemMeta}>
                    {KIND_LABEL[item.kind]} · {item.occurredAt}
                    {item.attempts > 0 ? ` · 재시도 ${item.attempts}회` : ''}
                    {isQueueItemExpired(item) ? ' · 만료' : ''}
                  </Text>
                  {!item.persisted && (
                    <Text style={st.itemWarn}>
                      임시 저장 — 앱을 끄기 전에 신호가 있는 곳에서 전송을 확인하세요
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={st.flushBtn} onPress={flushNow}>
              <Text style={st.flushBtnText}>지금 전송</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.closeBtn} onPress={() => setOpen(false)}>
              <Text style={st.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLOR.caution, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
    minHeight: TOUCH.min,
  },
  barText: { flex: 1, color: '#fff', fontSize: FONT.label, fontWeight: '700' },
  barLink: { color: '#fff', fontSize: FONT.caption, fontWeight: '700', textDecorationLine: 'underline' },

  resolvedBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLOR.success, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
    minHeight: TOUCH.min,
  },
  resolvedText: { flex: 1, color: '#fff', fontSize: FONT.label, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md, maxHeight: '80%' },
  modalTitle: { fontSize: FONT.heading, fontWeight: '700', color: COLOR.text },
  modalSub: { fontSize: FONT.caption, color: COLOR.textMuted, lineHeight: 20 },
  otherOwnerNotice: { fontSize: FONT.caption, color: COLOR.textSub, fontWeight: '600' },
  expiredNotice: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '700' },
  list: { maxHeight: 360 },

  sectionLabel: { fontSize: FONT.label, fontWeight: '700', color: COLOR.textSub, marginTop: SPACE.sm },
  itemCard: {
    backgroundColor: COLOR.bg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border,
    padding: SPACE.md, marginTop: SPACE.sm, gap: 2,
  },
  itemCardFailed: {
    backgroundColor: COLOR.dangerBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.danger,
    padding: SPACE.md, marginTop: SPACE.sm, gap: SPACE.xs,
  },
  itemLabel: { fontSize: FONT.body, fontWeight: '700', color: COLOR.text },
  itemMeta: { fontSize: FONT.caption, color: COLOR.textMuted },
  itemError: { fontSize: FONT.caption, color: COLOR.danger, fontWeight: '600' },
  itemWarn: { fontSize: FONT.caption, color: COLOR.warning, fontWeight: '700' },

  itemBtnRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  retryBtn: {
    minHeight: TOUCH.min, paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm,
    backgroundColor: COLOR.primary, alignItems: 'center', justifyContent: 'center',
  },
  retryBtnText: { color: '#fff', fontSize: FONT.label, fontWeight: '700' },
  discardBtn: {
    minHeight: TOUCH.min, paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLOR.danger, alignItems: 'center', justifyContent: 'center',
  },
  discardBtnText: { color: COLOR.danger, fontSize: FONT.label, fontWeight: '700' },

  flushBtn: {
    minHeight: TOUCH.large, borderRadius: RADIUS.md, backgroundColor: COLOR.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  flushBtnText: { color: COLOR.onPrimary, fontSize: FONT.body, fontWeight: '700' },
  closeBtn: { minHeight: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: COLOR.textMuted, fontSize: FONT.body, fontWeight: '600' },
});

export default OfflineQueueBadge;
