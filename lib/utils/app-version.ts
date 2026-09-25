/**
 * 앱 내 버전 표기 (2026-09-08, v2.3.0 rc2)
 *
 * 왜 있나 — 대표가 설치본 버전을 확인할 곳이 없었다(로그인 화면·홈 어디에도 버전 표시 없음).
 *
 * 값 출처 — 새 패키지 없이 이미 의존성인 expo-constants 만 쓴다.
 *   - versionName: Constants.nativeAppVersion(네이티브 빌드 실값 — 이 프로젝트는
 *     bare RN이라 이쪽이 실제 설치본 값이다: Android versionName / iOS CFBundleShortVersionString)
 *     우선, 없으면 Constants.expoConfig?.version(관리형/설정 임베드) 폴백.
 *   - buildNumber: Constants.nativeBuildVersion(Android versionCode / iOS CFBundleVersion).
 *
 * 핫픽스 H-3(2026-09-23, Q19-14 P3)
 *   순서가 반대였다(expoConfig.version 우선) — bare RN 빌드에서 expoConfig.version 은
 *   package.json 값(당시 "0.1.0")을 그대로 반영해 로그인 화면에 "v0.1.0 (build 14)"가
 *   찍혔다(실제 설치본은 2.4.2). nativeApplicationVersion 을 우선으로 바꾸고,
 *   package.json version 도 앱 버전(2.4.3)과 맞춘다(하드코딩 금지 — 폴백만 남긴다).
 *
 * Q22-11(2026-09-25, 2.4.6) — H-3이 고친 줄도 사실상 한 번도 네이티브 값을 읽지 못했다.
 *   `Constants.nativeApplicationVersion`은 expo-constants에 **없는 속성명**이다(그건 expo-application의
 *   이름). expo-constants 15.4.x의 실제 키는 `nativeAppVersion`·`nativeBuildVersion`이다
 *   (android ConstantsService.getConstants가 PackageInfo.versionName/versionCode로 채운다).
 *   NativeConstants 타입에 `[key: string]: any` 색인 서명이 있어 tsc가 오타를 잡지 못했고,
 *   값은 늘 undefined → `expoConfig.version`(APK assets/app.config) 폴백으로 떨어졌다.
 *   2.4.5 APK의 app.config가 gradle 증분 캐시로 2.4.4에 머물러 "v2.4.4 (build 17)"이 찍혔다
 *   (build 17이 맞았던 이유 = nativeBuildVersion 키는 원래 맞았다).
 *   → 키를 `nativeAppVersion`으로 바로잡는다. react-native 내장 Platform.constants(Android)에는
 *     앱 versionName이 없어(OS Version·Release·Model 등만) 별도 폴백은 두지 않는다(새 패키지 금지).
 *   빌드 뒤 app.config·번들 검증은 scripts/verify-release-bundle.js(npm run release:verify)가 한다.
 *
 * ⚠ 목데이터 금지 원칙과 동일: 값을 못 구하면 "버전 확인 불가" 같은 대체 문구를 보여주지
 *   않는다 — 표기 자체를 숨긴다(getAppVersionLabel()이 null을 돌려주면 렌더하지 않을 것).
 *   versionName만 있고 buildNumber가 없으면 build 표기만 생략한다(있는 값은 감추지 않는다).
 */
import Constants from 'expo-constants';

export function getAppVersionLabel(): string | null {
  const versionName = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null;
  if (!versionName) return null;
  const buildNumber = Constants.nativeBuildVersion ?? null;
  return buildNumber
    ? `TopCare 워커 v${versionName} (build ${buildNumber})`
    : `TopCare 워커 v${versionName}`;
}
