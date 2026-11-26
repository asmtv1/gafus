/** Enforce the generated native OTA configuration even for direct Gradle/Xcode releases. */
const { withAppBuildGradle, withXcodeProject } = require('expo/config-plugins');

function addAndroidGuard(contents, environment) {
  if (!["production", "preview"].includes(environment)) throw Error("GAFUS invalid OTA environment");
  const guard = `
// GAFUS_NATIVE_OTA_ARTIFACT_GUARD
def gafusOtaCheck = tasks.register("verifyGafusReleaseOta") {
    doLast {
        def manifest = file("src/main/AndroidManifest.xml").getText("UTF-8")
        if (!manifest.contains("https://") || !manifest.contains("/ota/manifest") || manifest.contains("u.expo.dev") ||
            !manifest.contains("x-gafus-native-fingerprint") || !manifest.contains("CODE_SIGNING_CERTIFICATE")) {
            throw new GradleException("GAFUS: release requires generated signed self-hosted OTA")
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn gafusOtaCheck }
["assembleRelease": ["outputs/apk/release", "**/*.apk"], "bundleRelease": ["outputs/bundle/release", "**/*.aab"]].each { taskName, spec ->
    def artifactCheck = tasks.register("verifyGafus" + taskName.capitalize() + "Artifact") {
        doLast {
            def files = fileTree(new File(layout.buildDirectory.get().asFile, spec[0])) { include spec[1] }.files
            if (files.isEmpty()) throw new GradleException("GAFUS: missing final release artifact")
            files.each { artifact ->
                def checker = new ProcessBuilder("python3", new File(rootProject.projectDir, "../scripts/verify-native-ota-artifact.py").absolutePath,
                    artifact.absolutePath, "--environment", "${environment}").inheritIO().start()
                if (checker.waitFor() != 0) throw new GradleException("GAFUS: release artifact OTA verification failed")
            }
        }
    }
    tasks.matching { it.name == taskName }.configureEach { finalizedBy artifactCheck }
}
// END GAFUS_NATIVE_OTA_ARTIFACT_GUARD
`;
  const clean = contents.replace(/\n\/\/ GAFUS_NATIVE_OTA_ARTIFACT_GUARD[\s\S]*?\/\/ END GAFUS_NATIVE_OTA_ARTIFACT_GUARD\n/g, '\n');
  return clean.trimEnd() + '\n' + guard;
}

function addIosGuard(project, environment) {
  if (!["production", "preview"].includes(environment)) throw Error("GAFUS invalid OTA environment");
  const target = project.getFirstTarget();
  if (!target?.uuid) throw Error('GAFUS: missing iOS app target for OTA gate');
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  const name = 'GAFUS signed OTA release guard';
  const script = [
    'set -eu',
    'case "$CONFIGURATION" in Debug*) exit 0;; esac',
    'python3 "$SRCROOT/../scripts/verify-native-ota-artifact.py" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Expo.plist" --ios-plist --environment ' + environment,
  ].join('\n');
  const existing = target.firstTarget.buildPhases.find(ref => String(phases[ref.value]?.name || '').replaceAll('"', '') === name);
  if (existing) {
    phases[existing.value].shellScript = JSON.stringify(script);
    phases[existing.value].alwaysOutOfDate = 1;
    return project;
  }
  const phase = project.addBuildPhase([], 'PBXShellScriptBuildPhase', name, target.uuid, { shellPath: '/bin/sh', shellScript: script });
  phase.buildPhase.alwaysOutOfDate = 1;
  return project;
}

module.exports = function withGafusNativeOtaGuard(config) {
  const environment = config.extra?.otaEnvironment === 'preview' ? 'preview' : 'production';
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw Error('GAFUS OTA guard requires Groovy Gradle');
    mod.modResults.contents = addAndroidGuard(mod.modResults.contents, environment);
    return mod;
  });
  return withXcodeProject(config, mod => {
    addIosGuard(mod.modResults, environment);
    return mod;
  });
};
module.exports.addAndroidGuard = addAndroidGuard;
module.exports.addIosGuard = addIosGuard;
