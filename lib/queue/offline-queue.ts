/**
 * 오프라인/약전파 로컬 큐 — v2.3.0(vc11) 베타 차단 항목 (대표 확정 2026-09-06: "오프라인 큐 부재 = 베타 차단").
 *
 * 대상(현장 기록형 POST만)
 *   출퇴근(attendance) · 비콘 체류 이벤트(presence) · 작업판 체크(service-provisions) ·
 *   케어/관찰 기록(care/records) · 프로그램 기록(schedule/programs/provisions) · 바이탈(vitals).
 *   조회(GET)·로그인·설정 변경은 대상 아님(usePresence·useCareRecords 등 각 훅에서
 *   postWithQueue를 쓰는 mutation만 큐를 탄다 — 이 파일 자체가 무엇을 큐에 넣을지 정하지 않는다).
 *
 * 왜 AsyncStorage/NetInfo가 아니라 SecureStore + AppState인가
 *   이 저장소(topcare-worker)에는 AsyncStorage·NetInfo가 없다(package.json 확인, 2026-09-06).
 *   비용 규율(새 패키지 추가 최소화)에 따라 새로 추가하지 않고 기존 것만 썼다.
 *   - 저장: expo-secure-store(이미 있음, lib/auth/storage.ts·lib/attendance/day-memo.ts와 동일 규약).
 *     단, 큐 전체를 하나의 키에 넣지 않는다 — Android SecureStore는 키 하나당 크기 제한이 있어
 *     (대략 2KB) 여러 건이 쌓인 하나의 blob은 금방 한도를 넘긴다. **항목마다 개별 키**로 저장하고,
 *     id 목록만 별도 인덱스 키에 둔다. 그래도 낱개 항목이 한도를 넘기면(긴 자유 입력 등)
 *     SecureStore 쓰기 자체가 실패할 수 있다 — 그 경우도 조용히 성공한 척하지 않는다
 *     (QueuedOfflineError.persisted=false로 구분해 UI가 "임시 저장" 경고를 낼 수 있게 한다).
 *   - 네트워크 감지: NetInfo가 없어 "요청 실패 → 지수 백오프 재시도"로 대체하고,
 *     AppState(react-native 내장, 새 패키지 아님 — BeaconProvider·AttendanceCard와 동일 패턴)로
 *     포그라운드 복귀 시 즉시 한 번 더 시도한다.
 *
 * occurredAt 정본
 *   큐에 넣기 직전(=저장을 시도한 시점)의 KST 벽시계(getKSTNowWallClockIso)를 body.occurredAt
 *   으로 함께 보내, 지연 전송돼도 서버가 "발생 시각"으로 기록할 수 있게 한다.
 *   서버가 이 필드를 실제로 받아들이는지는 라우트별로 다르다 — 확인 결과는 이번 스프린트
 *   보고의 "웹 서버 측 후속 필요 목록" 참고(occurredAt을 무시하는 라우트는 즉시 위험은 아니다 —
 *   최소한 유실은 안 되고, 시각만 "전송된 시각"으로 남는다는 뜻이다).
 *
 * ⚠ 출퇴근(attendance) 예외
 *   서버 계약이 **의도적으로** 클라이언트 시각을 받지 않는다(폰 시계 조작 방지 —
 *   lib/hooks/useAttendance.ts 상단 주석 "시각 정본 = 서버 수신 시각(KST)"). 그래서 attendance
 *   큐 항목은 body에 occurredAt을 넣지 않는다(postWithQueue 호출부에서 sendOccurredAt:false).
 *   지연 전송되면 서버는 여전히 "수신한 시각"을 출근/퇴근 시각으로 남긴다 — 이건 기존에도
 *   있던 특성(사람이 [다시 시도]를 늦게 누르면 똑같이 늦은 시각이 남는다)이라 큐가 새로
 *   만드는 위험이 아니다. 다만 자동 재시도라 사람이 "언제 눌렀는지"를 의식하지 못한 채
 *   더 늦게 기록될 수 있다는 점은 설계 결정 사항으로 남겨 웹 쪽에 보고한다.
 *
 * 실패 분류
 *   - 4xx(검증 오류, 401/403 제외) → "실패함"으로 분리 보관, 자동 재시도 중단(무한 재시도 금지).
 *     사람이 목록에서 확인 후 [다시 시도] 또는 [폐기]를 고른다.
 *   - 5xx·네트워크 오류(fetch 자체 실패) → 지수 백오프(5s→10s→20s→40s→60s 상한) 자동 재시도.
 *   - 401/403 → 인증 문제라 큐 대상 자체가 아니다(postWithQueue가 그대로 throw).
 *   - 409 ALREADY_RECORDED(2026-09-06 PD 검토 후속 ①) → "실패"가 아니다. 같은 계획·같은 날짜
 *     기록이 이미 존재해 큐 항목의 목적이 이미 달성된 상태이므로, 실패함으로 분류하지 않고
 *     조용히 제거한다. 단 "조용히"는 아니고 lastResolvedNotice에 한 줄 남겨 배지가 한 번 보여준다.
 *
 * 중복 방지
 *   각 항목에 clientRequestId(이 파일이 생성하는 문자열 — RFC4122 UUID 아님, 시각+난수 조합)를
 *   포함해 보낸다. 서버가 이 값으로 멱등 처리를 하는지는 라우트별로 다르다 — 미확인 라우트는
 *   보고 목록 참고. 서버 지원이 없으면 "네트워크는 성공했는데 응답을 못 받고 재시도"하는
 *   극히 드문 경우에 한해 중복 저장 가능성이 이론상 남는다(순차 FIFO라 흔치 않음).
 */
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { api, ApiError } from '../api/client';
import { getKSTNowWallClockIso } from '../utils/date';

export type QueueKind =
  | 'attendance'
  | 'beacon-presence'
  | 'service-provision'
  | 'care-record'
  | 'program-provision'
  | 'vitals';

export interface QueueItem {
  id: string;
  clientRequestId: string;
  kind: QueueKind;
  /** 목록·배지에 보일 한 줄 (예: "김영희 어르신 배변 케어") */
  label: string;
  url: string;
  body: Record<string, unknown>;
  /** 저장을 시도한 시점의 KST 벽시계 — 표시용(서버 전송 여부는 kind별로 다름, 위 주석 참고) */
  occurredAt: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** 4xx 등 검증 오류 — 자동 재시도 중단, 사람 확인 필요 */
  failed: boolean;
  /** false면 디스크 저장이 실패해 이번 세션 메모리에만 있다(용량 초과 등) — 앱 종료 시 유실 위험 */
  persisted: boolean;
}

// ── 저장소(expo-secure-store, 항목별 개별 키) ──────────────────────
const INDEX_KEY = 'topcare.worker.offlineQueue.index';
const ITEM_KEY = (id: string) => `topcare.worker.offlineQueue.item.${id}`;

const secureStoreAvailable = typeof SecureStore.getItemAsync === 'function';
/** 웹 QA 빌드는 SecureStore가 없다 — lib/auth/storage.ts와 동일 규약(localStorage) */
const webStore =
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as any).localStorage
    ? ((globalThis as any).localStorage as Storage)
    : null;
const memoryFallback = new Map<string, string>();

async function getRaw(key: string): Promise<string | null> {
  if (webStore) {
    try { return webStore.getItem(key); } catch { return memoryFallback.get(key) ?? null; }
  }
  if (!secureStoreAvailable) return memoryFallback.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

/** true = 디스크(SecureStore/localStorage)에 실제로 반영됨. false = 이번 세션 메모리뿐. */
async function setRaw(key: string, value: string): Promise<boolean> {
  memoryFallback.set(key, value);
  if (webStore) {
    try { webStore.setItem(key, value); return true; } catch { return false; }
  }
  if (!secureStoreAvailable) return false;
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch {
    // 용량 초과 등 — 메모리에는 이미 있으니 이번 세션 안에서는 동작하지만
    // 앱이 종료되면 사라진다. 호출부가 이 사실을 정직하게 알려야 한다(가짜 성공 금지).
    return false;
  }
}

async function removeRaw(key: string): Promise<void> {
  memoryFallback.delete(key);
  if (webStore) {
    try { webStore.removeItem(key); } catch { /* noop */ }
    return;
  }
  if (!secureStoreAvailable) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* noop */
  }
}

// ── 메모리 캐시(세션 내 동기 조회용) — 로드 후에는 이 배열이 정본, 저장소는 재시작 대비 백업 ──
let cache: QueueItem[] | null = null;

async function readIndexIds(): Promise<string[]> {
  const raw = await getRaw(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndexIds(ids: string[]): Promise<void> {
  await setRaw(INDEX_KEY, JSON.stringify(ids));
}

async function ensureLoaded(): Promise<QueueItem[]> {
  if (cache) return cache;
  const ids = await readIndexIds();
  const raws = await Promise.all(ids.map((id) => getRaw(ITEM_KEY(id))));
  const items: QueueItem[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try { items.push(JSON.parse(raw) as QueueItem); } catch { /* 손상된 항목은 건너뜀 */ }
  }
  cache = items;
  return cache;
}

/** id 생성 — uuid 패키지 없이(비용 규율). clientRequestId 겸용이라 RFC4122 UUID는 아니다. */
function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── 구독(배지·목록 UI 갱신용) ───────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  listeners.forEach((fn) => { try { fn(); } catch { /* 리스너 오류가 큐 동작을 막지 않게 */ } });
}
export function subscribeOfflineQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * 409 ALREADY_RECORDED로 조용히 제거된 항목을 배지가 한 번 알리기 위한 최소 상태.
 * 큐가 조용히 사라지면 "목적 달성"인지 "유실"인지 사람이 구분할 수 없다 — 그래서
 * 제거와 동시에 이 문구를 남기고, 배지가 표시한 뒤 dismiss로 지운다(한 번만 보여준다).
 */
let lastResolvedNotice: string | null = null;
export function getLastResolvedNotice(): string | null {
  return lastResolvedNotice;
}
export function clearLastResolvedNotice(): void {
  lastResolvedNotice = null;
  notify();
}

/** 동기 스냅샷 — 로드 전이면 빈 배열(짧은 순간이라 배지 초기 렌더에는 문제 없음) */
export function getQueueSnapshot(): QueueItem[] {
  return cache ?? [];
}

/** 저장소에서 최초 1회 로드 — useOfflineQueue 훅이 마운트 시 호출한다 */
export async function loadQueue(): Promise<QueueItem[]> {
  const items = await ensureLoaded();
  notify();
  return items;
}

async function persistAll(): Promise<void> {
  if (!cache) return;
  await writeIndexIds(cache.map((i) => i.id));
}

async function addItem(item: QueueItem): Promise<void> {
  const items = await ensureLoaded();
  items.push(item);
  await setRaw(ITEM_KEY(item.id), JSON.stringify(item));
  await persistAll();
  notify();
}

async function updateItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  const items = await ensureLoaded();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  items[idx] = { ...items[idx], ...patch };
  await setRaw(ITEM_KEY(id), JSON.stringify(items[idx]));
  notify();
}

async function removeItem(id: string): Promise<void> {
  const items = await ensureLoaded();
  const next = items.filter((i) => i.id !== id);
  cache = next;
  await removeRaw(ITEM_KEY(id));
  await persistAll();
  notify();
}

/** 사람이 실패 항목을 다시 시도 — 실패 플래그를 풀고 즉시 전송을 시도한다 */
export async function retryQueueItem(id: string): Promise<void> {
  await updateItem(id, { failed: false, lastError: null, attempts: 0 });
  void flushQueue();
}

/** 사람이 실패 항목을 폐기 — 데이터 유실을 명시적으로 인지하고 누른 경우만(목록 UI에서 확인 문구 필요) */
export async function discardQueueItem(id: string): Promise<void> {
  await removeItem(id);
}

/** 지금 즉시 전체 전송 시도(배지의 [지금 전송] 버튼용) */
export async function flushQueueNow(): Promise<void> {
  backoffMs = 5_000;
  await flushQueue();
}

// ── 전송(FIFO, 순서 보장) ───────────────────────────────────────────
let flushing = false;
let backoffMs = 5_000;
const BACKOFF_MAX_MS = 60_000;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

function clearBackoffTimer(): void {
  if (backoffTimer) { clearTimeout(backoffTimer); backoffTimer = null; }
}

function scheduleBackoffRetry(): void {
  if (backoffTimer) return; // 이미 예약돼 있으면 중복 예약하지 않는다
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void flushQueue();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
}

/** 401/403 제외 4xx — 데이터 검증 오류. 자동 재시도 대상이 아니다. */
function isValidationError(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403;
}

/**
 * 큐를 앞에서부터 순서대로 비운다.
 * 5xx/네트워크 오류를 만나면 그 자리에서 멈추고(뒤 항목이 앞 항목을 추월해 순서가
 * 뒤집히지 않도록) 백오프 재시도를 예약한다. 4xx는 그 항목만 "실패함"으로 넘기고 계속 진행한다.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const items = await ensureLoaded();
    for (const item of [...items]) {
      if (item.failed) continue;
      try {
        await api.post(item.url, item.body);
        if (item.kind === 'attendance') {
          // 출퇴근은 서버 계약상 "수신 시각 = 정본"(폰 시계 조작 방지, 대표 확정)이라 지연 전송되면
          // 실제 누른 시각(item.occurredAt)보다 늦게 기록된다. 조용히 넘기지 않고 한 번 알린다 —
          // 시각 정정은 관리자 정정 기능(사유·원시각 감사 기록)으로 처리한다(A안, 2026-09-06).
          const pressed = item.occurredAt.slice(11, 16);
          lastResolvedNotice = `${item.label} — ${pressed}에 눌렀지만 전파 문제로 지금 전송됨. 기록 시각은 전송 시각이므로 정정이 필요하면 관리자에게 요청하세요.`;
        }
        await removeItem(item.id);
        clearBackoffTimer();
        backoffMs = 5_000; // 성공 — 백오프 리셋
      } catch (e) {
        // 409 ALREADY_RECORDED — 실패가 아니라 목적 달성. "실패함"으로 넘기지 않고 제거한다.
        if (e instanceof ApiError && e.status === 409) {
          lastResolvedNotice = `${item.label} — 이미 기록돼 있어 대기열에서 제거됨`;
          await removeItem(item.id);
          clearBackoffTimer();
          backoffMs = 5_000;
          continue; // 나머지 항목은 계속 진행
        }
        const lastError = e instanceof Error ? e.message : String(e);
        if (isValidationError(e)) {
          await updateItem(item.id, { failed: true, lastError, attempts: item.attempts + 1 });
          continue; // 검증 오류는 이 항목만 보류하고 나머지는 계속 시도
        }
        await updateItem(item.id, { lastError, attempts: item.attempts + 1 });
        scheduleBackoffRetry();
        return; // 순서 보장 — 이후 항목은 다음 flush(백오프 또는 포그라운드 복귀)에서
      }
    }
  } finally {
    flushing = false;
  }
}

// ── 초기화 — 앱 시작 시 1회(app/_layout.tsx에서 호출) ───────────────
let initialized = false;
export function initOfflineQueue(): void {
  if (initialized) return;
  initialized = true;
  void loadQueue().then(() => void flushQueue());
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') {
      backoffMs = 5_000;
      void flushQueue();
    }
  });
}

// ── postWithQueue — 훅·클래스가 호출하는 진입점 ─────────────────────

/**
 * 직접 전송이 네트워크·서버 오류(5xx)로 실패했을 때만 큐에 넣었다는 뜻.
 * 성공도 실패도 아니다 — 호출부는 이걸 "저장됨"이 아니라 "대기 중"으로 보여줘야 한다(정직성).
 */
export class QueuedOfflineError extends Error {
  queueId: string;
  /** false면 이번 세션 메모리에만 있다 — 앱을 끄면 유실될 수 있다는 뜻(UI가 강하게 경고해야 함) */
  persisted: boolean;
  constructor(queueId: string, persisted: boolean) {
    super(
      persisted
        ? '전파가 약해 저장 대기열에 넣었습니다. 신호가 돌아오면 자동으로 전송됩니다.'
        : '전파가 약해 임시로만 저장했습니다 — 앱을 종료하기 전에 신호가 있는 곳에서 전송 여부를 확인하세요.',
    );
    this.name = 'QueuedOfflineError';
    this.queueId = queueId;
    this.persisted = persisted;
  }
}

function shouldQueue(e: unknown): boolean {
  if (e instanceof ApiError) {
    // 서버가 응답은 했다 — 5xx(서버 장애)만 재시도 대상. 4xx·401·403은 데이터/인증 문제라 큐에 넣지 않는다.
    return e.status >= 500;
  }
  // ApiError가 아니면 fetch 자체가 실패한 것(오프라인·타임아웃·DNS 등) — 큐 대상.
  return true;
}

export interface PostWithQueueInput {
  kind: QueueKind;
  label: string;
  url: string;
  body: Record<string, unknown>;
  /**
   * body에 occurredAt을 채워 보낼지(기본 true). attendance처럼 서버가 클라이언트 시각을
   * 받지 않는(=받아선 안 되는) 라우트는 반드시 false로 호출한다.
   */
  sendOccurredAt?: boolean;
}

/**
 * 직접 전송을 먼저 시도하고, 그 요청이 네트워크 오류나 서버 오류(5xx)로 실패했을 때만
 * 큐에 넣는다. 검증 오류(4xx)·인증 오류(401/403)는 큐 대상이 아니라 그대로 던진다
 * (데이터를 고치거나 로그인을 다시 해야 하는 문제이지, 나중에 다시 보낸다고 해결되지 않는다).
 *
 * 큐에 들어가면 성공(TData)도 일반 실패(원래 오류)도 아닌 QueuedOfflineError를 던진다.
 * 호출부(화면)는 이걸 잡아 "대기 중" 문구로 보여줘야 한다 — 저장됐다고 거짓말하지 않되,
 * 실패로 겁주지도 않는다.
 */
export async function postWithQueue<TData>(input: PostWithQueueInput): Promise<TData> {
  const occurredAt = getKSTNowWallClockIso();
  const clientRequestId = makeId();
  const sendOccurredAt = input.sendOccurredAt !== false;
  const body: Record<string, unknown> = sendOccurredAt
    ? { ...input.body, occurredAt: (input.body as any).occurredAt ?? occurredAt, clientRequestId }
    : { ...input.body };

  try {
    return await api.post<TData>(input.url, body);
  } catch (e) {
    if (!shouldQueue(e)) throw e;
    const item: QueueItem = {
      id: makeId(),
      clientRequestId,
      kind: input.kind,
      label: input.label,
      url: input.url,
      body,
      occurredAt,
      createdAt: getKSTNowWallClockIso(),
      attempts: 0,
      lastError: e instanceof Error ? e.message : String(e),
      failed: false,
      persisted: true,
    };
    const persisted = await setRaw(ITEM_KEY(item.id), JSON.stringify(item));
    item.persisted = persisted;
    await ensureLoaded(); // cache가 아직 없으면 채워둔다
    cache = [...(cache ?? []), item];
    await persistAll();
    notify();
    scheduleBackoffRetry(); // 이번 항목을 빨리 흘려보내도록 재시도 예약(성공하면 스스로 리셋)
    throw new QueuedOfflineError(item.id, item.persisted);
  }
}
