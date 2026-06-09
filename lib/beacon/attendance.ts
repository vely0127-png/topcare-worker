/**
 * 근접 이벤트 → 출퇴근 기록.
 *
 * enter(정문 비콘 근접) → clockIn, exit(이탈) → clockOut 을 기존 웹 API
 * `POST /api/staff/attendance` 로 기록한다(서버가 staffId+date upsert).
 *
 * 채터링/중복 호출 방지를 위해 하루 단위로 clockIn/clockOut 을 1회씩만 보낸다.
 * 서비스 자동기록·시간표 정합(여러 번 들고남 처리)은 S4b(백엔드) 책임 — 여기서는
 * "그날 첫 enter = 출근, 그날 마지막 exit = 퇴근" 의 최소 규칙만 둔다.
 */
import { api } from '../api/client';

export interface AttendanceResult {
  id: string;
  staffId: string;
  attendanceDate: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string | null;
}

export type AttendanceType = 'clockIn' | 'clockOut';

/** 단건 출퇴근 전송. */
export async function postAttendance(
  staffId: string,
  type: AttendanceType,
): Promise<AttendanceResult> {
  return api.post<AttendanceResult>('/api/staff/attendance', { staffId, type });
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 하루 1회 출근/퇴근 디바운스 코디네이터.
 * enter/exit 가 여러 번 발생해도 그날 clockIn 은 첫 enter, clockOut 은 매 exit 시
 * 갱신(서버 upsert)하되 동일 분 내 중복 전송은 막는다.
 */
export class AttendanceRecorder {
  private clockedInDate: string | null = null;
  private clockOutInFlight = false;
  private clockInInFlight = false;
  private lastClockOutAt = 0;

  constructor(
    private staffId: string,
    private onResult?: (type: AttendanceType, result: AttendanceResult) => void,
    private onError?: (type: AttendanceType, err: Error) => void,
  ) {}

  setStaffId(staffId: string): void {
    if (staffId !== this.staffId) {
      this.staffId = staffId;
      this.clockedInDate = null;
    }
  }

  /** 정문 enter 처리 → 그날 첫 1회만 clockIn. */
  async handleEnter(now = new Date()): Promise<void> {
    const day = todayKey(now);
    if (this.clockedInDate === day || this.clockInInFlight) return;
    this.clockInInFlight = true;
    try {
      const res = await postAttendance(this.staffId, 'clockIn');
      this.clockedInDate = day;
      this.onResult?.('clockIn', res);
    } catch (e) {
      this.onError?.('clockIn', e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.clockInInFlight = false;
    }
  }

  /** 정문 exit 처리 → clockOut. 30초 내 중복 전송 방지. */
  async handleExit(now = new Date()): Promise<void> {
    if (this.clockOutInFlight) return;
    if (now.getTime() - this.lastClockOutAt < 30_000) return;
    this.clockOutInFlight = true;
    try {
      const res = await postAttendance(this.staffId, 'clockOut');
      this.lastClockOutAt = now.getTime();
      this.onResult?.('clockOut', res);
    } catch (e) {
      this.onError?.('clockOut', e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.clockOutInFlight = false;
    }
  }

  reset(): void {
    this.clockedInDate = null;
    this.lastClockOutAt = 0;
  }
}
