// Metro config — 워커 앱은 자기완결적(self-contained)이라 프로젝트 루트만 감시한다.
// 이전 설정은 watchFolders 에 repoRoot(topcare/)를 통째로 넣어, 문서생성 프로젝트의
// node_modules(.bin 심링크 등)까지 훑다가 Windows 권한 오류(EACCES lstat)로 죽었다.
// topcare-shared 를 실제로 import 하게 되면, repoRoot 가 아니라 그 폴더만 콕 집어
// watchFolders 에 추가할 것.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// topcare-shared 가 존재하고 실제 import 가 생기면 그 폴더만 감시에 추가.
const sharedDir = path.resolve(projectRoot, '..', 'topcare-shared');
config.watchFolders = fs.existsSync(sharedDir) ? [sharedDir] : [];

// 모듈 해석은 프로젝트 node_modules 우선.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// ── 선택적(optional) 의존 스텁 (2026-08-06, 웹 export 시 발견) ──
// @supabase/supabase-js 가 @opentelemetry/api 를 `import(...).catch(() => null)` 로
// 부른다. 없어도 무해한 코드지만 Metro 는 정적으로 해석하려다 번들을 실패시킨다:
//   "Unable to resolve module @opentelemetry/api from @supabase/supabase-js"
// 실제로 설치할 이유가 없으므로 빈 모듈로 해석시킨다(네이티브·웹 공통).
const OPTIONAL_STUBS = {
  '@opentelemetry/api': path.resolve(projectRoot, 'stubs', 'empty.js'),
  // react-native-web 에는 PermissionsAndroid 가 없다. scanner.ts 가 정적 import 하지만
  // 런타임에는 `Platform.OS !== 'android'` 에서 먼저 return 하므로 웹에서 절대 실행되지
  // 않는다 → 해석만 통과시키면 된다(웹 QA 빌드용).
  'react-native-web/dist/exports/PermissionsAndroid': path.resolve(projectRoot, 'stubs', 'empty.js'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stub = OPTIONAL_STUBS[moduleName];
  if (stub) return { type: 'sourceFile', filePath: stub };
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
