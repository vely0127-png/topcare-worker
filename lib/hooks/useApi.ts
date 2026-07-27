/**
 * 제네릭 React Query 데이터 훅 기본형.
 *
 * S2 에서 각 화면이 이 훅 위에 도메인 훅(useResidents, useTodos...)을 얹는다.
 * 여기서는 GET 쿼리 / 변경(mutation) 두 가지 베이스만 제공.
 */
import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api, ApiError, asItems, type RequestOptions } from '../api/client';

/** 정규화된 목록 형태 — 화면은 항상 data.items로 읽는다. */
export interface ListResult<T> {
  items: T[];
  total: number;
}

/**
 * 목록 GET 쿼리 (P0-1, 2026-07-27 워커 감사).
 * 웹 paginated()는 data 자체가 배열이라, data.items로 읽던 훅들이 전부 빈 목록이었다.
 * 여기서 배열/{items} 양쪽을 흡수해 항상 { items } 로 정규화한다.
 */
export function useApiListQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  options?: {
    request?: RequestOptions;
    query?: Omit<UseQueryOptions<ListResult<T>, ApiError>, 'queryKey' | 'queryFn'>;
  },
) {
  return useQuery<ListResult<T>, ApiError>({
    queryKey,
    queryFn: async () => {
      const data = await api.get<unknown>(path, options?.request);
      const items = asItems<T>(data);
      return { items, total: items.length };
    },
    ...options?.query,
  });
}

/**
 * GET 요청 쿼리. queryKey 는 호출부에서 지정 (캐시 무효화 제어용).
 */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  options?: {
    request?: RequestOptions;
    query?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>;
  },
) {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => api.get<T>(path, options?.request),
    ...options?.query,
  });
}

type MutationMethod = 'post' | 'patch' | 'put' | 'delete';

/**
 * 변경 요청 mutation. variables 로 body 를 전달.
 */
export function useApiMutation<TData, TVariables = unknown>(
  method: MutationMethod,
  path: string | ((vars: TVariables) => string),
  options?: Omit<UseMutationOptions<TData, ApiError, TVariables>, 'mutationFn'>,
) {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn: (vars: TVariables) => {
      const resolvedPath = typeof path === 'function' ? path(vars) : path;
      if (method === 'delete') return api.delete<TData>(resolvedPath);
      return api[method]<TData>(resolvedPath, vars);
    },
    ...options,
  });
}
