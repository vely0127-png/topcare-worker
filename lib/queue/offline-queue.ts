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
 *   - 401/403 → 최초 직접 전송 시점에는 인증 문제라 큐 대상 자체가 아니다(postWithQueue가
 *     그대로 throw). 단, 이미 큐에 들어간 항목이 나중에 flushQueue에서 401/403(또는
 *     ApiError.code === 'ACCOUNT_DISABLED')을 받으면(세션 만료·계정 비활성화 등, S-15)
 *     5xx처럼 무한 재시도하지 않고 "실패함"으로 분류해 자동 재시도를 멈춘다.
 *   - 409 ALREADY_RECORDED(2026-09-06 PD 검토 후속 ①) → "실패"가 아니다. 같은 계획·같은 날짜
 *     기록이 이미 존재해 큐 항목의 목적이 이미 달성된 상태이므로, 실패함으로 분류하지 않고
 *     조용히 제거한다. 단 "조용히"는 아니고 lastResolvedNotice에 한 줄 남겨 배지가 한 번 보여준다.
 *
 * 중복 방지
 *   각 항목에 clientRequestId(이 파일이 생성하는 문자열 — RFC4122 UUID 아님, 시각+난수 조합)를
 *   포함해 보낸다. 서버가 이 값으로 멱등 처리를 하는지는 라우트별로 다르다 — 미확인 라우트는
 *   보고 목록 참고. 서버 지원이 없으면 "네트워크는 성공했는데 응답을 못 받고 재시도"하는
 *   극히 드문 경우에 한해 중복 저장 가능성이 이론상 남는다(순차 FIFO라 흔치 않음).
 *
 * 소유자 격리 (2026-09-07, 보안검토 S-13 — 로그아웃·계정 전환 후 A의 큐가 B의 토큰으로 전송되던 결함)
 *   각 항목은 큐에 넣는 시점의 세션에서 ownerUserId/ownerStaffId를 박아 저장한다.
 *   flushQueue는 **현재 세션 사용자와 ownerUserId가 같은 항목만** 전송한다 — 다른 사용자
 *   소유 항목은 건너뛰고(삭제하지 않는다), 세션이 없으면(로그아웃 상태) flush 자체를 하지 않는다.
 *   이 필드가 없는 구 항목(마이그레이션 전 저장분)은 "소유자 미상"으로 분류돼 자동 전송되지
 *   않으며, 현재 로그인한 사람이 claimLegacyQueueItem()으로 명시적으로 인수해야만(감사 목적
 *   라벨에 "(인수)" 표기) 전송 대상이 된다. 재시도(retryQueueItem)·폐기(discardQueueItem)도
 *   소유자 본인 항목에만 허용한다.
 *
 * 인증 오류(401/403) 및 보존 상한 (2026-09-07, 보안검토 S-15)
 *   큐에 이미 들어간 항목이 재전송 시점에 401/403(또는 ApiError.code === 'ACCOUNT_DISABLED')을
 *   받으면 더 이상 5xx와 같이 무한 재시도하지 않는다 — failed로 분류하고 사람이 읽을 수 있는
 *   한글 안내로 자동 재시도를 멈춘다(로그인 필요/계정 비활성화). createdAt 기준 14일을 넘긴
 *   항목은 자동 삭제하지 않되 목록 상단 경고 + 개별 '만료' 표시로 사람이 폐기 여부를 판단하게 한다.
 *
 * 409 처리 세분화 (2026-09-07, 보안검토 S-19)
 *   error.code === 'ALREADY_RECORDED'인 409만 "목적 달성"으로 조용히 제거한다. 그 외 409
 *   (예: 비콘 체류의 TOO_LATE)는 실패로 분리 보관한다 — 자정을 넘겨 지연 전송된 항목을
 *   "이미 기록됨"이라는 거짓 안내와 함께 유실시키지 않기 위함이다.
 */
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../auth/auth-store';
import { IS_DEV } from '../config';
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
  /** 목록·배지에 보일 한 줄 (예: "101호 배변 케어"). label에 성명·진단·측정값 금지 —
   *  배지는 잠금 해제 직후 화면이라 로그인한 사람이면 누구나(다른 사용자 소유 항목도 건수는
   *  보인다) 볼 수 있다는 전제로 작성한다. */
  label: string;
  url: string;
  body: Record<string, unknown>;
  /** 저장을 시도한 시점의 KST 벽시계 — 표시용(서버 전송 여부는 kind별로 다름, 위 주석 참고) */
  occurredAt: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** lastError가 우리가 직접 작성한 한글 안내(true, 예: 인증 오류)인지 서버/JS 원문 그대로(false)
   *  인지 — describeQueueError()가 이 값을 보고 원문 노출 여부를 정한다(S-16). 구 항목(필드
   *  없음)은 false와 동일하게 취급(=원문 숨김)한다. */
  lastErrorCurated?: boolean;
  /** 4xx 등 검증 오류 — 자동 재시도 중단, 사람 확인 필요 */
  failed: boolean;
  /** false면 디스크 저장이 실패해 이번 세션 메모리에만 있다(용량 초과 등) — 앱 종료 시 유실 위험 */
  persisted: boolean;
  /** 큐에 넣은 시점의 세션 사용자 id — 소유자 격리(S-13)의 기준. 이 필드가 아예 없으면
   *  (마이그레이션 전 구 항목) "소유자 미상"으로 분류돼 자동 전송되지 않는다. */
  ownerUserId?: string | null;
  /** 큐에 넣은 시점의 세션 staffId(있으면). */
  ownerStaffId?: string | null;
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

// ── 소유자 격리(S-13) ───────────────────────────────────────────────

/** 항목에 ownerUserId 필드 자체가 있는지(값이 null/undefined가 아닌지) — 없으면 마이그레이션 전 구 항목 */
function hasKnownOwner(item: QueueItem): boolean {
  return Object.prototype.hasOwnProperty.call(item, 'ownerUserId') && item.ownerUserId != null;
}

/**
 * 항목이 현재 로그인한 사용자 소유인지 분류한다.
 *  - 'mine'    : ownerUserId가 현재 세션 사용자와 같음 → 자동 전송·재시도·폐기 대상.
 *  - 'other'   : ownerUserId가 있지만 다른 사용자 → 건수만 표시, 조작 불가(삭제도 하지 않는다).
 *  - 'unknown' : ownerUserId 필드가 없는 구 항목(마이그레이션 전) → claimLegacyQueueItem으로만 인수.
 */
export function classifyQueueItemOwner(item: QueueItem): 'mine' | 'other' | 'unknown' {
  if (!hasKnownOwner(item)) return 'unknown';
  const currentUserId = useAuthStore.getState().currentUserId();
  if (!currentUserId) return 'other'; // 로그아웃 상태에서는 소유자가 있어도 "내 것"이 아니다
  return item.ownerUserId === currentUserId ? 'mine' : 'other';
}

/** 사람이 실패 항목을 다시 시도 — 소유자 본인 항목에만 허용한다(S-13). */
export async function retryQueueItem(id: string): Promise<void> {
  const items = await ensureLoaded();
  const item = items.find((i) => i.id === id);
  if (!item || classifyQueueItemOwner(item) !== 'mine') return;
  await updateItem(id, { failed: false, lastError: null, attempts: 0 });
  void flushQueue();
}

/** 사람이 실패 항목을 폐기 — 데이터 유실을 명시적으로 인지하고 누른 경우만(목록 UI에서 확인 문구 필요).
 *  소유자 본인 항목에만 허용한다(S-13) — 다른 사용자의 기록을 감사 없이 지울 수 없게 한다. */
export async function discardQueueItem(id: string): Promise<void> {
  const items = await ensureLoaded();
  const item = items.find((i) => i.id === id);
  if (!item || classifyQueueItemOwner(item) !== 'mine') return;
  await removeItem(id);
}

/**
 * 구 항목(마이그레이션 전 — ownerUserId 없음)을 현재 로그인한 사용자가 명시적으로 인수한다.
 * 실제 기록자와 인수자가 다를 수 있으므로 label에 "(인수)"를 남겨 감사 목적으로 구분한다.
 * 이미 소유자가 있는 항목(있는데 다른 사람인 경우 포함)은 인수 대상이 아니다.
 */
export async function claimLegacyQueueItem(id: string): Promise<void> {
  const auth = useAuthStore.getState();
  const currentUserId = auth.currentUserId();
  if (!currentUserId) return; // 로그인 없이는 인수 불가
  const items = await ensureLoaded();
  const item = items.find((i) => i.id === id);
  if (!item || hasKnownOwner(item)) return;
  await updateItem(id, {
    ownerUserId: currentUserId,
    ownerStaffId: auth.currentStaffId(),
    label: `${item.label} (인수)`,
  });
  void flushQueue();
}

// ── 보존 상한(S-15) ─────────────────────────────────────────────────
const RETENTION_WARN_MS = 14 * 24 * 60 * 60 * 1000; // 14일 — 초과해도 자동 삭제하지 않고 경고만

/** createdAt 기준 14일을 넘긴 항목인지 — 자동 폐기 근거가 아니라 사람에게 보여줄 경고용이다. */
export function isQueueItemExpired(item: QueueItem, now: number = Date.now()): boolean {
  const created = Date.parse(item.createdAt);
  if (Number.isNaN(created)) return false;
  return now - created > RETENTION_WARN_MS;
}

// ── 오류 문구(S-16) ─────────────────────────────────────────────────
/**
 * 목록에 보일 오류 문구. 개발 빌드(IS_DEV)이거나 우리가 직접 작성한 안내(lastErrorCurated)면
 * 그대로 보여주고, 그 외(서버/JS 원문)에는 프로덕션에서 일반 안내로 치환한다 — 서버 오류
 * 원문(테이블명·내부 메시지 등)이 잠금만 푼 사람에게 그대로 노출되지 않게 한다.
 */
export function describeQueueError(item: QueueItem): string {
  if (!item.lastError) return '저장 실패';
  if (IS_DEV || item.lastErrorCurated) return item.lastError;
  return '전송에 실패했습니다 — 확인 후 다시 시도하거나 폐기하세요.';
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
 * 인증/계정 상태 오류(S-15) — 401·403 또는 ApiError.code === 'ACCOUNT_DISABLED'(그 외 계정 상태
 * 코드도 같은 취급). client.ts가 401은 refresh 1회 재시도 후에도 실패한 경우만 여기 도달한다.
 * 재시도한다고 해결되는 문제가 아니므로 5xx처럼 무한 백오프하지 않고 failed로 분류한다.
 */
function isAuthError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.status === 401 || e.status === 403 || e.code === 'ACCOUNT_DISABLED';
}

function authErrorMessage(e: ApiError): string {
  if (e.code === 'ACCOUNT_DISABLED') return '계정이 비활성화되었습니다. 관리자에게 문의하세요.';
  if (e.status === 401) return '로그인이 필요합니다. 다시 로그인한 뒤 [다시 시도]를 눌러주세요.';
  return '접근 권한이 없습니다. 관리자에게 문의하세요.';
}

/**
 * 큐를 앞에서부터 순서대로 비운다.
 * 세션이 없으면(로그아웃 상태) 아무것도 전송하지 않는다(S-13). 소유자가 현재 세션 사용자와
 * 다르거나 소유자 미상(구 항목)인 항목은 건너뛰되 삭제하지 않는다 — FIFO는 같은 소유자
 * 항목들 사이에서만 보장하면 되므로, 건너뛰어도 그 사용자 몫의 순서는 흐트러지지 않는다.
 * 5xx/네트워크 오류를 만나면 그 자리에서 멈추고(뒤 항목이 앞 항목을 추월해 순서가
 * 뒤집히지 않도록) 백오프 재시도를 예약한다. 4xx/인증 오류는 그 항목만 "실패함"으로 넘기고 계속 진행한다.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  const currentUserId = useAuthStore.getState().currentUserId();
  if (!currentUserId) return; // 로그아웃 상태 — flush 자체를 하지 않는다(S-13)
  flushing = true;
  try {
    const items = await ensureLoaded();
    for (const item of [...items]) {
      if (item.failed) continue;
      const owner = classifyQueueItemOwner(item);
      if (owner !== 'mine') continue; // 'other'(다른 사용자)·'unknown'(소유자 미상, 인수 대기) — 건너뛴다
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
        // 409는 error.code로 세분화한다(S-19) — ALREADY_RECORDED만 "목적 달성", 그 외(예: 비콘
        // 체류의 TOO_LATE)는 실패로 분리 보관해야 지연 전송된 항목이 거짓 안내와 함께 유실되지 않는다.
        if (e instanceof ApiError && e.status === 409) {
          if (e.code === 'ALREADY_RECORDED') {
            lastResolvedNotice = `${item.label} — 이미 기록돼 있어 대기열에서 제거됨`;
            await removeItem(item.id);
            clearBackoffTimer();
            backoffMs = 5_000;
            continue; // 나머지 항목은 계속 진행
          }
          await updateItem(item.id, {
            failed: true,
            lastError: e.message,
            lastErrorCurated: false,
            attempts: item.attempts + 1,
          });
          continue;
        }
        if (isAuthError(e)) {
          await updateItem(item.id, {
            failed: true,
            lastError: authErrorMessage(e as ApiError),
            lastErrorCurated: true,
            attempts: item.attempts + 1,
          });
          continue; // 인증 오류는 이 항목만 보류하고 나머지는 계속 시도
        }
        const lastError = e instanceof Error ? e.message : String(e);
        if (isValidationError(e)) {
          await updateItem(item.id, { failed: true, lastError, lastErrorCurated: false, attempts: item.attempts + 1 });
          continue; // 검증 오류는 이 항목만 보류하고 나머지는 계속 시도
        }
        await updateItem(item.id, { lastError, lastErrorCurated: false, attempts: item.attempts + 1 });
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
    const auth = useAuthStore.getState();
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
      lastErrorCurated: false,
      failed: false,
      persisted: true,
      // 큐에 넣는 시점의 세션에서 소유자를 박는다(S-13) — postWithQueue는 인증이 필요한
      // mutation 경로에서만 호출되므로 이 시점에 세션이 없을 일은 사실상 없지만,
      // 방어적으로 null일 수 있게 타입을 열어둔다(그 경우 flushQueue가 소유자 미상으로 본다).
      ownerUserId: auth.currentUserId(),
      ownerStaffId: auth.currentStaffId(),
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
