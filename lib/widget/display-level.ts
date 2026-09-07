/**
 * 위젯 표시 수준 — 시설 설정 `operationsConfig.widgetDisplayLevel` 읽기 (W2, 2026-09-07)
 *
 * 정본: ADR-001 §4-3, 명세 A3 "시설 설정 3단: 건수만 / 호실+이니셜(기본) / 성명".
 * W3(웹 팀)이 시설 설정 화면에 저장 UI를 추가 중이다 — 필드 경로(`operationsConfig.
 * widgetDisplayLevel`)는 그쪽과 미리 맞춘 이름이므로 이 파일에서 임의로 바꾸지 말 것.
 *
 * `/api/settings/facility`는 이미 작업판(workboard.tsx)·useTodayTasks 등에서
 * `['facility']` 쿼리 키로 캐시돼 있다 — 같은 키를 써서 별도 요청이 나가지 않게 한다.
 */
import { useApiQuery } from '../hooks/useApi';
import type { DisplayLevel } from './snapshot-builder';

interface FacilitySettings {
  operationsConfig?: { widgetDisplayLevel?: string | null } | null;
}

const VALID_LEVELS: DisplayLevel[] = ['count', 'roomInitial', 'name'];

/** 알 수 없는 값·미설정이면 기본값(roomInitial, 명세 A3 기본값)으로 폴백한다 —
 *  잘못된 값 때문에 위젯이 더 많은 개인정보를 보여주는 방향으로 폴백하지 않는다. */
export function normalizeDisplayLevel(value: string | null | undefined): DisplayLevel {
  if (value && (VALID_LEVELS as string[]).includes(value)) return value as DisplayLevel;
  return 'roomInitial';
}

export function useWidgetDisplayLevel(): { displayLevel: DisplayLevel; isLoading: boolean } {
  const q = useApiQuery<FacilitySettings>(['facility'], '/api/settings/facility', {
    query: { staleTime: 5 * 60_000 },
  });
  return {
    displayLevel: normalizeDisplayLevel(q.data?.operationsConfig?.widgetDisplayLevel ?? null),
    isLoading: q.isLoading,
  };
}
