// Metro config — monorepo aware so topcare-shared can be resolved later.
// Foundation layer is self-contained; this sets up watching the repo root
// and the shared package node_modules for future cross-package imports.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..', '..'); // topcare/

const config = getDefaultConfig(projectRoot);

// Watch the repo root so changes in topcare-shared trigger rebuilds.
config.watchFolders = [repoRoot, path.resolve(projectRoot, '..', 'topcare-shared')];

// Resolve modules from the app first, then the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

module.exports = config;
