/**
 * Config plugin: задаёт rootProject.ext.minSdkVersion и ndkVersion до применения
 * expo-root-project (который иначе берёт значения из version catalog).
 * NDK 27.1 установлен частично — принудительно используем NDK 26.2.11394342.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs/promises");
const path = require("path");

const BEFORE_PROJECT_SNIPPET = `
gradle.beforeProject { project ->
  project.ext.minSdkVersion = 24
  project.ext.minSdk = 24
}
gradle.projectsLoaded {
  gradle.rootProject.ext.minSdkVersion = 24
  gradle.rootProject.ext.minSdk = 24
}
`;

const PRE_PLUGIN_SNIPPET =
  "def minSdk = Integer.parseInt(findProperty('android.minSdkVersion') ?: '24')\n" +
  "ext.minSdkVersion = minSdk\n" +
  "ext.minSdk = minSdk\n";

const POST_PLUGIN_SNIPPET =
  "ext.minSdkVersion = 24\n" +
  "ext.minSdk = 24\n";

const SUBPROJECTS_SNIPPET = `
subprojects { subproject ->
  subproject.pluginManager.withPlugin('com.android.library') {
    subproject.android.defaultConfig.minSdkVersion = 24
  }
}
`;

const withMinSdkFromGradleProps = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;

      const gradlePropertiesPath = path.join(platformRoot, "gradle.properties");
      let gradleProps = await fs.readFile(gradlePropertiesPath, "utf8");
      if (!gradleProps.includes("org.gradle.jvmargs")) {
        gradleProps += "\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m\n";
      } else {
        gradleProps = gradleProps.replace(
          /org\.gradle\.jvmargs=.*/,
          "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m"
        );
      }
      await fs.writeFile(gradlePropertiesPath, gradleProps);

      const rootBuildGradlePath = path.join(platformRoot, "build.gradle");
      let contents = await fs.readFile(rootBuildGradlePath, "utf8");

      if (!contents.includes("gradle.beforeProject")) {
        contents = contents.replace(
          /^(\/\/ Top-level build file[^\n]*\n)/,
          `$1${BEFORE_PROJECT_SNIPPET}`
        );
      }

      if (!contents.includes("ext.minSdkVersion = minSdk")) {
        contents = contents.replace(
          /apply plugin: "expo-root-project"/,
          `${PRE_PLUGIN_SNIPPET}apply plugin: "expo-root-project"`
        );
      }

      if (!contents.includes("ext.minSdkVersion = 24")) {
        contents = contents.replace(
          /apply plugin: "expo-root-project"\n/,
          `apply plugin: "expo-root-project"\n${POST_PLUGIN_SNIPPET}`
        );
      }

      if (!contents.includes("subproject.pluginManager.withPlugin")) {
        contents = contents.replace(
          /apply plugin: "com\.facebook\.react\.rootproject"\n/,
          `apply plugin: "com.facebook.react.rootproject"\n${SUBPROJECTS_SNIPPET}`
        );
      }

      await fs.writeFile(rootBuildGradlePath, contents);
      return config;
    },
  ]);
};

module.exports = withMinSdkFromGradleProps;
