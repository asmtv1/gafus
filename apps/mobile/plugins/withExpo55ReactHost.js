const { withMainApplication } = require("expo/config-plugins");

// Expo SDK 55 removed expo.modules.ReactNativeHostWrapper. Incremental prebuild
// keeps git-ignored native source files, so migrate the old host implementation
// without discarding GAFUS AppTracer/ActivityLifecycleCallbacks customizations.
function patchMainApplication(contents) {
  if (!contents.includes("ReactNativeHostWrapper")) {
    if (!contents.includes("ExpoReactHostFactory.getDefaultReactHost")) {
      throw new Error("Unexpected Expo 55 MainApplication host implementation");
    }
    return contents;
  }

  if (!contents.includes("import expo.modules.ReactNativeHostWrapper")) {
    throw new Error("Legacy ReactNativeHostWrapper import is missing");
  }

  const legacyHost = /  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper\([\s\S]*?\n  override val reactHost: ReactHost\n    get\(\) = ReactNativeHostWrapper\.createReactHost\(applicationContext, reactNativeHost\)\n/;
  if (!legacyHost.test(contents)) {
    throw new Error("Unexpected legacy Expo MainApplication ReactNativeHostWrapper block");
  }

  const modernHost = `  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Additional custom packages can be registered here if needed.
        }
    )
  }
`;

  return contents
    .replace("import expo.modules.ReactNativeHostWrapper", "import expo.modules.ExpoReactHostFactory")
    .replace(/^import com\.facebook\.react\.ReactNativeHost\r?\n/m, "")
    .replace(/^import com\.facebook\.react\.defaults\.DefaultReactNativeHost\r?\n/m, "")
    .replace(legacyHost, modernHost);
}

const withExpo55ReactHost = (config) =>
  withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error("withExpo55ReactHost requires Kotlin MainApplication");
    }
    mod.modResults.contents = patchMainApplication(mod.modResults.contents);
    return mod;
  });

module.exports = withExpo55ReactHost;
module.exports.patchMainApplication = patchMainApplication;
