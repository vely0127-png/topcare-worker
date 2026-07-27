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

module.exports = config;
