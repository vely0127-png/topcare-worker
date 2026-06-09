/**
 * 앱 전역 설정 — 환경 변수 단일 진입점.
 *
 * Expo 는 `EXPO_PUBLIC_*` 접두사 변수만 클라이언트 번들에 노출한다.
 * 빌드 타임에 인라인되므로 런타임에 process.env 로 안전하게 읽을 수 있다.
 */

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 웹 백엔드(Next.js) API 베이스 URL. */
export const API_BASE_URL = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
);

/** Supabase 직접 접근 정보 (후속 Realtime/Storage 기능용, 선택). */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** 개발 모드 여부 (Expo/Metro 가 __DEV__ 를 주입). */
export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/** SecureStore 키 네임스페이스. */
export const STORAGE_KEYS = {
  token: 'topcare.worker.token',
  session: 'topcare.worker.session',
} as const;
