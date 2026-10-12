const { withPodfile } = require("expo/config-plugins");

// React Native Voximplant 2.0.0 requires iOS SDK 3.3.0. Since apps/mobile/ios
// is git-ignored, podspecs must be restored on every Expo prebuild.
const SDK_VERSION = "3.3.0";
const POD_NAMES = ["VoximplantCore", "VoximplantCalls", "VoximplantWebRTC"];

function patchPodfile(contents) {
  const missing = POD_NAMES.filter((name) => {
    const existing = new RegExp(`^\\s*pod ['\"]${name}['\"]`, "m");
    return !existing.test(contents);
  });
  if (missing.length === 0) return contents;

  const autolink = /^([ \t]*config = use_native_modules!\([^\n]*\)\r?\n)/m;
  if (!autolink.test(contents)) {
    throw new Error("Cannot locate iOS use_native_modules! in Podfile for Voximplant SDK");
  }

  const lines = missing.map(
    (name) =>
      `  pod '${name}', :podspec => 'https://github.com/voximplant/ios-sdk-releases/releases/download/${SDK_VERSION}/${name}.podspec'`,
  );
  return contents.replace(autolink, (match) => `${match}\n${lines.join("\n")}\n`);
}

const withVoximplantIosPods = (config) =>
  withPodfile(config, (mod) => {
    mod.modResults.contents = patchPodfile(mod.modResults.contents);
    return mod;
  });

module.exports = withVoximplantIosPods;
module.exports.patchPodfile = patchPodfile;
