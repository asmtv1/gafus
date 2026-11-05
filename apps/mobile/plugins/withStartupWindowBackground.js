const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Prevent the default dark AppCompat window from appearing between the Android
 * system launch screen and React's first painted startup poster.
 *
 * This runs on clean Expo prebuild / EAS as well as the checked-in android/
 * directory; changing only the generated values/styles.xml would be lost.
 */
function ensureStartupWindowBackground(resources) {
  const theme = resources.style?.find((item) => item.$?.name === "AppTheme");
  if (!theme) throw Error("GAFUS startup: AppTheme missing in Android styles");
  theme.item ??= [];
  const existing = theme.item.find((item) => item.$?.name === "android:windowBackground");
  if (existing) existing._ = "@color/splashscreen_background";
  else theme.item.push({
    $: { name: "android:windowBackground" },
    _: "@color/splashscreen_background",
  });
  return resources;
}

module.exports = function withStartupWindowBackground(config) {
  return withAndroidStyles(config, (mod) => {
    mod.modResults.resources = ensureStartupWindowBackground(mod.modResults.resources);
    return mod;
  });
};

module.exports.ensureStartupWindowBackground = ensureStartupWindowBackground;
