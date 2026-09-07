/**
 * 홈 위젯 스냅샷 동기화 훅 (W2, 2026-09-07)
 *
 * 인증 상태·관련 쿼리 데이터가 바뀔 때 디바운스 5초로 네이티브에 스냅샷을 쓰고
 * (ADR §4-2 갱신 경로 ①), 포그라운드 복귀 시 1회 즉시 쓰며(경로 ①의 특수케이스),
 * 로그아웃 전환 시 즉시 지운다(C-10).
 *
 * ⚠ 통합 지점(PD가 넣을 것) — 이 훅은 새 파일이라 아무 화면도 아직 호출하지 않는다.
 *   `app/_layout.tsx`의 `RootLayout` 컴포넌트 본문에 `useWidgetSync();` 한 줄을
 *   추가해야 실제로 동작한다(그 파일은 이번 작업 수정 금지 대상이라 여기 남긴다).
 *   위치 제안: `initOfflineQueue()`/`initMeasure()` 호출과 같은 최상위 useEffect 블록 옆.
 *
 * 이 훅 자체는 화면에 아무것도 렌더링하지 않는다(사이드이펙트 전용).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../auth/auth-store';
import { useServiceSchedules } from '../hooks/useServiceSchedules';
import { useServiceProvisions } from '../hooks/useServiceProvisions';
import { useResidents } from '../hooks/useResidents';
import { useAlerts } from '../hooks/useAlerts';
import { useTodos, deriveSource } from '../hooks/useTodos';
import { useApiQuery } from '../hooks/useApi';
import { getQueueSnapshot, subscribeOfflineQueue } from '../queue/offline-queue';
import { getKSTToday, getKSTNowWallClockIso } from '../utils/date';
import { useWidgetDisplayLevel } from './display-level';
import { buildWidgetSnapshot, type WidgetSnapshotV1 } from './snapshot-builder';
import { writeWidgetSnapshot, clearWidgetSnapshot } from './write-snapshot';

const DEBOUNCE_MS = 5_000;

interface FacilityConfig {
  scheduleConfig?: { dailyRoutine?: { time: string; activity: string }[] } | null;
}

function nowMinutesKst(): number {
  const d = new Date(Date.now() + 9 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function useWidgetSync(): void {
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated';
  const today = getKSTToday();
  // 워크보드(정본 병합 로직의 실제 사용처)와 동일한 규약 — .getDay()(로컬/기기 시각 기준,
  // 기기가 KST라는 전제 하에 요일 판정). lib/care/routine-rows.ts 사용처들과 통일.
  const todayDow = new Date(`${today}T12:00:00+09:00`).getDay();

  // 로그인 상태가 아닐 때도 훅 순서를 지키기 위해 쿼리는 항상 호출하되, enabled로 게이팅한다.
  const schedulesQ = useServiceSchedules({ isActive: true });
  const provisionsQ = useServiceProvisions({ date: today, limit: 300 });
  const residentsQ = useResidents({ status: 'admitted', limit: 200 });
  const facilityQ = useApiQuery<FacilityConfig>(['facility'], '/api/settings/facility', {
    query: { staleTime: 5 * 60_000 },
  });
  const alertsQ = useAlerts({ limit: 50 });
  const todosQ = useTodos();
  const { displayLevel } = useWidgetDisplayLevel();

  // 큐 건수 — 배지(OfflineQueueBadge)와 같은 실시간성으로 구독한다.
  const [queuePending, setQueuePending] = useState<number>(() => getQueueSnapshot().length);
  useEffect(() => subscribeOfflineQueue(() => setQueuePending(getQueueSnapshot().length)), []);

  const directivesPending = useMemo(() => {
    const todos = todosQ.data?.items ?? [];
    return todos.filter((t) => deriveSource(t.category) === 'manager_assigned' && t.status !== 'done').length;
  }, [todosQ.data]);

  const residentsLite = useMemo(
    () => (residentsQ.data?.items ?? []).map((r) => ({ id: r.id, name: r.name, room: r.room })),
    [residentsQ.data],
  );

  const snapshot: WidgetSnapshotV1 | null = useMemo(() => {
    if (!enabled) return null;
    // 스케줄이 아직 한 번도 안 왔으면 "0건" 스냅샷을 쓰지 않는다(로딩 중=빈 값을
    // 위젯이 "완료"로 오인하지 않게). 다른 쿼리는 기다리지 않는다(첫 표시가 느려지지 않게).
    if (schedulesQ.isLoading) return null;
    return buildWidgetSnapshot({
      nowIsoKst: getKSTNowWallClockIso(),
      nowMinutesKst: nowMinutesKst(),
      todayDow,
      allSchedules: schedulesQ.data ?? [],
      routine: (facilityQ.data?.scheduleConfig?.dailyRoutine ?? []).filter((r) => r.time && r.activity),
      residents: residentsLite,
      provisions: provisionsQ.data?.items ?? [],
      alerts: alertsQ.alerts,
      directivesPending,
      queuePending,
      displayLevel,
    });
  }, [
    enabled, schedulesQ.data, schedulesQ.isLoading, provisionsQ.data, facilityQ.data,
    residentsLite, alertsQ.alerts, directivesPending, queuePending, displayLevel, todayDow,
  ]);

  // JSON 키로 "내용이 실제로 바뀌었는지"를 판정 — 참조만 바뀐 재조회(refetch)로
  // 매번 디바운스 타이머를 재시작하지 않게 한다(20초 폴링마다 재기록되는 낭비 방지).
  const snapshotKey = snapshot ? JSON.stringify(snapshot) : null;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    if (!enabled || !snapshotKey) return;
    debounceTimer.current = setTimeout(() => {
      void writeWidgetSnapshot(JSON.parse(snapshotKey) as WidgetSnapshotV1);
    }, DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [snapshotKey, enabled]);

  // 포그라운드 복귀 — 디바운스 없이 즉시 1회(ADR §4-2 경로 ①의 즉시성 보강).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && enabled && snapshotKey) {
        void writeWidgetSnapshot(JSON.parse(snapshotKey) as WidgetSnapshotV1);
      }
    });
    return () => sub.remove();
  }, [enabled, snapshotKey]);

  // 로그아웃·세션 만료 전환 — 즉시 삭제(C-10). auth-store.logout()에도 직접 호출을
  // 추가해 뒀다(훅이 마운트돼 있지 않은 경로까지 보장) — clear는 멱등이라 이중 호출 무해.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'authenticated' && status !== 'authenticated') {
      void clearWidgetSnapshot();
    }
    prevStatus.current = status;
  }, [status]);
}
