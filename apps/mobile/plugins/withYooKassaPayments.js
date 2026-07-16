const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const YOOKASSA_PODS_SOURCE = "source 'https://git.yoomoney.ru/scm/sdk/cocoa-pod-specs.git'";

function ensureYooKassaPodsSource(contents) {
  if (contents.includes(YOOKASSA_PODS_SOURCE)) return contents;

  const lines = contents.split("\n");
  const lastSourceIndex = lines.reduce(
    (result, line, index) => (line.startsWith("source '") ? index : result),
    -1,
  );
  lines.splice(lastSourceIndex + 1, 0, YOOKASSA_PODS_SOURCE);
  return lines.join("\n");
}

module.exports = function withYooKassaPayments(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfilePath, "utf8");
      fs.writeFileSync(podfilePath, ensureYooKassaPodsSource(contents));
      return modConfig;
    },
  ]);

  return withXcodeProject(config, (modConfig) => {
    const configurations = modConfig.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      if (typeof configuration !== "object" || !configuration?.buildSettings) continue;
      if (!configuration.buildSettings.SWIFT_OBJC_BRIDGING_HEADER) continue;

      // YooKassa propagates BUILD_LIBRARY_FOR_DISTRIBUTION=YES through the
      // aggregate Pods xcconfig. An application target with Expo's bridging
      // header cannot emit a module interface, so override it only for the app.
      configuration.buildSettings.BUILD_LIBRARY_FOR_DISTRIBUTION = "NO";
    }
    return modConfig;
  });
};

module.exports.ensureYooKassaPodsSource = ensureYooKassaPodsSource;
