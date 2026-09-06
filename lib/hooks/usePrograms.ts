/**
 * 프로그램(여가·재활 회차) 훅 — vc9 / PoC2 피드백 #12·#13·#14
 *
 * 서버 계약(웹에 이미 배포됨 — 7ebaff8 / 1a97380)
 *   GET  /api/schedule/programs/today
 *        → { today, dayOfWeek, dayLabel, planned[], recordedToday[], missed[], todo }
 *        · planned  = 오늘 요일 회차 중 **오늘 제공기록이 없는 것** (조회만으로 회차를 만들지 않는다)
 *        · participantIds/participantNames = 그룹원 해석 결과. 이름을 못 붙인 사람은
 *          조용히 버리지 않고 unresolvedMembers 로 온다 — 화면이 그대로 알린다.
 *   POST /api/schedule/programs/provisions
 *        body { programId, provisionDate, leadStaffId?, participantIds[], participantCount?,
 *               notes?, specialNotes?, participantResults }
 *        · ⚠ 키는 **participantIds** 다(응답 필드명과 동일). participants 로 보내면 조용히 0명 저장된다.
 *        · participantResults = { [residentId]: { participation?|satisfaction?|performance?: '상'|'중'|'하', note? } }
 *          서버가 참여 체크된 사람만 남기고 나머지는 버린다. 미입력은 저장하지 않는다(가짜 평가 금지).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApi';
import { ApiError } from '../api/client';
import { postWithQueue } from '../queue/offline-queue';

export type ResultGrade = '상' | '중' | '하';

export interface PlannedProgram {
  programId: string;
  programName: string;
  category: string | null;
  /** 계획 시각 'HH:MM' */
  time: string;
  days: number[];
  groupIds: string[];
  groupNames: string[];
  participantIds: string[];
  participantNames: string[];
  /** 그룹 명단에 있으나 입소자와 연결하지 못한 이름(동명이인·퇴소자 등) */
  unresolvedMembers: string[];
  /** 오늘 이 프로그램의 제공기록 id. 있으면 이미 기록된 회차. */
  provisionId: string | null;
}

export interface MissedProgram {
  programId: string;
  programName: string;
  date: string;
  dayLabel: string;
  time: string;
}

export interface ProgramsToday {
  today: string;
  dayOfWeek: number;
  dayLabel: string;
  planned: PlannedProgram[];
  recordedToday: PlannedProgram[];
  missed: MissedProgram[];
  todo: { id: string; status: string; created: boolean } | null;
}

export function useProgramsToday() {
  return useApiQuery<ProgramsToday>(
    ['programs', 'today'],
    '/api/schedule/programs/today',
    { query: { staleTime: 60_000 } },
  );
}

export interface ParticipantResultEntry {
  participation?: ResultGrade;
  satisfaction?: ResultGrade;
  performance?: ResultGrade;
  note?: string;
}

export interface CreateProgramProvisionVars {
  programId: string;
  /** 'YYYY-MM-DD' */
  provisionDate: string;
  participantIds: string[];
  participantCount?: number;
  leadStaffId?: string | null;
  notes?: string;
  participantResults?: Record<string, ParticipantResultEntry>;
}

export interface CreateProgramProvisionResult {
  id: string;
  provisionDate: string;
  participantCount: number | null;
  participantResults: Record<string, ParticipantResultEntry>;
  /** 참여자별 급여제공기록 연계 건수 — 0이면 연계가 실패한 것(서버가 정직하게 알려준다) */
  serviceProvisionsCreated: number;
}

export function useCreateProgramProvision() {
  const qc = useQueryClient();
  return useMutation<CreateProgramProvisionResult, ApiError | Error, CreateProgramProvisionVars>({
    // 오프라인 큐 대상(2026-09-06 vc11 베타 차단) — 직접 전송이 네트워크·5xx로 실패하면
    // 큐에 넣고 QueuedOfflineError를 던진다(programs/record.tsx의 catch에서 구분 처리).
    mutationFn: (vars) => postWithQueue<CreateProgramProvisionResult>({
      kind: 'program-provision',
      label: `프로그램 기록(참여 ${vars.participantIds.length}명)`,
      url: '/api/schedule/programs/provisions',
      body: vars as unknown as Record<string, unknown>,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['programs'] });
      // 참여자별 급여제공기록이 함께 생기므로 작업판·기록 목록도 다시 읽는다
      void qc.invalidateQueries({ queryKey: ['service-provisions'] });
      void qc.invalidateQueries({ queryKey: ['todos'] });
    },
  });
}
