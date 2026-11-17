/** End-to-end local ONLY: signed Expo export => fake S3 + CDN => real isolated PG => Hono. */
import { randomUUID, generateKeyPairSync, createHash, verify, constants } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {prisma} from "@gafus/prisma";
import {buildSignedOtaArtifact,verifyAndWriteLocalPreview} from "../../../apps/mobile/scripts/self-hosted-ota-artifact.mjs";
import {checkOtaUploadPlan,uploadImmutableOtaAssets} from "../../../packages/cdn-upload/scripts/upload-mobile-ota-assets.mjs";
import {registerVerifiedOtaCiResult} from "../src/ci-registration";
import {createMobileOtaDeployment,updateMobileOtaDeployment} from "../src/deployment-commands";
import {installationInOtaCohort} from "../src/rollout-policy";
import {mobileOtaManifestRepository} from "../src/repository";
import {createOtaManifestRoutes} from "../../../apps/api/src/modules/mobile-ota/manifest-protocol";

const enabled=!!process.env.GAFUS_OTA_TEST_PG_URL &&
  process.env.DATABASE_URL===process.env.GAFUS_OTA_TEST_PG_URL;
const suite=enabled?describe:describe.skip;
const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-local-ota-e2e-"));
const sourceDir=path.join(root,"expo-export");
const artifactDir=path.join(root,"signed");
const nativeId=randomUUID(),updateId=randomUUID(),operationId=`preview-qa-${randomUUID()}`;
const runtime="1.7.5",sourceSha="a".repeat(40),fingerprint="b".repeat(64);
const keyId="preview-qa-e2e",appId="gafus";
const cdnOrigin="https://cdn.test";
const prefix=`ota/preview/gafus/${runtime}/ios/assets`;
const cdnBase=`${cdnOrigin}/${prefix}/`;
const privateFile=path.join(root,"key.pem"),certFile=path.join(root,"cert.pem");
const pair=generateKeyPairSync("rsa",{modulusLength:2048});
fs.writeFileSync(privateFile,pair.privateKey.export({type:"pkcs1",format:"pem"}),{mode:0o600});
execFileSync("openssl",["req","-new","-x509","-key",privateFile,"-out",certFile,
  "-days","1","-subj","/CN=gafus-local-e2e", "-addext", "extendedKeyUsage=codeSigning"],
  {stdio:"ignore"});
const certPem=fs.readFileSync(certFile,"utf8");
const privatePem=fs.readFileSync(privateFile,"utf8");
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const native={id:nativeId,appId,platform:"ios",environment:"preview",channel:"preview",
  distribution:"internal",bundleId:"ru.gafus.app",appVersion:runtime,buildNumber:"12345",
  runtimeVersion:runtime,signingKeyId:keyId,sourceSha,nativeFingerprint:fingerprint,
  certificateSha256:hash(Buffer.from(certPem)),verified:true,
  updateUrl:"https://preview.gafus.test/ota/manifest"};
const expoConfig={version:runtime,scheme:["gafus"],
  updates:{url:native.updateUrl},extra:{otaTransport:"self-hosted"}};
const metro={bundler:"metro",fileMetadata:{ios:{bundle:"bundle/index.ios.hbc",
  assets:[{path:"assets/splash.png",ext:"png"}]}}};
let releaseId:string|null=null;
let deploymentId:string|null=null;
let rowVersion=1;
let prepared:ReturnType<typeof buildSignedOtaArtifact>;
let delivery:Awaited<ReturnType<typeof uploadImmutableOtaAssets>>;
const store=new Map<string,{body:Uint8Array,mime:string,metadata:{sha256:string}}>();
function mockS3() {
  return {send:async(command:{constructor:{name:string};input:{Key:string;Body?:Uint8Array;
    ContentType?:string;Metadata?:{sha256:string};IfNoneMatch?:string}})=>{
      const {Key:key}=command.input;
      switch(command.constructor.name){
        case "PutObjectCommand": {
          if(store.has(key)) throw new Error("MOCK_IMMUTABLE_WRITE_REFUSED");
          if(command.input.IfNoneMatch!=="*") throw new Error("MOCK_UNSAFE_OVERWRITE");
          store.set(key,{body:Buffer.from(command.input.Body!),
            mime:command.input.ContentType!,metadata:command.input.Metadata!});
          return {};
        }
        case "HeadObjectCommand": {
          const entry=store.get(key);if(!entry)throw Error("missing S3 object");
          return {ContentLength:entry.body.length,ContentType:entry.mime,Metadata:entry.metadata};
        }
        case "GetObjectCommand": {
          const entry=store.get(key);if(!entry)throw Error("missing S3 object");
          return {Body:{transformToByteArray:async()=>entry.body}};
        }
        default:throw Error("Unexpected S3 operation");
      }
    }};
}
function mockCdn(url:string){
  const key=new URL(url).pathname.replace(/^\//,"");
  const entry=store.get(key);
  if(!entry) return {ok:false,headers:new Headers(),arrayBuffer:async()=>new Uint8Array().buffer};
  return {ok:true,headers:new Headers({"content-type":entry.mime}),
    arrayBuffer:async()=>new Uint8Array(entry.body).buffer};
}
const header=(installationId?:string)=>({
  "expo-protocol-version":"1","expo-platform":"ios",
  "expo-runtime-version":runtime,"expo-channel-name":"preview",
  "x-gafus-native-fingerprint":fingerprint,
  "expo-expect-signature":`sig, keyid="${keyId}", alg="rsa-v1_5-sha256"`,
  "accept":"application/expo+json, multipart/mixed",
  ...(installationId?{"expo-extra-params":`gafus-installation-id="${installationId}"`}:{})
});
const app=createOtaManifestRoutes(mobileOtaManifestRepository,{appId,environment:"preview"});
async function request(id?:string){return app.request("http://localhost/manifest",{headers:header(id)});}
suite("fully signed OTA preview delivery on isolated PostgreSQL and mocked Cloud.ru/Beget",()=>{
  beforeAll(async()=>{
    fs.mkdirSync(path.join(sourceDir,"bundle"),{recursive:true});
    fs.mkdirSync(path.join(sourceDir,"assets"),{recursive:true});
    fs.writeFileSync(path.join(sourceDir,"bundle/index.ios.hbc"),"synthetic Hermes release bytecode".repeat(200));
    fs.writeFileSync(path.join(sourceDir,"assets/splash.png"),Buffer.from("PNG synthetic image data"));
    prepared=buildSignedOtaArtifact({exportRoot:sourceDir,metadata:metro,publicExpoConfig:expoConfig,
      native,platform:"ios",environment:"preview",channel:"preview",runtimeVersion:runtime,
      sourceSha,signingKeyId:keyId,publicCdnBase:cdnBase,updateId,
      createdAt:"2026-11-12T21:00:00.000Z",revision:1,privateKeyPem:privatePem,
      certificatePem:certPem,nativeFingerprint:fingerprint});
    verifyAndWriteLocalPreview({artifact:prepared,exportRoot:sourceDir,outputDir:artifactDir});
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
        (id,"appId",platform,environment,distribution,"bundleId","appVersion","buildNumber",
         "runtimeVersion",channel,"updateUrl","signingKeyId","certificateSha256","certificatePem",
         "nativeFingerprint","sourceSha",verified)
      VALUES (${nativeId}::uuid,${appId},'ios','preview','internal','ru.gafus.app',
        ${runtime},${native.buildNumber},${runtime},'preview',${native.updateUrl},
        ${keyId},${native.certificateSha256},${certPem},${fingerprint},${sourceSha},true)
    `;
  });
  afterAll(async()=>{
    if(deploymentId){
      await prisma.$executeRaw`DELETE FROM "MobileOtaAuditEvent" WHERE "deploymentId"=${deploymentId}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileOtaDeployment" WHERE id=${deploymentId}::uuid`;
    }
    if(releaseId){
      await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId"=${releaseId}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE id=${releaseId}::uuid`;
    }
    await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid`;
    fs.rmSync(root,{recursive:true,force:true});
  });
  it("refuses delivery before upload, CI approval and explicit admin publication",async()=>{
    expect((await request()).status).toBe(204);
    const candidates=checkOtaUploadPlan({directory:artifactDir,manifest:prepared.manifest,
      inventory:prepared.inventory,prefix,publicCdnBase:cdnBase,environment:"preview"});
    expect(candidates).toHaveLength(2);
    delivery=await uploadImmutableOtaAssets({client:mockS3() as never,bucket:"preview-test-bucket",
      targets:candidates,request:mockCdn as never});
    expect(delivery).toHaveLength(2);
    expect(delivery.every(item=>item.s3Verified && item.cdnVerified)).toBe(true);
    expect((await request()).status).toBe(204);
  });
  it("registers exact signed bytes and verified CDN receipts but remains unpublished",async()=>{
    const candidate={operationId,nativeReleaseId:nativeId,updateId,sourceSha,revision:1,
      buildAttempt:1,ciRunId:"local-preview-e2e-0001",manifestBase64:prepared.manifestBytes.toString("base64"),
      signatureHeader:prepared.signatureHeader,
      artifacts:prepared.inventory.map(item=>({key:item.immutableFile,
        immutableUrl:`${cdnBase}${item.immutableFile}`,sha256:item.sha256,
        mimeType:item.contentType,sizeBytes:item.sizeBytes,s3Verified:true,cdnVerified:true})),
      checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,iosPaymentGraph:true,privateSymbols:true},
      symbolsRef:"symbols-s3:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",};
    const result=await registerVerifiedOtaCiResult(candidate,"https://cdn.test");
    releaseId=result.releaseId;
    expect(result.replayed).toBe(false);
    expect((await registerVerifiedOtaCiResult({...candidate,buildAttempt:2},"https://cdn.test")).replayed).toBe(true);
    expect((await request()).status).toBe(204);
  });
  it("creates paused channel, publishes 1% and returns exact RSA-signed bytes only to selected installations",async()=>{
    const deployment=await createMobileOtaDeployment({nativeReleaseId:nativeId,actorId:"local-e2e-admin",
      operationId:`create-${randomUUID()}`,reason:"Verified synthetic preview release end to end"});
    deploymentId=deployment.id;
    expect(deployment.paused).toBe(true);
    expect((await request()).status).toBe(204);
    const published=await updateMobileOtaDeployment({deploymentId,actorId:"local-e2e-admin",
      operationId:`publish-${randomUUID()}`,expectedVersion:rowVersion,releaseId:releaseId!,
      reason:"Signed synthetic update checked end to end",action:"PUBLISH",rolloutPercent:1});
    rowVersion=published.version;
    const ids=Array.from({length:5000},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,"0")}`);
    const included=ids.find(id=>installationInOtaCohort(deploymentId!,id,1));
    const excluded=ids.find(id=>!installationInOtaCohort(deploymentId!,id,50));
    expect(included).toBeDefined();expect(excluded).toBeDefined();
    const yes=await request(included);
    expect(yes.status).toBe(200);
    expect(Buffer.from(await yes.arrayBuffer())).toEqual(prepared.manifestBytes);
    const sig=Buffer.from((yes.headers.get("expo-signature")||"").match(/sig="([^"]+)"/)?.[1]||"","base64");
    expect(verify("RSA-SHA256",prepared.manifestBytes,{
      key:certPem,padding:constants.RSA_PKCS1_PADDING},sig)).toBe(true);
    expect((await request(excluded)).status).toBe(204);
    expect((await request()).status).toBe(204);
  });
  it("expands rollout to 100%, then pauses without deleting release or assets",async()=>{
    const expanded=await updateMobileOtaDeployment({deploymentId:deploymentId!,actorId:"local-e2e-admin",
      operationId:`expand-${randomUUID()}`,expectedVersion:rowVersion,reason:"Continue successful synthetic test",
      action:"ROLLOUT",rolloutPercent:100});
    rowVersion=expanded.version;
    expect((await request()).status).toBe(200);
    expect((await request(randomUUID())).status).toBe(200);
    const stopped=await updateMobileOtaDeployment({deploymentId:deploymentId!,actorId:"local-e2e-admin",
      operationId:`pause-${randomUUID()}`,expectedVersion:rowVersion,reason:"Emergency stop simulated after QA",
      action:"PAUSE"});
    rowVersion=stopped.version;
    expect((await request()).status).toBe(204);
    expect(store.size).toBe(2);
  });
});
