/**
 * 실증 측정 — 워커앱 클라이언트 수집기 (ADR-001 §7, 2026-09-07)
 *
 * 왜: 위젯(표시형) 도입 전 4주간 "체크까지 뎁스"의 베이스라인을 재야 위젯 도입 후
 *     개선 효과를 비교할 수 있다. 이 파일은 그 베이스라인의 원재료 — "사람이 무엇을
 *     언제 눌렀는지"만 수집한다.
 *
 * 서버 규격은 topcare-web `app/api/measure/events/route.ts` 가 정본이고, 이 파일은
 * 그 계약을 그대로 따른다(필드명 동일) — 웹 클라 `lib/measure/client.ts` 와 같은 분담:
 *   클라이언트가 말하는 것 : 어느 화면에서 무엇을 눌렀는지, 렌더까지 몇 ms 걸렸는지
 *   서버가 찍는 것         : 시각·env·build_id·기관·행위자·freeze 판정
 * 위조되면 곤란한 값(occurredAt·env·buildId·orgId·actor)은 절대 여기서 만들지 않는다.
 *
 * **개인정보 0**: 이 모듈이 다루는 이벤트에는 residentId·성명·측정값·메모가 절대
 * 들어가지 않는다 — screen/label은 화면명·조작 종류·단계만 담는 문자열이다
 * (배선하는 쪽에서 절대 어르신 이름 등을 넣지 말 것 — 이 파일은 그런 필드 자체가 없다).
 *
 * 현장 업무를 절대 막지 않는다: 모든 전송은 try/catch로 감싸고, await 하지 않으며,
 * 실패해도 조용히 버린다(재시도 없음 — 계측 유실은 허용, 현장 업무 방해는 불허).
 * 그래서 오프라인 큐(lib/queue/offline-queue)를 타지 않는다 — postWithQueue가 아니라
 * api.post를 직접, fire-and-forget 으로 호출한다.
 */
import { AppState, InteractionManager, type AppStateStatus } from 'react-native';
import { api } from '../api/client';
import { IS_DEV } from '../config';

type Axis = 'care' | 'admin';
type TaskCode = 'T1' | 'T2' | 'T3' | 'T4';
type Action = 'click' | 'navigate' | 'save' | 'submit' | 'error';

interface Ev {
  axis: Axis | null;
  scopeTag: string | null;
  taskCode: TaskCode | null;
  taskRunId: string | null;
  screen: string | null;
  action: Action;
  stepIndex: number | null;
  clientRenderMs?: number | null;
  recordOccurredAt?: string | null;
  recordStatus?: string | null;
  isLearningWindow: boolean;
}

const FLUSH_MS = 10_000;
const FLUSH_AT = 50;
const MAX_QUEUE = 200; // 오래 쌓여도 메모리를 먹지 않게 상한(웹 client.ts와 동일 규약)

/** 표면 표기 — 위젯 도입 후 'surface:widget'/'entry:widget' 로 구분할 자리(현재는 앱뿐). */
const SCOPE_TAG = 'surface:app';

let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** 진행 중인 과업(A1 뎁스의 단위) — home 진입 시 startTask로 열리고, 다음 home 재진입까지 유지된다. */
let task: { code: TaskCode; runId: string; axis: Axis; step: number } | null = null;

/** id 생성 — uuid 패키지 없이(비용 규율, offline-queue.ts와 동일 원칙).
 *  서버 UUID_RE(RFC4122 형식 문자열)를 통과해야 하므로 형식만 맞춘다 — 여기선
 *  암호학적 무작위성이 목적이 아니라 taskRunId 충돌 회피가 목적이다. */
function uuidv4(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* crypto 미지원 환경 — 아래 폴백 */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 서버로 실전송 — dev 빌드는 poc 데이터를 오염시키지 않게 콘솔에만 남기고 보내지 않는다
 *  (서버 MEASURE_ENV 분리와 이중 안전, 과업 지시 §4). */
function send(events: Ev[]): void {
  if (events.length === 0) return;
  if (IS_DEV) {
    console.log('[measure]', events);
    return;
  }
  // fire-and-forget — await·재시도 없음. 계측 실패가 현장 업무에 영향을 주면 안 된다.
  try {
    void api.post('/api/measure/events', { events }).catch(() => { /* 조용히 버린다 */ });
  } catch {
    /* 조용히 버린다 */
  }
}

function flush(): void {
  if (queue.length === 0) return;
  const payload = queue;
  queue = [];
  if (timer) { clearTimeout(timer); timer = null; }
  send(payload);
}

/** 이미 taskCode/taskRunId/axis/stepIndex 가 확정된 이벤트를 그대로 큐에 넣는다.
 *  (stepIndex 확정은 항상 호출 시점에 동기로 끝나 있어야 한다 — 순서 보장의 핵심.
 *   렌더 측정처럼 전송 자체를 늦추는 경우에도 stepIndex 는 미리 확정해 둔다.) */
function enqueue(ev: Ev): void {
  if (queue.length >= MAX_QUEUE) queue.shift(); // 오래된 것부터 버린다
  queue.push(ev);
  if (queue.length >= FLUSH_AT) { flush(); return; }
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

/** 공통 이벤트 조립 — 진행 중인 과업이 있으면 자동으로 묶고 stepIndex를 이어 붙인다. */
function build(partial: {
  action: Action;
  screen?: string | null;
  stepIndex?: number | null;
  recordStatus?: string | null;
}): Ev {
  return {
    axis: task?.axis ?? null,
    scopeTag: SCOPE_TAG,
    taskCode: task?.code ?? null,
    taskRunId: task?.runId ?? null,
    screen: partial.screen ?? null,
    action: partial.action,
    stepIndex: partial.stepIndex ?? (task ? ++task.step : null),
    recordStatus: partial.recordStatus ?? null,
    // 서버 후처리 대상(측정명세 §7) — 클라는 항상 false 고정, 학습기간 판정은 서버가 한다.
    isLearningWindow: false,
  };
}

/** 화면 진입 이벤트의 첫 렌더 완료까지의 ms 를 재서 붙인다(가능한 범위, 정확도 한계 있음).
 *  InteractionManager 완료 + requestAnimationFrame 2회를 "첫 렌더 완료"의 근사치로 쓴다 —
 *  RN에는 브라우저의 paint 이벤트가 없어 완벽한 측정은 아니다. stepIndex는 호출 시점에
 *  이미 확정해 두므로, 전송이 몇 프레임 늦어져도 뎁스 순서는 흐트러지지 않는다. */
function measuredNavigate(ev: Ev): void {
  const start = Date.now();
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        enqueue({ ...ev, clientRenderMs: Date.now() - start });
      });
    });
  });
}

export const measure = {
  /**
   * 과업 시작 — home 진입 시 호출한다. 반환값은 taskRunId(참고용, 보통 안 쓴다).
   * 이 호출 자체가 "홈 진입" navigate 이벤트를 만든다(stepIndex 0) — 배선부에서
   * 별도로 navigate('home')을 또 부를 필요 없다.
   */
  startTask(code: TaskCode, axis: Axis = 'admin'): string {
    const runId = uuidv4();
    task = { code, runId, axis, step: 0 };
    measuredNavigate(build({ action: 'navigate', screen: 'home', stepIndex: 0 }));
    return runId;
  },

  /** 일반 조작 1건(행 탭·상세 열기 등). label에는 화면명#조작 형태의 짧은 태그만 담는다. */
  step(label: string, action: Action = 'click'): void {
    enqueue(build({ action, screen: label }));
  },

  /** 저장 이벤트 — A3(상태)의 원재료. recordStatus는 서버 화이트리스트 값만 통과한다. */
  save(label: string, opts: { recordStatus?: string } = {}): void {
    enqueue(build({ action: 'save', screen: label, recordStatus: opts.recordStatus ?? null }));
  },

  /** 화면 이동 — 진입한 화면명을 넘긴다(RN엔 브라우저 location이 없어 웹처럼 자동 추출 불가). */
  navigate(screen: string): void {
    measuredNavigate(build({ action: 'navigate', screen }));
  },

  /** 지금 진행 중인 과업이 있는가 (필요 시 화면에서 참고) */
  currentTask(): { code: TaskCode; runId: string } | null {
    return task ? { code: task.code, runId: task.runId } : null;
  },

  /** 화면 이탈·백그라운드 전환 직전에 즉시 흘려보낸다. */
  flushNow(): void { flush(); },
};

// ── 초기화 — 앱 시작 시 1회(app/_layout.tsx에서 offline-queue와 같은 자리에서 호출) ──
let initialized = false;
export function initMeasure(): void {
  if (initialized) return;
  initialized = true;
  AppState.addEventListener('change', (next: AppStateStatus) => {
    // 앱 백그라운드 전환 시 flush — 큐에 쌓인 채 앱이 종료되면 그대로 유실되므로.
    if (next !== 'active') flush();
  });
}
