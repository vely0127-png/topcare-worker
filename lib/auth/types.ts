/**
 * 인증 타입 — 웹 백엔드(`topcare-web/lib/auth.ts`)의 AuthSession 계약과 일치.
 * 로그인 응답(`POST /api/auth/login`)의 `data` 필드 형태를 그대로 반영한다.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** 원시 역할 문자열 — 영문 코드(owner/nurse...) 또는 한글 라벨(원장/간호사...)일 수 있음. */
  role: string;
  staffId?: string;
}

export interface AuthSession {
  orgId: string;
  orgCode: string;
  orgName: string;
  user: AuthUser;
  /** JWT. 로그인 응답에는 포함, /session 응답에는 미포함. */
  token?: string;
}

/** 인증 상태 머신. */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** 로그인 입력 — 웹 API 는 기관기호(orgCode)가 필수. */
export interface LoginCredentials {
  orgCode: string;
  email: string;
  password: string;
}
