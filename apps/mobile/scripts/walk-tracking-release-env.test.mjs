import { test } from "node:test";
import assert from "node:assert/strict";
import { IOS_WALK_TITLE, walkTrackingReleaseEnv } from "./walk-tracking-release-env.mjs";
const env={CI:"true",GAFUS_OTA_PRODUCTION_APPROVED:"true",APP_ENV:"production",OTA_PLATFORM:"ios",OTA_RUNTIME:"1.7.5",OTA_NATIVE_ID:"0093f03d-3a04-4968-878c-c7e30f77fa66",OTA_PAYMENT_CONTENT:"ios-public-yookassa",OTA_RELEASE_TITLE:IOS_WALK_TITLE};
test("production iOS 101 enables v2 median, display and backtrack, not raw QA",()=>{
 const r=walkTrackingReleaseEnv(env);
 assert.equal(r.EXPO_PUBLIC_WALK_TRACKING_ENGINE,"v2");
 assert.equal(r.EXPO_PUBLIC_WALK_TRACKING_VARIANT,"median");
 assert.equal(r.EXPO_PUBLIC_WALK_FINAL_DISPLAY,"1");
 assert.equal(r.EXPO_PUBLIC_WALK_BACKTRACK,"1");
 assert.equal(r.EXPO_PUBLIC_WALK_QA_CAPTURE,"0");
});
test("other releases and rollback default to v1 without QA, including hostile inherited env",()=>{
 const r=walkTrackingReleaseEnv({...env,OTA_RELEASE_TITLE:"Recovery",OTA_RECOVERY_FOR:"17",EXPO_PUBLIC_WALK_QA_CAPTURE:"1"});
 assert.equal(r.EXPO_PUBLIC_WALK_TRACKING_ENGINE,"v1");
 assert.equal(r.EXPO_PUBLIC_WALK_QA_CAPTURE,"0");
});
test("wrong platform, native, runtime, payment profile, CI or recovery fails closed",()=>{
 for(const patch of [{OTA_PLATFORM:"android"},{OTA_RUNTIME:"1.7.6"},{OTA_NATIVE_ID:"wrong"},{OTA_PAYMENT_CONTENT:"standard"},{CI:"false"},{GAFUS_OTA_PRODUCTION_APPROVED:"false"},{OTA_RECOVERY_FOR:"17"}])
  assert.throws(()=>walkTrackingReleaseEnv({...env,...patch}),/IOS_SMART_TRACKING_RELEASE_TARGET_INVALID/);
});
