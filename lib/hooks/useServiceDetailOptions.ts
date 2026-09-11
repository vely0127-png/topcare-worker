/**
 * 서비스 상세(2단 선택) 옵션 훅 — GET /api/care/service-detail-options (#23, 2026-09-11)
 *
 * 계약(웹 `lib/care/service-detail-options.ts` 정본):
 *   GET → { ok:true, data:{ version, source:'builtin'|'facility', specs: ServiceDetailSpec[] } }
 *
 * fetch 성공 → 서버 specs(시설이 커스터마이즈했을 수 있음)를 쓴다.
 * fetch 실패 → 내장 사본(BUILTIN_SERVICE_DETAIL_SPECS)으로 폴백한다. 이 폴백은 목데이터가
 * 아니라 "정본 사본"이다(observation-buttons.ts와 같은 관례) — 그래도 화면에는 폴백 중임을
 * 정직하게 알린다(목데이터 금지 원칙: 실패를 성공처럼 감추지 않는다).
 * staleTime 5분 캐시.
 */
import { useMemo } from 'react';
import { useApiQuery } from './useApi';
import { BUILTIN_SERVICE_DETAIL_SPECS, type ServiceDetailSpec } from '../data/service-detail-options';

interface ServiceDetailOptionsResponse {
  version: string;
  source: 'builtin' | 'facility';
  specs: ServiceDetailSpec[];
}

export function useServiceDetailOptions() {
  const q = useApiQuery<ServiceDetailOptionsResponse>(
    ['service-detail-options'],
    '/api/care/service-detail-options',
    { query: { staleTime: 5 * 60_000, retry: 1 } },
  );

  const usingBuiltin = !q.data?.specs;
  const specs = q.data?.specs ?? BUILTIN_SERVICE_DETAIL_SPECS;

  const specFor = useMemo(() => {
    const map = new Map(specs.map((s) => [s.serviceType, s] as const));
    return (serviceType: string): ServiceDetailSpec | null => map.get(serviceType) ?? null;
  }, [specs]);

  return {
    specs,
    specFor,
    isLoading: q.isLoading,
    usingBuiltin,
    /** 화면이 폴백 중임을 정직하게 보여줄 문구(정상일 때는 null) */
    fallbackNotice: usingBuiltin ? '시설 설정 미반영(오프라인) — 기본값으로 표시 중' : null,
  };
}
