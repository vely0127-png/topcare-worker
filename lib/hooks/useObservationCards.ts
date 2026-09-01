/**
 * 관찰 기록 커스텀 단어카드 훅 — GET/POST /api/care/observation-cards, POST .../suggest
 *
 * 계약(웹 `app/api/care/observation-cards/*` 정본, 2026-09-01):
 *   GET  → { ok:true, data:{ cards: CustomObservationCard[] } }  (내장 버튼은 포함 안 함)
 *   POST → { ok:true, data:{ card: CustomObservationCard } } / 중복·상한 시 { ok:false, error }
 *   POST .../suggest → { ok:true, data:{ suggestions:[...] } } / 실패 { ok:false }
 *
 * GET 응답이 `data.cards` 로 감싸여 있어(배열이 아님) useApiListQuery 의
 * asItems 정규화 대상이 아니다 — useApiQuery 로 받아 그대로 꺼내 쓴다.
 */
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';
import type { ObservationDomain } from '../data/observation-buttons';

export interface CustomObservationCard {
  id: string;
  domain: ObservationDomain;
  buttonName: string;
  autoText: string;
  icon?: string;
  createdByName?: string;
  createdAt: string;
}

export interface ObservationCardCreateVars {
  buttonName: string;
  autoText: string;
  domain: ObservationDomain;
  icon?: string;
}

export interface ObservationCardSuggestion {
  buttonName: string;
  autoText: string;
  domain: ObservationDomain;
  icon: string;
}

const CARDS_QUERY_KEY = ['observation-cards'] as const;

/** 시설 커스텀 단어카드 목록. 실패 시 error 를 그대로 넘겨 화면이 "내장 버튼만 + 오류 문구"로 처리하게 한다. */
export function useObservationCards() {
  return useApiQuery<{ cards: CustomObservationCard[] }>(
    CARDS_QUERY_KEY,
    '/api/care/observation-cards',
  );
}

export function useObservationCardCreate() {
  const qc = useQueryClient();
  return useMutation<{ card: CustomObservationCard }, ApiError, ObservationCardCreateVars>({
    mutationFn: (vars) => api.post<{ card: CustomObservationCard }>('/api/care/observation-cards', vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CARDS_QUERY_KEY }),
  });
}

/** 직접 입력 문장에서 재사용 가능한 단어카드 후보를 뽑는다. 저장은 하지 않음(초안만). */
export function useObservationCardSuggest() {
  return useMutation<{ suggestions: ObservationCardSuggestion[] }, ApiError, { text: string }>({
    mutationFn: (vars) => api.post<{ suggestions: ObservationCardSuggestion[] }>('/api/care/observation-cards/suggest', vars),
  });
}
