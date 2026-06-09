/**
 * 공유 QueryClient — 루트 레이아웃과 테스트에서 동일 인스턴스 사용.
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount: number, error: unknown) => {
        // 인증/권한 오류는 재시도 무의미.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
