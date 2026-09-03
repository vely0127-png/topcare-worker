/**
 * 첫 접속 개인정보 동의 게이트 (2026-08-05) — 단일 정의.
 *
 * 왜 훅으로 뺐나 (2026-09-03 vc9)
 *   근태 카드가 홈에 붙으면서, 동의 리다이렉트가 걸리기 전 한 프레임 동안 홈이 그려지는
 *   순간에 **동의 전 사용자의 위치를 재고 출근을 기록**할 수 있게 됐다.
 *   같은 쿼리를 두 곳(루트 가드·근태 카드)에서 보려면 키·요청이 한 곳에 있어야 한다
 *   (키를 복붙하면 캐시가 갈라져 요청이 두 번 나간다).
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAuthStore } from '../auth/auth-store';

export function useConsentGate() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['consent-gate'],
    queryFn: () => apiFetch<{ required: boolean }>('/api/consent?type=worker_privacy'),
    enabled: status === 'authenticated',
    staleTime: Infinity,
  });
}
