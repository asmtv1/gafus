const { withPodfile } = require("expo/config-plugins");

/**
 * The iOS paywall uses StoreKit. This unused old private YooMoney CocoaPods
 * source must not return on expo prebuild (ios/ is git-ignored).
 * No change to Android/Web billing or existing renewal cancellation.
 */
function patchPodfileForStoreKit(contents) {
  const cleaned = contents.replace(
    /^\s*source\s+['"]https:\/\/git\.yoomoney\.ru\/scm\/sdk\/cocoa-pod-specs\.git['"][\t ]*\r?\n/gm,
    "",
  );
  // An iOS YooKassa native dependency is never expected. Reject it rather
  // than silently removing a pod that other source modules may reference.
  if(/^\s*pod\s+['"](?:yookassa|yoomoney)(?:[^'"]*)['"]/im.test(cleaned))
    throw Error("IOS_YOOKASSA_NATIVE_POD_FORBIDDEN");
  return cleaned;
}
module.exports = (config) => withPodfile(config, (mod) => {
  mod.modResults.contents = patchPodfileForStoreKit(mod.modResults.contents);
  return mod;
});
module.exports.patchPodfileForStoreKit = patchPodfileForStoreKit;
