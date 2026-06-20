const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs/promises");
const path = require("path");

// Temporary iOS compatibility layer for keeping AppMetrica 5.16.0.
//
// Why this exists:
// 1. YandexMobileAds 7.18.0 works with AppMetrica 5.x at runtime, but its
//    upstream podspec pins AppMetrica dependencies to ~> 5.14.0. The local
//    podspec keeps the same YandexMobileAds binary and widens only those
//    AppMetrica constraints so CocoaPods can resolve AppMetrica 5.16.0.
// 2. AppMetricaCrashes 5.16.0 uses typeof(self) in an Objective-C++ file,
//    which fails under Xcode 26.2. The post_install patch rewrites that to
//    __typeof(self) after CocoaPods installs the pod.
//
// Remove this plugin when the upstream packages become compatible, for example
// when @appmetrica/react-native-analytics moves to AppMetrica 6.x or Yandex
// publishes a 7.x podspec that allows AppMetrica 5.16.0.
const PATCH_SNIPPET = `
    Dir.glob(File.join(__dir__, 'Pods/AppMetricaCrashes/**/AMAANRWatchdog.mm')).each do |watchdog_path|
      watchdog_source = File.read(watchdog_path)
      patched_source = watchdog_source
        .gsub(/_+typeof__\\(self\\)/, '__typeof__(self)')
        .gsub(/(?<!_)typeof\\(self\\)/, '__typeof__(self)')
      next if patched_source == watchdog_source

      File.write(watchdog_path, patched_source)
      Pod::UI.puts "Patched AppMetricaCrashes AMAANRWatchdog typeof for Objective-C++"
    end
`;

const YANDEX_POD_SNIPPET =
  "  pod 'YandexMobileAds', :podspec => File.join(__dir__, '../plugins/YandexMobileAds-7.18.0-AppMetrica5.podspec.json')\n\n";

const withIosAppMetrica516Compatibility = (config) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let contents = await fs.readFile(podfilePath, "utf8");

      contents = contents.replace(
        "patched_source = watchdog_source.gsub('typeof(self)', '__typeof__(self)')",
        "patched_source = watchdog_source\n        .gsub(/_+typeof__\\\\(self\\\\)/, '__typeof__(self)')\n        .gsub(/(?<!_)typeof\\\\(self\\\\)/, '__typeof__(self)')"
      );

      if (!contents.includes("YandexMobileAds-7.18.0-AppMetrica5.podspec.json")) {
        contents = contents.replace(
          "\n  config = use_native_modules!(config_command)\n",
          `\n${YANDEX_POD_SNIPPET}  config = use_native_modules!(config_command)\n`
        );
      }

      if (contents.includes("AMAANRWatchdog.mm")) {
        await fs.writeFile(podfilePath, contents);
        return config;
      }

      contents = contents.replace(
        /(\s+react_native_post_install\([\s\S]*?\n\s+\)\n)(\s+end\nend\n?)$/,
        `$1${PATCH_SNIPPET}$2`
      );

      await fs.writeFile(podfilePath, contents);
      return config;
    },
  ]);

module.exports = withIosAppMetrica516Compatibility;
