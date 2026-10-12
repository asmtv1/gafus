const { withAppDelegate } = require('expo/config-plugins');

// Native ios/ is ignored and reused by Expo prebuild. Align the legacy
// Swift entry point with Expo SDK 55 (Swift 6 / internal Expo module imports)
// without replacing GAFUS-specific AppTracer hooks and React Native delegates.
function patchAppDelegate(source) {
  if (!/^(?:public\s+)?class AppDelegate:\s*ExpoAppDelegate\s*\{/m.test(source)) {
    throw new Error('Unexpected Expo 55 AppDelegate class declaration');
  }
  if (source.includes('@UIApplicationMain')) {
    source = source.replace(/@UIApplicationMain\s*\n/, '@main\n');
  }
  if (!source.includes('@main\n')) {
    throw new Error('Expected Swift @main AppDelegate entry point');
  }
  source = source.replace(/^public class AppDelegate:/m, 'class AppDelegate:');
  source = source.replace(/^[ \t]*bindReactNativeFactory\(factory\)\r?\n/m, '');
  if (source.includes('internal import Expo\n')) return source;
  if (!/^import Expo\r?$/m.test(source)) {
    throw new Error('Expected Expo import in AppDelegate');
  }
  return source.replace(/^import Expo\r?$/m, 'internal import Expo');
}

const withExpo55IosAppDelegate = (config) =>
  withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withExpo55IosAppDelegate requires Swift');
    }
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });

module.exports = withExpo55IosAppDelegate;
module.exports.patchAppDelegate = patchAppDelegate;
