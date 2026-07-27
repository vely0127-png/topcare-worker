/**
 * 케어 기록 훅 — GET/POST /api/care/records
 * care-log (서비스 기록) 및 observation (관찰 일지) 공용.
 */
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiListQuery } from './useApi';
import { api, ApiError } from '../api/client';

export interface CareRecord {
  id: string;
  residentId: string;
  residentName: string;
  recordType: string;
  recordDate: string;
  recordTime: string | null;
  staffId: string | null;
  staffName: string;
  content: string | null;
  severity: string | null;
  createdAt: string;
}

export interface CareRecordCreateVars {
  residentId: string;
  recordType: string;
  recordDate: string;
  recordTime?: string;
  content?: string;
  severity?: string | null;
  staffId?: string | null;
}

export function useCareRecords(params?: {
  residentId?: string;
  recordType?: string;
  date?: string;
  limit?: number;
}) {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 50) });
  if (params?.residentId) qs.set('residentId', params.residentId);
  if (params?.recordType) qs.set('recordType', params.recordType);
  if (params?.date) qs.set('date', params.date);
  return useApiListQuery<CareRecord>(
    ['care-records', params ?? {}],
    `/api/care/records?${qs}`,
  );
}

export function useCareRecordCreate() {
  const qc = useQueryClient();
  return useMutation<CareRecord, ApiError, CareRecordCreateVars>({
    mutationFn: (vars) => api.post<CareRecord>('/api/care/records', vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care-records'] }),
  });
}
