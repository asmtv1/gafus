const {test}=require('node:test');
const assert=require('node:assert/strict');
const {enforceIosOtaTargetBuildNumber}=require('./withIosOtaBuildNumber');
test('self-hosted iOS target receives exactly the native descriptor build number',()=>{
 const app=(name)=>({isa:'XCBuildConfiguration',buildSettings:{PRODUCT_BUNDLE_IDENTIFIER:'"ru.gafus.app"',CURRENT_PROJECT_VERSION:1},name});
 const widget={isa:'XCBuildConfiguration',buildSettings:{PRODUCT_BUNDLE_IDENTIFIER:'"ru.gafus.app.ExpoWidgetsTarget"',CURRENT_PROJECT_VERSION:1}};
 const rows={debug:app('Debug'),release:app('Release'),widget};
 const fake={pbxXCBuildConfigurationSection:()=>rows};
 enforceIosOtaTargetBuildNumber(fake,'17502');
 assert.equal(rows.debug.buildSettings.CURRENT_PROJECT_VERSION,17502);
 assert.equal(rows.release.buildSettings.CURRENT_PROJECT_VERSION,17502);
 assert.equal(widget.buildSettings.CURRENT_PROJECT_VERSION,1);
 assert.throws(()=>enforceIosOtaTargetBuildNumber({pbxXCBuildConfigurationSection:()=>({debug:rows.debug})},'17502'),/CONFIG_COUNT_1/);
 assert.throws(()=>enforceIosOtaTargetBuildNumber(fake,'0'),/INVALID_OTA_IOS_BUILD_NUMBER/);
});
