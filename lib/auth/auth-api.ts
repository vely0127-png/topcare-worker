/**
 * 인증 관련 백엔드 호출 — 웹 `/api/auth/*` 라우트 래퍼.
 * (login / session / refresh-token)
 */
import { apiFetch } from '../api/client';
import type { AuthSession, LoginCredentials } from './types';

/** POST /api/auth/login → 토큰 포함 세션. */
export async function apiLogin(creds: LoginCredentials): Promise<AuthSession> {
  // 로그인은 인증 헤더 불필요, 401 재시도도 불필요.
  return apiFetch<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: creds,
    auth: false,
    retryOnUnauthorized: false,
  });
}

/** GET /api/auth/session → 현재 세션(토큰 제외). 미인증 시 null. */
export async function apiGetSession(token: string): Promise<AuthSession | null> {
  try {
    return await apiFetch<AuthSession>('/api/auth/session', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      auth: false, // 헤더를 직접 지정하므로 자동 주입 비활성
      retryOnUnauthorized: false,
    });
  } catch {
    return null;
  }
}

/** POST /api/auth/refresh-token → 새 토큰. 실패 시 null. */
export async function apiRefreshToken(token: string): Promise<string | null> {
  try {
    const data = await apiFetch<{ token: string; expiresIn: number }>(
      '/api/auth/refresh-token',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        auth: false,
        retryOnUnauthorized: false,
      },
    );
    return data.token;
  } catch {
    return null;
  }
}
