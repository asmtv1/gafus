import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectIosPaymentExport } from "./verify-ios-payment-export.mjs";

const originalEnv = { ...process.env };
const id = "0093f03d-3a04-4968-878c-c7e30f77fa66";
const embedded = "cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e";
const close = () => {
  for (const key of ["OTA_PAYMENT_CONTENT", "GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR",
    "CI", "GAFUS_OTA_PRODUCTION_APPROVED", "OTA_NATIVE_ID", "OTA_PLATFORM", "OTA_RUNTIME", "OTA_RECOVERY_FOR"]) {
    if (Object.hasOwn(originalEnv,key)) process.env[key] = originalEnv[key];
    else delete process.env[key];
  }
};

function inspect(profile, tokens, distribution = "app-store") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ios-payment-export-"));
  try {
    const native = {id,embeddedUpdateId:embedded,verified:true,distribution,
      platform:"ios",appId:"gafus",bundleId:"ru.gafus.app",environment:"production",
      channel:"production",runtimeVersion:"1.7.5",appVersion:"1.7.5",
      nativeFingerprint:"a".repeat(64),signingKeyId:"gafus-production-20261115"};
    fs.writeFileSync(path.join(tmp,"native.json"),JSON.stringify(native));
    const bundle="i".repeat(1100)+" "+tokens.join(" ");
    fs.writeFileSync(path.join(tmp,"bundle.hbc"),bundle);
    fs.writeFileSync(path.join(tmp,"metadata.json"),JSON.stringify({
      fileMetadata:{ios:{bundle:"bundle.hbc",assets:[]}},
    }));
    Object.assign(process.env, {OTA_PAYMENT_CONTENT:profile,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:path.join(tmp,"native.json"),
      CI:"true",GAFUS_OTA_PRODUCTION_APPROVED:"true",OTA_NATIVE_ID:id,
      OTA_PLATFORM:"ios",OTA_RUNTIME:"1.7.5"});
    delete process.env.OTA_RECOVERY_FOR;
    return inspectIosPaymentExport(tmp);
  } finally {close();fs.rmSync(tmp,{recursive:true,force:true});}
}

test("standard StoreKit export excludes both YooKassa and promo routes",()=>{
  assert.doesNotThrow(()=>inspect("standard",[]));
  assert.throws(()=>inspect("standard",["/promo-code/preview"]),/FORBIDDEN/);
  assert.throws(()=>inspect("standard",["/yookassa/start"]),/FORBIDDEN/);
});
test("public signed iOS OTA includes exactly the verified YooKassa and promo endpoints",()=>{
  assert.doesNotThrow(()=>inspect("ios-public-yookassa",[
    "/yookassa/start","/promo-code/preview","gafus://subscription-return"]));
  assert.throws(()=>inspect("ios-public-yookassa",[
    "/yookassa/start","gafus://subscription-return"]),/MISMATCH/);
  assert.throws(()=>inspect("ios-public-yookassa",[
    "/yookassa/start","/promo-code/preview","startYookassa","gafus://subscription-return"]),/MISMATCH/);
});
test("legacy internal profile does not silently acquire promo routes",()=>{
  assert.throws(()=>inspect("internal-yookassa",[
    "/yookassa/start","/promo-code/preview","gafus://subscription-return"],"internal"),/MISMATCH/);
});
