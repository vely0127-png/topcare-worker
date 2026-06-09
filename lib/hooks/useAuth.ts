/**
 * 인증 셀렉터 훅 — 컴포넌트에서 세션/역할/상태를 간편하게 구독.
 */
import { useAuthStore } from '../auth/auth-store';
import { normalizeRole, ROLE_LABELS, type RoleKey } from '../auth/roles';

export function useSession() {
  return useAuthStore((s) => s.session);
}

export function useAuthStatus() {
  return useAuthStore((s) => s.status);
}

export function useIsAuthenticated() {
  return useAuthStore((s) => s.status === 'authenticated');
}

/** 현재 사용자의 정규화된 역할 키 + 표시명. 미인증이면 null. */
export function useRole(): { key: RoleKey; label: string } | null {
  const role = useAuthStore((s) => s.session?.user.role);
  if (!role) return null;
  const key = normalizeRole(role);
  return { key, label: ROLE_LABELS[key] };
}

/** 액션 모음 (login/logout/refresh/bootstrap). */
export function useAuthActions() {
  return useAuthStore((s) => ({
    login: s.login,
    logout: s.logout,
    refresh: s.refresh,
    bootstrap: s.bootstrap,
  }));
}
