const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const optimizedResourceShrinking = 'android.r8.optimizedResourceShrinking';
const defaultProguardFile = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/;
const optimizedProguardFile = /getDefaultProguardFile\((['"])proguard-android-optimize\.txt\1\)/;

// Reanimated and Worklets already publish these rules through consumerProguardFiles.
const duplicateTemplateRules = new Set([
  '# react-native-reanimated',
  '-keep class com.swmansion.reanimated.** { *; }',
  '-keep class com.facebook.react.turbomodule.** { *; }',
]);

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (mod) => {
    // AGP 8.12 requires an explicit opt-in for integrated resource shrinking.
    mod.modResults = mod.modResults.filter((entry) =>
      entry.type !== 'property' || entry.key !== optimizedResourceShrinking);
    mod.modResults.push({ type: 'property', key: optimizedResourceShrinking, value: 'true' });
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('GAFUS Android release optimization expects the Expo Groovy app/build.gradle');
    }
    const contents = mod.modResults.contents.replace(
      defaultProguardFile, 'getDefaultProguardFile("proguard-android-optimize.txt")');
    if (!optimizedProguardFile.test(contents)) {
      throw new Error('GAFUS Android release optimization could not locate the Expo ProGuard configuration');
    }
    mod.modResults.contents = contents;
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const contents = await readFile(file, 'utf8');
    const rules = contents.split('\n').filter((line) => !duplicateTemplateRules.has(line.trim())).join('\n');
    if (rules !== contents) await writeFile(file, rules, 'utf8');
    return mod;
  }]);
};
