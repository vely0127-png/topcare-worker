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
import { postWithQueue, QueuedOfflineError } from '../queue/offline-queue';
import { toKSTDate } from '../utils/date';

export interface AttendanceResult {
  id: string;
  staffId: string;
  attendanceDate: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string | null;
}

export type AttendanceType = 'clockIn' | 'clockOut';

/**
 * 단건 출퇴근 전송.
 *
 * 오프라인 큐 대상(2026-09-06 vc11 베타 차단)이지만 occurredAt은 보내지 않는다
 * (sendOccurredAt:false) — 서버 계약이 의도적으로 클라이언트 시각을 받지 않는다
 * (폰 시계 조작 방지, lib/hooks/useAttendance.ts 상단 주석 참고). 큐가 지연 전송해도
 * 서버는 여전히 "수신한 시각"을 출근/퇴근 시각으로 남긴다 — 이는 기존 실패 시
 * 수동 재시도와 같은 특성이라 새 위험이 아니다(offline-queue.ts 상단 주석 참고).
 */
export async function postAttendance(
  staffId: string,
  type: AttendanceType,
): Promise<AttendanceResult> {
  return postWithQueue<AttendanceResult>({
    kind: 'attendance',
    label: type === 'clockIn' ? '비콘 자동 출근' : '비콘 자동 퇴근',
    url: '/api/staff/attendance',
    body: { staffId, type },
    sendOccurredAt: false,
  });
}

/** 하루 1회 디바운스 키 — KST 기준(UTC 슬라이스면 09시에 날이 바뀌어 오전 출근이 두 번 전송됨) */
function todayKey(now = new Date()): string {
  return toKSTDate(now);
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
      // 오프라인 큐 — 큐에 들어간 것은 유실이 아니다. 오늘 이미 시도했으니 중복 큐잉을
      // 막기 위해 성공했을 때와 같이 하루 1회 표시를 남긴다(전송 자체는 큐가 보장).
      if (e instanceof QueuedOfflineError) {
        this.clockedInDate = day;
        return;
      }
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
      if (e instanceof QueuedOfflineError) {
        this.lastClockOutAt = now.getTime();
        return;
      }
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
