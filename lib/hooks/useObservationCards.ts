/**
 * 관찰 기록 커스텀 단어카드 훅 — GET/POST /api/care/observation-cards, POST .../suggest
 *
 * 계약(웹 `app/api/care/observation-cards/route.ts` 정본, 2026-09-14 관찰3단 §2/§6 계약 정정):
 *   GET  → { ok:true, data:{ version, builtin: ObservationButton[](내장 v2, kind/outcomes/reasons
 *           포함), cards: CustomObservationCard[](커스텀만) } }
 *   POST → { ok:true, data:{ card: CustomObservationCard } } / 중복·상한 시 { ok:false, error }
 *   POST .../suggest → { ok:true, data:{ suggestions:[...] } } / 실패 { ok:false }
 *
 * 관찰3단 §2/§6: 정본 1곳 — 카드·문장·사유는 서버 GET이 정본이다. 앱은
 * `[...builtin, ...cards]`로 합쳐 쓰고, 서버 fetch 실패(오프라인 등)면 내장 사본
 * (`lib/data/observation-buttons.ts`)으로 폴백하되 "시설 설정 미반영" 정직 표시를 낸다
 * (useServiceDetailOptions 와 동일 패턴). 구 응답(`builtin` 필드 없이 `cards`만 오는 경우)도
 * 처리 — 그때는 로컬 내장 사본을 builtin으로 쓴다(서버가 구버전 계약을 아직 쓰는 경우).
 */
import { useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';
import {
  OBSERVATION_BUTTONS,
  type ObservationDomain,
  type ObservationButton,
  type ObservationCardKind,
  type ObservationOutcomeTemplates,
} from '../data/observation-buttons';

export interface CustomObservationCard {
  id: string;
  domain: ObservationDomain;
  buttonName: string;
  autoText: string;
  icon?: string;
  createdByName?: string;
  createdAt: string;
  // 관찰3단 §2/§4: 커스텀 카드도 상태·반응(3단)으로 승격될 수 있다(웹 승격 UI). 필드 없으면 'action'.
  kind?: ObservationCardKind;
  outcomes?: ObservationOutcomeTemplates;
  reasons?: string[];
  allowFreeReason?: boolean;
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

interface ObservationCardsResponse {
  version?: string;
  /** 관찰3단 §6 계약 정정: 내장 v2 카드(신설). 구버전 서버 응답엔 없을 수 있다. */
  builtin?: ObservationButton[];
  cards: CustomObservationCard[];
}

const CARDS_QUERY_KEY = ['observation-cards'] as const;

/**
 * 관찰 카드 정본 — 내장(builtin) + 시설 커스텀(cards)을 합쳐서 준다.
 * 조회 실패 시 화면은 죽지 않는다: 내장은 로컬 사본으로, 커스텀은 빈 목록으로 폴백하고
 * `source:'fallback'` + `fallbackNotice`로 정직하게 알린다(목데이터 아님 — 정본 사본 폴백).
 */
export function useObservationCards() {
  const q = useApiQuery<ObservationCardsResponse>(
    CARDS_QUERY_KEY,
    '/api/care/observation-cards',
  );

  const fetchFailed = q.isError;
  // 관찰3단 §6: 서버가 신 계약(builtin 필드 포함)을 쓰면 그대로, 구 계약(필드 없음)이거나
  // fetch 자체가 실패했으면 로컬 내장 사본으로 채운다.
  const builtin = Array.isArray(q.data?.builtin) ? q.data!.builtin! : OBSERVATION_BUTTONS;
  const cards = fetchFailed ? [] : (q.data?.cards ?? []);
  const merged = useMemo(() => [...builtin, ...cards], [builtin, cards]);

  return {
    data: q.data,
    builtin,
    cards,
    merged,
    isLoading: q.isLoading,
    isError: fetchFailed,
    source: fetchFailed ? ('fallback' as const) : ('server' as const),
    /** 화면이 폴백 중임을 정직하게 보여줄 문구(정상일 때는 null) */
    fallbackNotice: fetchFailed ? '시설 설정 미반영(오프라인) — 내장 카드만 표시 중' : null,
  };
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
