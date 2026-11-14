import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {otaTracerVersionName,validatePreviewOtaExportEnv} from "./self-hosted-ota-public-env.mjs";
const updateId="bd13130e-62ad-4ce2-b3ab-dde0c5c8c566";
const version=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8")).version;
const tracerVersion=otaTracerVersionName(version,updateId);
function env() {return {
  APP_ENV:"preview",GAFUS_OTA_TRANSPORT:"self-hosted",OTA_PLATFORM:"ios",
  GAFUS_OTA_TARGET_PLATFORM:"ios",OTA_RUNTIME:version,OTA_UPDATE_ID:updateId,
  EXPO_PUBLIC_API_BASE_URL:"https://preview-api.gafus.test",
  EXPO_PUBLIC_CHAT2_API_ORIGIN:"https://preview-api.gafus.test",
  EXPO_PUBLIC_APP_VERSION:tracerVersion,EXPO_PUBLIC_ENABLE_TRACER:"true",
  EXPO_PUBLIC_TRACER_APP_TOKEN_JS:"js-preview-public-token",
  EXPO_PUBLIC_TRACER_APP_TOKEN_IOS:"ios-preview-public-token",
  EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID:"android-preview-public-token",
};}
test("preview bundle has explicit nonproduction API and exact OTA/AppTracer version",()=>{
  assert.equal(tracerVersion,`${version}-ota.bd13130e62ad`);
  assert.equal(validatePreviewOtaExportEnv(env()).tracerVersion,tracerVersion);
  assert.deepEqual(validatePreviewOtaExportEnv({...env(),OTA_PLATFORM:"android",GAFUS_OTA_TARGET_PLATFORM:"android"}).platform,"android");
});
test("rejects production API, missing Chat2 origin and per-platform tracing",()=>{
  const variants=[
    {EXPO_PUBLIC_API_BASE_URL:"https://api.gafus.ru"},
    {EXPO_PUBLIC_CHAT2_API_ORIGIN:""},
    {EXPO_PUBLIC_CHAT2_API_ORIGIN:"https://another-preview.test"},
    {EXPO_PUBLIC_API_BASE_URL:"http://preview-api.gafus.test"},
    {EXPO_PUBLIC_API_BASE_URL:"https://preview-api.gafus.test/unsafe"},
    {EXPO_PUBLIC_ENABLE_TRACER:"false"},
    {EXPO_PUBLIC_TRACER_APP_TOKEN_JS:""},
    {EXPO_PUBLIC_TRACER_APP_TOKEN_IOS:""},
    {EXPO_PUBLIC_APP_VERSION:version},
  ];
  for(const patch of variants) assert.throws(()=>validatePreviewOtaExportEnv({...env(),...patch}));
});
test("cannot substitute EAS config, unsupported runtime or invalid update IDs",()=>{
  for(const patch of [{APP_ENV:"production"},{GAFUS_OTA_TRANSPORT:"eas"},
    {OTA_RUNTIME:"1.7.5"},{GAFUS_OTA_TARGET_PLATFORM:"android"}])
    assert.throws(()=>validatePreviewOtaExportEnv({...env(),...patch}));
  assert.throws(()=>otaTracerVersionName(version,"invalid-update-id"));
});
