/**
 * 지난 날짜 소급 창 — GET /api/care/backfill-window (기본서비스 설계 B-9, 26차-a R8)
 *
 * 왜 이 훅이 있나
 *   작업판 날짜 선택(D-1~D-10)의 **상한·날짜별 상태·"어제 미완료 N건"**은 서버가 한 번에 내려 준다.
 *   앱은 상수(10일·사유 필요 2일째)도, 어제 미완료 건수도 **하드코딩·계산하지 않는다**(규약 ③ — 숫자는 집계 한 곳).
 *   서버 상수(lib/care/backfill-window.ts BACKFILL_MAX_DAYS)가 바뀌어도 앱 재빌드가 필요 없다.
 *
 * 응답(웹 app/api/care/backfill-window/route.ts)
 *   { maxDays, reasonRequiredFrom, today, days: [{ date, daysAgo, state }], yesterday: { date, planned, done, pending } }
 *   state = 'today' | 'free'(D-1, 사유 없이) | 'reason'(D-2~, 사유 1회) | 'locked'(D-11·월마감 — 체크 불가)
 *
 * 실패는 빈 값으로 위장하지 않는다 — 호출 화면이 isError로 안내한다(작업판은 오늘만 쓰게 두고 오류 한 줄).
 */
import { useApiQuery } from './useApi';
import { useAuthStore } from '../auth/auth-store';

export type BackfillState = 'today' | 'free' | 'reason' | 'locked';

export interface BackfillDay { date: string; daysAgo: number; state: BackfillState }

export interface BackfillWindow {
  maxDays: number;
  reasonRequiredFrom: number;
  today: string;
  days: BackfillDay[];
  yesterday: { date: string; planned: number; done: number; pending: number };
}

export function useBackfillWindow(opts: { enabled?: boolean } = {}) {
  // H-1(2026-09-23): 사용자 전환 시 캐시가 섞이지 않게 queryKey에 userId 포함(useServiceProvisions와 같은 규약)
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  // 키 앞머리 'service-provisions' — 체크·되돌리기 mutation의 invalidateQueries(['service-provisions'])가 어제 미완료 건수도 함께 갱신한다
  return useApiQuery<BackfillWindow>(['service-provisions', 'backfill-window', userId], '/api/care/backfill-window', {
    // 어제 미완료 건수는 소급 체크 후 줄어든다 — 홈·작업판이 다시 열릴 때 최신으로(1분 안은 캐시)
    // enabled: 작업판이 없는 역할 홈(자원봉사자 등)은 호출하지 않는다 — 안 쓰는 API를 부르지 않는다
    query: { staleTime: 60_000, enabled: opts.enabled ?? true },
  });
}
