const { withDangerousMod, withAndroidManifest, withMainApplication } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * MainApplication changes belong in the typed Kotlin mod, not a dangerous mod.
 * The generated file may not yet contain other plugins' edits when dangerous
 * mods run, so searching it for a specific template comment breaks clean EAS.
 */
function patchMainApplication(contents) {
  const marker = "add(ru.gafus.app.walk.DogWalkReactPackage())";
  if (contents.includes(marker)) return contents;
  const packageList = /PackageList\(this\)\.packages(?:\.apply\s*\{)?/;
  const match = packageList.exec(contents);
  if (!match) throw new Error("DogWalk: cannot find React package list in MainApplication.kt");
  if (match[0].includes(".apply")) {
    return contents.replace(packageList, `${match[0]}\n          ${marker}`);
  }
  return contents.replace(packageList, `${match[0]}.apply {\n          ${marker}\n        }`);
}

/** Bundled native Android health foreground service, stable across Expo prebuilds. */
module.exports = function withDogWalkBackgroundSteps(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["uses-permission"] ??= [];
    for (const name of [
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_HEALTH",
    ]) {
      if (!manifest["uses-permission"].some((item) => item.$["android:name"] === name)) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }
    const application = manifest.application?.[0];
    if (!application) throw new Error("AndroidManifest missing application for DogWalk service");
    application.service ??= [];
    const serviceName = "ru.gafus.app.walk.DogWalkStepService";
    if (!application.service.some((item) => item.$["android:name"] === serviceName)) {
      application.service.push({ $: {
        "android:name": serviceName,
        "android:exported": "false",
        "android:stopWithTask": "false",
        "android:foregroundServiceType": "health",
      } });
    }
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error("DogWalk: Kotlin MainApplication required");
    }
    mod.modResults.contents = patchMainApplication(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ["android", async (mod) => {
    const source = path.join(mod.modRequest.projectRoot, "native/android-walk/src/ru/gafus/app/walk");
    const dest = path.join(mod.modRequest.platformProjectRoot, "app/src/main/java/ru/gafus/app/walk");
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(source)) {
      if (file.endsWith(".java")) fs.copyFileSync(path.join(source, file), path.join(dest, file));
    }
    // The widget provider must survive every clean Expo prebuild, not just
    // local changes inside the generated android/ directory.
    const widgetSource = path.join(mod.modRequest.projectRoot, "native/android-walk/src/ru/gafus/app/widget/DogWalk.java");
    const widgetDest = path.join(mod.modRequest.platformProjectRoot, "app/src/main/java/ru/gafus/app/widget");
    fs.mkdirSync(widgetDest, { recursive: true });
    fs.copyFileSync(widgetSource, path.join(widgetDest, "DogWalk.java"));
    const resSource = path.join(mod.modRequest.projectRoot, "native/android-walk/res");
    for (const folder of ["layout", "drawable"]) {
      const output = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res", folder);
      fs.mkdirSync(output, { recursive: true });
      for (const file of fs.readdirSync(path.join(resSource, folder))) {
        fs.copyFileSync(path.join(resSource, folder, file), path.join(output, file));
      }
    }
    const providerInfo = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml/widgetprovider_dogwalk.xml");
    if (!fs.existsSync(providerInfo)) throw new Error("DogWalk: widget provider XML not generated");
    const providerXml = fs.readFileSync(providerInfo, "utf8");
    if (!providerXml.includes('@layout/rn_widget') && !providerXml.includes('@layout/gafus_walk_widget')) {
      throw new Error("DogWalk: unexpected widget initial layout");
    }
    fs.writeFileSync(providerInfo, providerXml.replace('@layout/rn_widget', '@layout/gafus_walk_widget'));
    return mod;
  }]);
};

module.exports.patchMainApplication = patchMainApplication;
