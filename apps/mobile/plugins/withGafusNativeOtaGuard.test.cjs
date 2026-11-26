const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addAndroidGuard, addIosGuard } = require('./withGafusNativeOtaGuard');

test('Android release guard is idempotent, rejects Expo, and verifies final APK and AAB',()=>{
  const result=addAndroidGuard('android {}\n','production');
  assert.equal(addAndroidGuard(result,'production'),result);
  for(const value of ['preReleaseBuild','assembleRelease','bundleRelease','finalizedBy','verify-native-ota-artifact.py','u.expo.dev','**/*.apk','**/*.aab']){
    assert.ok(result.includes(value),value);
  }
  const preview=addAndroidGuard(result,'preview');
  assert.ok(preview.includes('"--environment", "preview"'));
  assert.equal(preview.match(/def gafusOtaCheck/g).length,1);
  assert.throws(()=>addAndroidGuard(result,'invalid'),/invalid OTA environment/);
});

test('iOS release guard is always run, idempotent, and reads built Expo.plist',()=>{
  const target={uuid:'app',firstTarget:{buildPhases:[]}};
  const phases={};
  const project={
    getFirstTarget:()=>target,
    hash:{project:{objects:{PBXShellScriptBuildPhase:phases}}},
    addBuildPhase(_files,type,name,id,opts){
      assert.equal(type,'PBXShellScriptBuildPhase');
      assert.equal(id,'app');
      const phase={name,shellScript:opts.shellScript};
      phases.guard=phase;
      target.firstTarget.buildPhases.push({value:'guard'});
      return {buildPhase:phase};
    },
  };
  addIosGuard(project,'production');
  addIosGuard(project,'preview');
  assert.equal(target.firstTarget.buildPhases.length,1);
  assert.equal(phases.guard.alwaysOutOfDate,1);
  assert.ok(phases.guard.shellScript.includes('Expo.plist'));
  assert.ok(phases.guard.shellScript.includes('--environment preview'));
});
