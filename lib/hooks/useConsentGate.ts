/**
 * 첫 접속 개인정보 동의 게이트 (2026-08-05) — 단일 정의.
 *
 * 왜 훅으로 뺐나 (2026-09-03 vc9)
 *   근태 카드가 홈에 붙으면서, 동의 리다이렉트가 걸리기 전 한 프레임 동안 홈이 그려지는
 *   순간에 **동의 전 사용자의 위치를 재고 출근을 기록**할 수 있게 됐다.
 *   같은 쿼리를 두 곳(루트 가드·근태 카드)에서 보려면 키·요청이 한 곳에 있어야 한다
 *   (키를 복붙하면 캐시가 갈라져 요청이 두 번 나간다).
 *
 * 핫픽스 H-1 (2026-09-23, Q19-17 P1)
 *   queryKey 가 사용자 id 없이 ['consent-gate'] 뿐이라 staleTime:Infinity 캐시가 로그인한
 *   사람과 무관하게 재사용됐다 — 같은 세션에서 첫 사용자가 동의한 뒤 다음 4명이 동의 화면
 *   없이 홈으로 들어갔다(consent_record 0건). userId 를 키에 포함해 사용자별로 캐시를 가른다.
 *   (auth-store.ts login/logout 의 queryClient.clear() 가 1차 방어, 이건 2차 방어.)
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAuthStore } from '../auth/auth-store';

export function useConsentGate() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: ['consent-gate', userId],
    queryFn: () => apiFetch<{ required: boolean }>('/api/consent?type=worker_privacy'),
    enabled: status === 'authenticated',
    staleTime: Infinity,
  });
}
