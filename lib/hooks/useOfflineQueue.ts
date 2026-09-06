/**
 * 오프라인 큐 상태를 화면에 연결하는 훅 — lib/queue/offline-queue.ts 참고.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  clearLastResolvedNotice, discardQueueItem, flushQueueNow, getLastResolvedNotice, getQueueSnapshot,
  loadQueue, retryQueueItem, subscribeOfflineQueue, type QueueItem,
} from '../queue/offline-queue';

export interface UseOfflineQueueResult {
  /** 대기 중(자동 재시도 예정) 항목 */
  pending: QueueItem[];
  /** 검증 오류로 자동 재시도가 멈춘 항목 — 사람 확인 필요 */
  failed: QueueItem[];
  total: number;
  retry: (id: string) => void;
  discard: (id: string) => void;
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
  const flushNow = useCallback(() => { void flushQueueNow(); }, []);
  const dismissResolvedNotice = useCallback(() => { clearLastResolvedNotice(); }, []);

  const pending = items.filter((i) => !i.failed);
  const failed = items.filter((i) => i.failed);

  return { pending, failed, total: items.length, retry, discard, flushNow, resolvedNotice, dismissResolvedNotice };
}
