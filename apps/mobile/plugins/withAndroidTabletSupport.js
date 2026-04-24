const { withAndroidManifest } = require("expo/config-plugins");

const TABLET_SCREEN_SUPPORT = {
  "android:anyDensity": "true",
  "android:largeScreens": "true",
  "android:normalScreens": "true",
  "android:resizeable": "true",
  "android:smallScreens": "true",
  "android:xlargeScreens": "true",
};

const withAndroidTabletSupport = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const supportsScreens = manifest["supports-screens"] ?? [];

    if (supportsScreens.length === 0) {
      manifest["supports-screens"] = [{ $: TABLET_SCREEN_SUPPORT }];
      return config;
    }

    const current = supportsScreens[0].$ ?? {};
    supportsScreens[0].$ = {
      ...current,
      ...TABLET_SCREEN_SUPPORT,
    };

    manifest["supports-screens"] = supportsScreens;
    return config;
  });

module.exports = withAndroidTabletSupport;
