/**
 * 인증 스토어 (zustand) — 세션 단일 출처(single source of truth).
 *
 * 책임:
 *  - bootstrap(): 저장된 토큰 복원 → /session 으로 검증 → 상태 확정
 *  - login() / logout()
 *  - refresh(): 토큰 갱신
 *  - API 클라이언트에 토큰 provider / refresher / 401 핸들러 등록
 */
import { create } from 'zustand';
import {
  setTokenProvider,
  setTokenRefresher,
  setUnauthorizedHandler,
} from '../api/client';
import { apiGetSession, apiLogin, apiRefreshToken } from './auth-api';
import {
  clearAuthStorage,
  loadSession,
  loadToken,
  saveSession,
  saveToken,
} from './storage';
import { normalizeRole, type RoleKey } from './roles';
import type { AuthSession, AuthStatus, LoginCredentials } from './types';
// 홈 위젯(W2, 2026-09-07, ADR-001 C-10) — 로그아웃 시 위젯 스냅샷도 즉시 지운다.
import { clearWidgetSnapshot } from '../widget/write-snapshot';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  token: string | null;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (creds: LoginCredentials) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  /** 현재 세션의 정규화된 역할 키. 미인증이면 null. */
  roleKey: () => RoleKey | null;
  /** 현재 세션 사용자 id. 미인증이면 null. 오프라인 큐 소유자 판정(offline-queue.ts, S-13)에 쓰인다. */
  currentUserId: () => string | null;
  /** 현재 세션 staffId. 미인증이거나 staffId가 없으면 null. */
  currentStaffId: () => string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  token: null,
  error: null,

  bootstrap: async () => {
    set({ status: 'loading', error: null });
    const token = await loadToken();
    if (!token) {
      set({ status: 'unauthenticated', session: null, token: null });
      return;
    }
    // 토큰을 먼저 등록해야 이후 요청에 주입됨.
    set({ token });
    // 서버 검증 — 유효하면 최신 세션으로 갱신.
    const remote = await apiGetSession(token);
    if (remote) {
      const session: AuthSession = { ...remote, token };
      await saveSession(session);
      set({ status: 'authenticated', session, token });
      return;
    }
    // 서버 검증 실패 시 캐시 세션으로 1회 더 시도 (오프라인 부팅 대비).
    const cached = await loadSession();
    if (cached) {
      set({ status: 'authenticated', session: { ...cached, token }, token });
      // 백그라운드 refresh 시도.
      void get().refresh();
      return;
    }
    await clearAuthStorage();
    set({ status: 'unauthenticated', session: null, token: null });
  },

  login: async (creds) => {
    set({ error: null });
    try {
      const session = await apiLogin(creds);
      const token = session.token ?? null;
      if (token) await saveToken(token);
      await saveSession(session);
      set({ status: 'authenticated', session, token, error: null });
      return session;
    } catch (e) {
      const message = e instanceof Error ? e.message : '로그인에 실패했습니다';
      set({ error: message });
      throw e;
    }
  },

  logout: async () => {
    await clearAuthStorage();
    void clearWidgetSnapshot(); // 위젯 잔존 콘텐츠 파기(ADR §6-2·C-10) — 실패해도 로그아웃을 막지 않는다
    set({ status: 'unauthenticated', session: null, token: null, error: null });
  },

  refresh: async () => {
    const current = get().token;
    if (!current) return null;
    const newToken = await apiRefreshToken(current);
    if (!newToken) {
      // refresh 실패 → 세션 만료 처리.
      await get().logout();
      return null;
    }
    await saveToken(newToken);
    const session = get().session;
    const next = session ? { ...session, token: newToken } : null;
    set({ token: newToken, session: next });
    return newToken;
  },

  roleKey: () => {
    const role = get().session?.user.role;
    return role ? normalizeRole(role) : null;
  },

  currentUserId: () => get().session?.user.id ?? null,
  currentStaffId: () => get().session?.user.staffId ?? null,
}));

// ── API 클라이언트 연동 (모듈 로드 시 1회 등록) ──────────────
setTokenProvider(() => useAuthStore.getState().token);
setTokenRefresher(() => useAuthStore.getState().refresh());
setUnauthorizedHandler(() => {
  // 자동 refresh 후에도 401 이면 세션 종료.
  const { status } = useAuthStore.getState();
  if (status === 'authenticated') void useAuthStore.getState().logout();
});
