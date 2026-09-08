/**
 * 앱 내 버전 표기 (2026-09-08, v2.3.0 rc2)
 *
 * 왜 있나 — 대표가 설치본 버전을 확인할 곳이 없었다(로그인 화면·홈 어디에도 버전 표시 없음).
 *
 * 값 출처 — 새 패키지 없이 이미 의존성인 expo-constants 만 쓴다.
 *   - versionName: Constants.expoConfig?.version(관리형/설정 임베드) 우선,
 *     없으면 Constants.nativeApplicationVersion(네이티브 빌드 실값 — 이 프로젝트는 bare RN이라
 *     보통 이쪽이 채워진다: Android versionName / iOS CFBundleShortVersionString).
 *   - buildNumber: Constants.nativeBuildVersion(Android versionCode / iOS CFBundleVersion).
 *
 * ⚠ 목데이터 금지 원칙과 동일: 값을 못 구하면 "버전 확인 불가" 같은 대체 문구를 보여주지
 *   않는다 — 표기 자체를 숨긴다(getAppVersionLabel()이 null을 돌려주면 렌더하지 않을 것).
 *   versionName만 있고 buildNumber가 없으면 build 표기만 생략한다(있는 값은 감추지 않는다).
 */
import Constants from 'expo-constants';

export function getAppVersionLabel(): string | null {
  const versionName = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? null;
  if (!versionName) return null;
  const buildNumber = Constants.nativeBuildVersion ?? null;
  return buildNumber
    ? `TopCare 워커 v${versionName} (build ${buildNumber})`
    : `TopCare 워커 v${versionName}`;
}
