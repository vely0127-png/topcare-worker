/**
 * 투두 훅 — GET/PATCH /api/todos
 */
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiListQuery } from './useApi';
import { api, ApiError } from '../api/client';

export interface Todo {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  /** 백엔드 status: open | in_progress | done */
  status: 'open' | 'in_progress' | 'done';
  category: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  residentId: string | null;
  residentName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 백엔드 status → 화면 status */
export function toDisplayStatus(s: Todo['status']): 'pending' | 'in_progress' | 'completed' {
  if (s === 'done') return 'completed';
  if (s === 'in_progress') return 'in_progress';
  return 'pending';
}

/** 화면 status → 백엔드 status */
export function toApiStatus(s: 'pending' | 'in_progress' | 'completed' | 'skip'): Todo['status'] {
  if (s === 'completed' || s === 'skip') return 'done';
  if (s === 'in_progress') return 'in_progress';
  return 'open';
}

/** category → source 파생 */
export function deriveSource(category: string | null): 'manager_assigned' | 'ai_generated' {
  return category === 'manager_task' ? 'manager_assigned' : 'ai_generated';
}

export function useTodos(filters?: { assignedTo?: string }) {
  const qs = new URLSearchParams({ limit: '100' });
  if (filters?.assignedTo) qs.set('assignedTo', filters.assignedTo);
  return useApiListQuery<Todo>(
    ['todos', filters ?? {}],
    `/api/todos?${qs}`,
  );
}

export interface TodoPatchVars {
  id: string;
  status?: Todo['status'];
  description?: string | null;
}

export function useTodoPatch() {
  const qc = useQueryClient();
  return useMutation<Todo, ApiError, TodoPatchVars>({
    mutationFn: ({ id, ...body }) =>
      api.patch<Todo>(`/api/todos?id=${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}
