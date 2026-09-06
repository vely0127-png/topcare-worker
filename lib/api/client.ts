/**
 * API 클라이언트 — 웹 백엔드(Next.js, `topcare-web/app/api/*`) 호출용 fetch 래퍼.
 *
 * - 모든 응답은 `{ ok: boolean, data?, error? }` 봉투(envelope) 규약을 따른다.
 * - Authorization: Bearer <JWT> 를 자동 주입 (웹 getSession 이 Bearer 지원).
 * - 401 수신 시 1회 refresh 후 재시도 (refresher 가 등록된 경우).
 *
 * 순환 의존을 피하기 위해 토큰/리프레셔는 외부(인증 스토어)에서 주입한다.
 */
import { API_BASE_URL } from '../config';

/** 웹 API 공통 응답 봉투. */
export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// ── 토큰 주입 (인증 스토어가 등록) ──────────────────────────
type TokenProvider = () => string | null;
type TokenRefresher = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider = () => null;
let tokenRefresher: TokenRefresher | null = null;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn;
}
export function setTokenRefresher(fn: TokenRefresher | null): void {
  tokenRefresher = fn;
}
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

// ── 요청 ────────────────────────────────────────────────────
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON 직렬화할 본문. (FormData 등은 rawBody 사용) */
  body?: unknown;
  /** 직렬화하지 않고 그대로 보낼 본문. */
  rawBody?: BodyInit;
  /** 인증 헤더 주입 여부 (기본 true). */
  auth?: boolean;
  /** 401 자동 refresh 재시도 여부 (기본 true). */
  retryOnUnauthorized?: boolean;
  /**
   * 요청 타임아웃(ms, 기본 15000) — 약전파에서 fetch가 걸려 있으면 오프라인 큐가
   * 발동하지 않는 문제(2026-09-06 PD 검토 후속 ②)의 수정. 타임아웃 시 ApiError가 아니라
   * name='TimeoutError'인 일반 Error를 던진다 — offline-queue의 shouldQueue()가
   * ApiError가 아닌 오류는 네트워크 오류로 보고 큐에 넣도록 이미 돼 있다.
   */
  timeoutMs?: number;
}

/** 기본 요청 타임아웃 — 15초 안에 응답이 없으면 TimeoutError로 실패시켜 큐 재시도로 넘긴다. */
const DEFAULT_TIMEOUT_MS = 15_000;

function buildHeaders(options: RequestOptions, token: string | null): Headers {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.auth !== false && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  const text = await res.text();
  if (!text) return { ok: res.ok };
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    // JSON 이 아닌 응답 — 상태 기반으로 봉투 합성.
    return {
      ok: res.ok,
      error: res.ok ? undefined : { code: 'NON_JSON', message: text.slice(0, 200) },
    };
  }
}

/**
 * 핵심 fetch. 성공 시 `data` 를 반환, 실패 시 ApiError throw.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const { body, rawBody, auth, retryOnUnauthorized, timeoutMs, headers: _h, ...rest } = options;
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const doRequest = async (token: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, {
        ...rest,
        headers: buildHeaders(options, token),
        signal: controller.signal,
        body:
          rawBody !== undefined
            ? rawBody
            : body !== undefined
              ? JSON.stringify(body)
              : undefined,
      });
    } catch (e: any) {
      // AbortController가 끊은 경우만 타임아웃으로 변환한다 — ApiError가 아닌 일반 Error라
      // offline-queue.shouldQueue()가 네트워크 오류로 판정해 큐에 넣는다.
      if (e?.name === 'AbortError') {
        const timeoutError = new Error(`응답 시간 초과(${Math.round(timeout / 1000)}초) — 전파를 확인하세요`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  let token = auth === false ? null : tokenProvider();
  let res = await doRequest(token);

  // 401 → refresh 후 1회 재시도
  if (
    res.status === 401 &&
    auth !== false &&
    retryOnUnauthorized !== false &&
    tokenRefresher
  ) {
    const newToken = await tokenRefresher();
    if (newToken) {
      token = newToken;
      res = await doRequest(token);
    }
  }

  const envelope = await parseEnvelope<T>(res);

  if (res.status === 401 && auth !== false) {
    onUnauthorized?.();
  }

  if (!res.ok || envelope.ok === false) {
    const code = envelope.error?.code || `HTTP_${res.status}`;
    const message = envelope.error?.message || `요청 실패 (${res.status})`;
    throw new ApiError(message, code, res.status);
  }

  return envelope.data as T;
}

/**
 * 목록 응답 정규화 (P0-1, 2026-07-27 워커 감사)
 * 웹 paginated()는 { ok, data: [...배열], total, page } — data 자체가 배열이다.
 * 워커 훅들이 data.items로 읽어 200 OK인데도 전 목록이 공백이던 결함의 단일 수정점.
 * (일부 라우트는 success(배열), 혹시 모를 {items} 형태까지 3형 모두 흡수)
 */
export function asItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as any).items)) {
    return (data as any).items as T[];
  }
  return [];
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
