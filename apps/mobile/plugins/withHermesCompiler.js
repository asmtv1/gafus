const { withAppBuildGradle } = require("expo/config-plugins");

// React Native 0.83 keeps hermesc in its pinned hermes-compiler dependency,
// not in react-native/sdks/hermesc. Resolve through RN so pnpm peer installs
// and the matching Hermes bytecode version work in clean EAS builds.
function patchHermesCompiler(contents) {
  if (contents.includes("hermes-compiler/package.json")) return contents;
  const legacy = /^(\s*)hermesCommand\s*=\s*[^\r\n]*\/sdks\/hermesc\/%OS-BIN%\/hermesc[^\r\n]*/m;
  if (!legacy.test(contents)) {
    throw new Error("Hermes: expected Expo RN compiler path in android/app/build.gradle");
  }
  return contents.replace(legacy, (_, indent) =>
    `${indent}hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"`
  );
}

module.exports = function withHermesCompiler(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") throw new Error("Hermes: Groovy build.gradle required");
    mod.modResults.contents = patchHermesCompiler(mod.modResults.contents);
    return mod;
  });
};
module.exports.patchHermesCompiler = patchHermesCompiler;
