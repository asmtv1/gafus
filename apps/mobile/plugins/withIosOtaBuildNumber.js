/** Keep the iOS main Xcode target build number identical to the signed OTA
 * native descriptor. Expo prebuild writes CFBundleVersion correctly, but its
 * default pbxproj leaves CURRENT_PROJECT_VERSION=1 for the main app target.
 */
const { withXcodeProject } = require('expo/config-plugins');

function enforceIosOtaTargetBuildNumber(project, buildNumber) {
  if (!/^[1-9]\d{0,9}$/.test(String(buildNumber))) throw Error('INVALID_OTA_IOS_BUILD_NUMBER');
  const rows=project.pbxXCBuildConfigurationSection();
  let targets=0;
  for(const entry of Object.values(rows)) {
    if(!entry || typeof entry!=='object' || entry.isa!=='XCBuildConfiguration')continue;
    const values=entry.buildSettings;
    if(!values || String(values.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"','')!=='ru.gafus.app')continue;
    values.CURRENT_PROJECT_VERSION=Number(buildNumber);
    targets++;
  }
  if(targets!==2)throw Error(`OTA_IOS_MAIN_TARGET_CONFIG_COUNT_${targets}`);
  return project;
}
function withIosOtaBuildNumber(config) {
  if(process.env.GAFUS_OTA_TRANSPORT!=='self-hosted' ||
     process.env.GAFUS_OTA_TARGET_PLATFORM!=='ios')return config;
  const buildNumber=config.ios?.buildNumber;
  if(!buildNumber)throw Error('OTA_IOS_BUILD_NUMBER_REQUIRED');
  return withXcodeProject(config,mod=>{
    enforceIosOtaTargetBuildNumber(mod.modResults,buildNumber);
    return mod;
  });
}
module.exports=withIosOtaBuildNumber;
module.exports.enforceIosOtaTargetBuildNumber=enforceIosOtaTargetBuildNumber;
