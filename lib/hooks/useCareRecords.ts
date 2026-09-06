/**
 * 케어 기록 훅 — GET/POST /api/care/records
 * care-log (서비스 기록) 및 observation (관찰 일지) 공용.
 */
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApiListQuery } from './useApi';
import { ApiError } from '../api/client';
import { postWithQueue } from '../queue/offline-queue';

/** 큐 배지 목록에 보일 한 줄 — recordType 코드값을 사람이 읽는 말로 */
const RECORD_TYPE_LABEL: Record<string, string> = {
  defecation: '배변 케어',
  bathing: '목욕·개인위생',
  nursing: '간호 처치',
  mobility: '이동·체위',
  observation: '관찰 일지',
};

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
  return useMutation<CareRecord, ApiError | Error, CareRecordCreateVars>({
    // 오프라인 큐 대상(2026-09-06 vc11 베타 차단) — 직접 전송 실패(네트워크·5xx) 시
    // 큐에 저장하고 QueuedOfflineError를 던진다. 호출부는 onError에서 이걸
    // "저장 실패"가 아니라 "대기 중"으로 구분해서 보여줘야 한다(가짜 성공 금지 유지).
    mutationFn: (vars) => postWithQueue<CareRecord>({
      kind: 'care-record',
      label: RECORD_TYPE_LABEL[vars.recordType] ?? `케어기록(${vars.recordType})`,
      url: '/api/care/records',
      body: vars as unknown as Record<string, unknown>,
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care-records'] }),
  });
}
