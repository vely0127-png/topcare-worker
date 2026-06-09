/**
 * 식사 섭취 훅 — GET/POST /api/meals/intake
 */
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiQuery } from './useApi';
import { api, ApiError } from '../api/client';
import type { Paginated } from './useResidents';

export interface MealIntake {
  id: string;
  residentId: string;
  residentName: string;
  intakeDate: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  /** 'full' | 'half' | 'none' */
  intakeAmount: string | null;
  waterMl: number | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface MealIntakeCreateVars {
  residentId: string;
  intakeDate: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  intakeAmount: string | null;
  waterMl?: number | null;
  note?: string | null;
}

export function useMealIntakes(params?: { date?: string; residentId?: string }) {
  const qs = new URLSearchParams({ limit: '200' });
  if (params?.date) qs.set('date', params.date);
  if (params?.residentId) qs.set('residentId', params.residentId);
  return useApiQuery<Paginated<MealIntake>>(
    ['meal-intake', params ?? {}],
    `/api/meals/intake?${qs}`,
  );
}

export function useMealIntakeCreate() {
  const qc = useQueryClient();
  return useMutation<MealIntake, ApiError, MealIntakeCreateVars>({
    mutationFn: (vars) => api.post<MealIntake>('/api/meals/intake', vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meal-intake'] }),
  });
}

/** intake cycle: null → full → half → none → full */
export function cycleIntake(current: string | null): string {
  if (!current) return 'full';
  if (current === 'full') return 'half';
  if (current === 'half') return 'none';
  return 'full';
}

export const INTAKE_LABEL: Record<string, string> = {
  full: '전량',
  half: '반량',
  none: '거부',
};

export const INTAKE_COLOR: Record<string, string> = {
  full: '#16A34A',
  half: '#D97706',
  none: '#DC2626',
};
