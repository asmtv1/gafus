import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { checkOtaUploadPlan, uploadImmutableOtaAssets, assertDirectCloudRuAssetOrigin, assertCloudRuOtaPublisherConfig } from "./upload-mobile-ota-assets.mjs";
const root = fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ota-s3-qa-"));
const asset = Buffer.from("synthetic immutable OTA content");
const sha256 = crypto.createHash("sha256").update(asset).digest("hex");
const immutableFile = `${sha256}.hbc`;
fs.mkdirSync(path.join(root,"assets"));
fs.writeFileSync(path.join(root,"assets",immutableFile),asset);
const publicCdnBase = "https://cdn.test/ota/preview/test-bucket/runtime/ios/assets/";
const url = new URL(immutableFile,publicCdnBase).href;
const inventory = [{ immutableFile, sha256, contentType:"application/javascript", sizeBytes:asset.length }];
const manifest = { launchAsset:{url}, assets:[] };
const options = { directory:root, manifest, inventory, publicCdnBase,
  environment:"preview", prefix:"ota/preview/test-bucket/runtime/ios/assets" };
after(() => fs.rmSync(root,{recursive:true,force:true}));

test("preview S3 upload plan verifies exact manifest/CDN bytes", () => {
  const plan=checkOtaUploadPlan(options);
  assert.equal(plan.length,1);
  assert.equal(plan[0].sha256,sha256);
  assert.equal(plan[0].key,`ota/preview/test-bucket/runtime/ios/assets/${immutableFile}`);
});
test("rejects hidden production upload, malicious prefix, CDN mismatch and changed asset", () => {
  assert.throws(() => checkOtaUploadPlan({...options, environment:"production"}),/INVALID_OTA_S3_PREFIX/);
  assert.throws(() => checkOtaUploadPlan({...options, prefix:"../../sensitive"}),/INVALID_OTA_S3_PREFIX/);
  assert.throws(() => checkOtaUploadPlan({...options,publicCdnBase:"http://cdn.test/"}),/INVALID_OTA_CDN_BASE/);
  assert.throws(() => checkOtaUploadPlan({...options,manifest:{launchAsset:{url:"https://evil.test/file"},assets:[]}}),/OTA_MANIFEST_CDN_ASSET_MISMATCH/);
  assert.throws(() => checkOtaUploadPlan({...options,inventory:[{...inventory[0],sha256:"0".repeat(64)}]}),/OTA_ASSET_HASH_MISMATCH/);
});
test("upload is conditional and verifies S3 HEAD, GET, then CDN GET before evidence", async () => {
  const actions=[];
  const client = { send: async (command) => {
    actions.push(command.constructor.name);
    if (command instanceof PutObjectCommand) {
      assert.equal(command.input.IfNoneMatch,"*");
      assert.equal(command.input.CacheControl,"public, max-age=31536000, immutable");
      return {};
    }
    if (command instanceof HeadObjectCommand)
      return {ContentLength:asset.length,ContentType:"application/javascript",Metadata:{sha256}};
    if (command instanceof GetObjectCommand)
      return {Body:{transformToByteArray:async()=>new Uint8Array(asset)}};
    throw Error("unexpected command");
  }};
  const request = async (uri,opts) => {
    assert.equal(uri,url);assert.equal(opts.method,"GET");
    return {ok:true,headers:new Headers({"content-type":"application/javascript"}),
      arrayBuffer:async()=>new Uint8Array(asset).buffer};
  };
  const report = await uploadImmutableOtaAssets({client,bucket:"test-bucket",targets:checkOtaUploadPlan(options),request});
  assert.deepEqual(actions,["PutObjectCommand","HeadObjectCommand","GetObjectCommand"]);
  assert.equal(report[0].cdnVerified,true);
});
test("rejected CDN corrupt bytes cannot be reported as verified", async () => {
  const client = {send:async(command)=>{
    if (command instanceof HeadObjectCommand) return {ContentLength:asset.length,ContentType:"application/javascript",Metadata:{sha256}};
    if (command instanceof GetObjectCommand) return {Body:{transformToByteArray:async()=>new Uint8Array(asset)}};
    return {};
  }};
  const request = async () => ({ok:true,headers:new Headers({"content-type":"application/javascript"}),
    arrayBuffer:async()=>new TextEncoder().encode("tampered").buffer});
  await assert.rejects(uploadImmutableOtaAssets({client,bucket:"test-bucket",targets:checkOtaUploadPlan(options),request}), /CDN_ASSET_READBACK_MISMATCH/);
});

test("direct Cloud.ru S3 origin must match the exact bucket and immutable prefix", () => {
  const bucket="gafus-ota-updates";
  const prefix="ota/preview/gafus/1.7.6/ios/assets";
  const valid=`https://global.s3.cloud.ru/${bucket}/${prefix}/`;
  assert.doesNotThrow(() => assertDirectCloudRuAssetOrigin({bucket,prefix,publicAssetBase:valid}));
  for (const invalid of [
    `https://cdn.example/${bucket}/${prefix}/`,
    `https://s3.cloud.ru/${bucket}/${prefix}/`,
    `http://global.s3.cloud.ru/${bucket}/${prefix}/`,
    `https://global.s3.cloud.ru/another-bucket/${prefix}/`,
    valid+"?public=true",
    valid.replace("/ios/", "/android/"),
  ]) assert.throws(() => assertDirectCloudRuAssetOrigin({bucket,prefix,publicAssetBase:invalid}),
    /OTA_PUBLIC_S3_ORIGIN_BUCKET_MISMATCH/);
});

test("real OTA publication rejects non-Cloud.ru endpoints, different buckets, and regions",()=>{
  const valid={endpoint:"https://s3.cloud.ru",region:"ru-central-1",bucket:"gafus-ota-updates"};
  assert.doesNotThrow(()=>assertCloudRuOtaPublisherConfig(valid));
  assert.doesNotThrow(()=>assertCloudRuOtaPublisherConfig({...valid,endpoint:valid.endpoint+"/"}));
  for(const changed of [
    {endpoint:"https://evil.example.com"},
    {endpoint:"https://s3.cloud.ru.evil.example.com"},
    {endpoint:"https://s3.cloud.ru/evil"},
    {endpoint:"https://user:password@s3.cloud.ru"},
    {region:"us-east-1"},
    {bucket:"gafus-gallery-private"},
  ]) assert.throws(()=>assertCloudRuOtaPublisherConfig({...valid,...changed}),
    /UNTRUSTED_OTA_CLOUD_RU_CONFIGURATION/);
});
