/**
 * 웹 QA 빌드에서 주소창의 /worker 접두사를 유지한다 (2026-08-31)
 *
 * 증상 (대표 신고: "웹에서 404를 띄우는데" → 새로고침했을 때)
 *   1. /worker/workboard 에서 새로고침한다.
 *   2. 화면은 정상으로 뜨는데 **주소창이 /workboard 로 바뀐다** — /worker 가 사라진다.
 *   3. 여기서 한 번 더 새로고침하면 Next 는 /workboard 라우트가 없으므로 404.
 *      (웹 관리자에 로그인된 쿠키가 있으면 미들웨어를 통과해 그대로 404,
 *       로그인 안 돼 있으면 307 로 /login 으로 튄다. 어느 쪽이든 앱이 죽는다.)
 *
 * 원인
 *   expo-router 의 experiments.baseUrl 은 **빌드 시 에셋 경로**에는 적용되지만,
 *   런타임에 히스토리를 정리(replaceState)할 때 baseUrl 을 다시 붙여주지 않는다.
 *   그래서 부팅 직후 주소가 접두사 없는 경로로 덮인다.
 *
 * 대책
 *   history.pushState / replaceState 를 감싸서, 앱이 접두사 없는 경로를 쓰려고 하면
 *   /worker 를 다시 붙인다. 부팅 시 현재 주소도 한 번 교정한다.
 *
 * ⚠ 네이티브(실기기)에서는 아무 것도 하지 않는다 — history 자체가 없다.
 * ⚠ 근본 해결은 expo-router 업그레이드다(대기 작업의 'Expo SDK 업그레이드'와 묶임).
 *   그때 이 파일이 필요 없어지면 지울 것. 남겨두면 이중 접두사 위험이 있다.
 */
import { Platform } from 'react-native';

/** app.json 의 experiments.baseUrl 과 반드시 같아야 한다. */
export const WEB_BASE_URL = '/worker';

function withBase(path: string): string {
  if (!path.startsWith('/')) return path;             // 상대경로는 건드리지 않는다
  if (path === WEB_BASE_URL) return path;
  if (path.startsWith(WEB_BASE_URL + '/')) return path; // 이미 붙어 있다
  return WEB_BASE_URL + path;
}

let installed = false;

export function keepBaseUrl(): void {
  if (Platform.OS !== 'web' || installed) return;
  const w = globalThis as unknown as {
    history?: History;
    location?: Location;
  };
  if (!w.history || !w.location) return;
  installed = true;

  const patch = (name: 'pushState' | 'replaceState') => {
    const original = w.history![name].bind(w.history);
    w.history![name] = ((data: unknown, unused: string, url?: string | URL | null) => {
      if (typeof url === 'string') return original(data, unused, withBase(url));
      return original(data, unused, url as any);
    }) as History['pushState'];
  };
  patch('pushState');
  patch('replaceState');

  // 부팅 시점에 이미 접두사가 빠져 있으면 즉시 교정한다.
  const now = w.location.pathname;
  const fixed = withBase(now);
  if (fixed !== now) {
    w.history.replaceState(w.history.state, '', fixed + w.location.search + w.location.hash);
  }
}
