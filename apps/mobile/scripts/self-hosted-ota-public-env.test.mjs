import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {otaReleaseVersionName,validatePreviewOtaExportEnv,validateProductionOtaExportEnv} from "./self-hosted-ota-public-env.mjs";
const updateId="bd13130e-62ad-4ce2-b3ab-dde0c5c8c566";
const version=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8")).version;
const releaseVersion=otaReleaseVersionName(version,updateId);
function env() {return {
  APP_ENV:"preview",GAFUS_OTA_TRANSPORT:"self-hosted",OTA_PLATFORM:"ios",
  GAFUS_OTA_TARGET_PLATFORM:"ios",OTA_RUNTIME:version,OTA_UPDATE_ID:updateId,
  EXPO_PUBLIC_API_BASE_URL:"https://preview-api.gafus.test",
  EXPO_PUBLIC_CHAT2_API_ORIGIN:"https://preview-api.gafus.test",
  EXPO_PUBLIC_APP_VERSION:releaseVersion,EXPO_PUBLIC_TELEMETRY_ENABLED:"true",
};}
test("preview bundle has explicit nonproduction API and exact OTA release version",()=>{
  assert.equal(releaseVersion,`${version}-ota.bd13130e62ad`);
  assert.equal(validatePreviewOtaExportEnv(env()).releaseVersion,releaseVersion);
  assert.deepEqual(validatePreviewOtaExportEnv({...env(),OTA_PLATFORM:"android",GAFUS_OTA_TARGET_PLATFORM:"android"}).platform,"android");
});
test("rejects production API, missing Chat2 origin and disabled telemetry",()=>{
  const variants=[
    {EXPO_PUBLIC_API_BASE_URL:"https://api.gafus.ru"},
    {EXPO_PUBLIC_CHAT2_API_ORIGIN:""},
    {EXPO_PUBLIC_CHAT2_API_ORIGIN:"https://another-preview.test"},
    {EXPO_PUBLIC_API_BASE_URL:"http://preview-api.gafus.test"},
    {EXPO_PUBLIC_API_BASE_URL:"https://preview-api.gafus.test/unsafe"},
    {EXPO_PUBLIC_TELEMETRY_ENABLED:"false"},
    {EXPO_PUBLIC_APP_VERSION:version},
  ];
  for(const patch of variants) assert.throws(()=>validatePreviewOtaExportEnv({...env(),...patch}));
});
test("cannot substitute EAS config, unsupported runtime or invalid update IDs",()=>{
  for(const patch of [{APP_ENV:"production"},{GAFUS_OTA_TRANSPORT:"eas"},
    {OTA_RUNTIME:"1.8.0"},{GAFUS_OTA_TARGET_PLATFORM:"android"}])
    assert.throws(()=>validatePreviewOtaExportEnv({...env(),...patch}));
  assert.throws(()=>otaReleaseVersionName(version,"invalid-update-id"));
});

test('production export is strictly pinned to the checked-out runtime, API origin and approved CI',()=>{
  const valid={...env(),APP_ENV:'production',CI:'true',GAFUS_OTA_PRODUCTION_APPROVED:'true',
    EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru',
    EXPO_PUBLIC_CHAT2_API_ORIGIN:'https://api.gafus.ru'};
  assert.equal(validateProductionOtaExportEnv(valid).runtime,version);
  const android={...valid,OTA_PLATFORM:'android',GAFUS_OTA_TARGET_PLATFORM:'android'};
  assert.equal(validateProductionOtaExportEnv(android).platform,'android');
  const otherRuntime=version==='1.7.5'?'1.7.6':'1.7.5';
  assert.throws(()=>validateProductionOtaExportEnv({...valid,OTA_RUNTIME:otherRuntime,EXPO_PUBLIC_APP_VERSION:otaReleaseVersionName(otherRuntime,updateId)}),/OTA_PRODUCTION_/);
  for(const patch of [{APP_ENV:'preview'},{CI:'false'},{GAFUS_OTA_PRODUCTION_APPROVED:'false'},
    {EXPO_PUBLIC_API_BASE_URL:'https://gafus.ru'},{EXPO_PUBLIC_APP_VERSION:'1.8.0'},
    {OTA_RUNTIME:'1.8.0'},{GAFUS_OTA_TARGET_PLATFORM:'android'}])
    assert.throws(()=>validateProductionOtaExportEnv({...valid,...patch}),/OTA_PRODUCTION_/);
});
