/**
 * 입소자 목록 훅.
 */
import { useApiQuery } from './useApi';

export interface Resident {
  id: string;
  name: string;
  room: string;
  ward: string;
  grade: string;
  status: string;
  risk: string;
  age: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function useResidents(params?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 100) });
  if (params?.status) qs.set('status', params.status);
  return useApiQuery<Paginated<Resident>>(
    ['residents', params ?? {}],
    `/api/residents?${qs}`,
  );
}
