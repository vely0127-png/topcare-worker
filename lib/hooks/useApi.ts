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
import { api, ApiError, type RequestOptions } from '../api/client';

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
