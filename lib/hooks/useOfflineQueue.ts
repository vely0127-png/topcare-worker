/**
 * 오프라인 큐 상태를 화면에 연결하는 훅 — lib/queue/offline-queue.ts 참고.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  claimLegacyQueueItem, classifyQueueItemOwner, clearLastResolvedNotice, discardQueueItem,
  flushQueueNow, getLastResolvedNotice, getQueueSnapshot, isQueueItemExpired, loadQueue,
  retryQueueItem, subscribeOfflineQueue, type QueueItem,
} from '../queue/offline-queue';

export interface UseOfflineQueueResult {
  /** 내(현재 로그인 사용자) 항목 중 대기 중(자동 재시도 예정) */
  pending: QueueItem[];
  /** 내 항목 중 검증/인증 오류로 자동 재시도가 멈춘 것 — 사람 확인 필요 */
  failed: QueueItem[];
  /** 다른 사용자 소유 항목 수 — 건수만 표시, 조작 불가(S-13) */
  otherOwnerCount: number;
  /** 마이그레이션 전 구 항목(소유자 미상) — [내 기록으로 전송]으로만 인수 가능 */
  unknownOwner: QueueItem[];
  /** 내 pending·failed·unknownOwner 중 14일(createdAt 기준) 초과 항목 수 — 경고용, 자동 삭제 아님(S-15) */
  expiredCount: number;
  total: number;
  retry: (id: string) => void;
  discard: (id: string) => void;
  /** 소유자 미상 항목을 현재 사용자가 인수(claim) — label에 "(인수)" 표기가 남는다 */
  claim: (id: string) => void;
  flushNow: () => void;
  /** 409 ALREADY_RECORDED로 조용히 제거된 항목의 안내 — 한 번 보여주고 dismiss로 지운다 */
  resolvedNotice: string | null;
  dismissResolvedNotice: () => void;
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const [items, setItems] = useState<QueueItem[]>(getQueueSnapshot());
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(getLastResolvedNotice());

  useEffect(() => {
    void loadQueue().then(setItems);
    return subscribeOfflineQueue(() => {
      setItems(getQueueSnapshot());
      setResolvedNotice(getLastResolvedNotice());
    });
  }, []);

  const retry = useCallback((id: string) => { void retryQueueItem(id); }, []);
  const discard = useCallback((id: string) => { void discardQueueItem(id); }, []);
  const claim = useCallback((id: string) => { void claimLegacyQueueItem(id); }, []);
  const flushNow = useCallback(() => { void flushQueueNow(); }, []);
  const dismissResolvedNotice = useCallback(() => { clearLastResolvedNotice(); }, []);

  const mine = items.filter((i) => classifyQueueItemOwner(i) === 'mine');
  const pending = mine.filter((i) => !i.failed);
  const failed = mine.filter((i) => i.failed);
  const otherOwnerCount = items.filter((i) => classifyQueueItemOwner(i) === 'other').length;
  const unknownOwner = items.filter((i) => classifyQueueItemOwner(i) === 'unknown');
  const expiredCount = [...pending, ...failed, ...unknownOwner].filter((i) => isQueueItemExpired(i)).length;

  return {
    pending, failed, otherOwnerCount, unknownOwner, expiredCount, total: items.length,
    retry, discard, claim, flushNow, resolvedNotice, dismissResolvedNotice,
  };
}
