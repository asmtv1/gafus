const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// AppTracer source maps are uploaded after each EAS update by
// scripts/upload-apptracer-sourcemaps.mjs.
const config = getDefaultConfig(projectRoot);

// expo-sqlite uses a bundled WebAssembly file for web/server route evaluation.
// Expo Router may build the web graph even while launching iOS, so Metro must
// know that .wasm is an asset or route discovery fails before native startup.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

// Поддержка монорепозитория (объединяем с дефолтами Expo)
config.watchFolders = [...(config.watchFolders || [projectRoot]), monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Minification для production
config.transformer.minifierConfig = {
  keep_classnames: false,
  keep_fnames: false,
  mangle: {
    keep_classnames: false,
    keep_fnames: false,
  },
};

module.exports = config;
