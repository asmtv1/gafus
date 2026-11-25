import test from "node:test";
import assert from "node:assert/strict";
import { smartTrackingQaEnv, SMART_TRACKING_QA_TITLE } from "./smart-tracking-qa-env.mjs";
const ios={APP_ENV:"production",OTA_RUNTIME:"1.7.5",OTA_PLATFORM:"ios",
  OTA_PAYMENT_CONTENT:"ios-public-yookassa",OTA_RELEASE_TITLE:SMART_TRACKING_QA_TITLE};
test("only the named QA release compiles experimental flags",()=>{
  assert.equal(smartTrackingQaEnv(ios).EXPO_PUBLIC_WALK_TRACKING_VARIANT,"median");
  assert.equal(smartTrackingQaEnv({...ios,OTA_PLATFORM:"android",OTA_PAYMENT_CONTENT:"android-rustore-yookassa"}).EXPO_PUBLIC_WALK_QA_CAPTURE,"1");
  assert.deepEqual(smartTrackingQaEnv({...ios,OTA_RELEASE_TITLE:"Normal update"}),{});
});
test("reject wrong platform, runtime, checkout profile and recovery",()=>{
  for(const patch of [{OTA_RUNTIME:"1.7.6"},{OTA_PLATFORM:"android"},{OTA_PAYMENT_CONTENT:"standard"},{OTA_RECOVERY_FOR:"9"},{APP_ENV:"preview"}])
    assert.throws(()=>smartTrackingQaEnv({...ios,...patch}),/SMART_TRACKING_QA_TARGET_INVALID/);
});
