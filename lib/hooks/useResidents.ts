/**
 * 입소자 목록 훅.
 */
import { useApiListQuery } from './useApi';

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

// P0-1(2026-07-27): 웹 paginated()는 data 자체가 배열 — useApiListQuery가 {items}로 정규화.
// (기존 Paginated 타입은 호환을 위해 유지하되 page/limit은 사용처 없음)
export interface Paginated<T> {
  items: T[];
  total: number;
}

export function useResidents(params?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 100) });
  if (params?.status) qs.set('status', params.status);
  return useApiListQuery<Resident>(
    ['residents', params ?? {}],
    `/api/residents?${qs}`,
  );
}
