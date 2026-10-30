/** G05 AG2 independent WEB-exclusive REAL resource admission.
 * No network calls. AG3 Mobile resource grant NEVER implies AG2 permission.
 * All docs and pins must be within the exact refactor project; fail closed.
 */
import {readFileSync,realpathSync,lstatSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,sep} from "node:path";
import {execFileSync} from "node:child_process";

export const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
export const AG1_V9_PATH=
  "apps/api/g1-g05-pet-create-source-v1/G05_NORMAL_PACKAGED_CORE_SHARED_PRISMA_REALPG16.contract.v9.json";
export const AG1_V9_SHA=
  "96aa4698ce1d1ea13b1066afdce9ebd3691bd4cc03f54294f16cd353b3078ab0";
export const SOURCE_PINS=[
  "apps/web-vite/src/features/pets/PetCreateS1Form.tsx",
  "apps/web-vite/src/features/pets/petCreateIntentS1.ts",
  "apps/web-vite/src/features/pets/petCreateS1.ts",
  "apps/web-vite/src/features/pets/petCreateS1HttpSubmit.ts",
  "apps/web-vite/src/features/pets/petCreateS1.mountedCookieTransport.test.tsx",
  "apps/web-vite/src/shared/api/client.ts",
  "apps/web-vite/src/features/pets/g05WebRealConsumerAdapter.ts",
  "apps/web-vite/src/features/pets/g05WebRealConsumerAdapter.integration.test.ts",
  "apps/web-vite/src/features/pets/g05WebRealConsumer.real.test.ts",
  "apps/web-vite/scripts/g05-web-gate.mjs",
  "apps/web-vite/scripts/g05-web-runner.mjs",
  AG1_V9_PATH,
];
export const CASES=["G05-WEB-R01","G05-WEB-R02","G05-WEB-R03",
  "G05-WEB-R04","G05-WEB-R05","G05-WEB-R06"];
const fail=()=>{throw Error("G05_WEB_GATE_DENIED");};
const isDate=(x)=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const validTime=(value,now)=>isDate(value)&&Date.parse(value)>now &&
  Date.parse(value)<=now+2*60*60*1000;
const matchJsonObject=(x)=>!!x&&typeof x==="object"&&!Array.isArray(x);
const localOrigin=(x)=>typeof x==="string"&&/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(x)&&
  Number(new URL(x).port)>=1024&&Number(new URL(x).port)<=65535;
const onePort=(x)=>Number.isInteger(x)&&x>=1024&&x<=65535;
export function insideProject(rel,requiredPrefix){
  if(typeof rel!=="string"||rel.startsWith("/")||rel.includes("\\")||
      !rel.startsWith(requiredPrefix)||rel.split("/").some(x=>!x||x==="."||x===".."))
    fail();
  const path=resolve(ROOT,rel);
  if(!path.startsWith(ROOT+sep))fail();
  // Do not follow any directory or file symlink, even if it resolves into root.
  let partial=ROOT;
  for(const part of rel.split("/")){
    partial=resolve(partial,part);
    if(lstatSync(partial).isSymbolicLink())fail();
  }
  if(realpathSync(path)!==path)fail();
  return path;
}
export function readScopedDoc(rel,prefix){
  const obj=JSON.parse(readFileSync(insideProject(rel,prefix),"utf8"));
  if(!matchJsonObject(obj))fail();
  return obj;
}
export function validateG05WebDocuments({grant,ag3,ag1,lease,fixture,sha,now=Date.now()}){
  if(grant.kind!=="AG4_G05_WEB_CONSUMER_GRANT_V1"||
    grant.state!=="GRANTED"||grant.owner!=="AG2"||
    grant.repo!==ROOT||grant.branch!=="vite"||
    grant.environment!=="ISOLATED_SYNTHETIC_ONLY"||
    typeof grant.grantId!=="string"||!grant.grantId.startsWith("AG4-G05-WEB-")||
    typeof grant.leaseId!=="string"||grant.leaseId.length<10||
    !validTime(grant.expiresUTC,now)||!isDate(grant.issuedUTC)||
    Date.parse(grant.issuedUTC)>now||
    !Array.isArray(grant.allowedCases)||
    !CASES.every(x=>grant.allowedCases.includes(x))||
    grant.operations?.join(",")!=="POST /api/v1/pets"||
    !matchJsonObject(grant.proofs)||!matchJsonObject(grant.sourcePins))fail();
  if(ag3.kind!=="AG3_G05_RESOURCE_DONE_V1"||ag3.state!=="DONE"||
    ag3.resourceReleased!==true||ag3.repo!==ROOT||
    ag3.branch!=="vite"||!isDate(ag3.doneUTC)||
    Date.parse(ag3.doneUTC)>now)fail();
  if(ag1.kind!=="AG1_G05_WEB_CONSUMER_READY_V1"||ag1.state!=="READY"||
    ag1.leaseId!==grant.leaseId||ag1.repo!==ROOT||
    ag1.branch!=="vite"||ag1.ag3DoneReceiptSha256!==grant.proofs.ag3Sha256||
    ag1.runtime!=="NORMAL_PACKAGED_CORE_SHARED_PRISMA_V9"||
    ag1.syntheticUsersOnly!==true||!validTime(ag1.expiresUTC,now)||
    !isDate(ag1.readyUTC)||Date.parse(ag1.readyUTC)>now||
    Date.parse(ag1.readyUTC)<Date.parse(ag3.doneUTC)||
    Date.parse(grant.issuedUTC)<Date.parse(ag1.readyUTC)||
    ag1.producerManifestSha256!==AG1_V9_SHA||
    grant.sourcePins[AG1_V9_PATH]!==AG1_V9_SHA)fail();
  if(lease.kind!=="AG4_G05_WEB_EXCLUSIVE_LEASE_V1"||
    lease.state!=="ACTIVE_AG2_EXCLUSIVE"||lease.owner!=="AG2"||
    lease.leaseId!==grant.leaseId||lease.repo!==ROOT||
    lease.branch!=="vite"||!validTime(lease.expiresUTC,now)||
    !onePort(lease.postgresPort)||!onePort(lease.redisPort)||
    !onePort(lease.honoPort)||!isDate(lease.activeUTC)||
    Date.parse(lease.activeUTC)<Date.parse(ag3.doneUTC)||
    Date.parse(lease.activeUTC)>now||
    lease.postgresHost!=="127.0.0.1"||lease.redisHost!=="127.0.0.1"||
    typeof lease.postgresDatabase!=="string"||
    !/^gafus_g05_[a-z0-9_]+$/.test(lease.postgresDatabase)||
    typeof lease.postgresUser!=="string"||
    !/^g05_[a-z0-9_]*synthetic$/.test(lease.postgresUser)||
    ag1.postgresDatabase!==lease.postgresDatabase||
    ag1.postgresUser!==lease.postgresUser||
    ag1.syntheticPgIdentityChecked!==true)fail();
  if(!localOrigin(grant.honoOrigin)||grant.honoOrigin!==ag1.honoOrigin||
    grant.honoOrigin!==lease.honoOrigin||
    Number(new URL(grant.honoOrigin).port)!==lease.honoPort||
    ag1.leaseId!==lease.leaseId||ag1.consumer!=="AG2_WEB")fail();
  if(fixture.kind!=="AG1_G05_WEB_SYNTHETIC_FIXTURE_V1"||
    fixture.state!=="READY"||fixture.leaseId!==grant.leaseId||
    fixture.repo!==ROOT||fixture.syntheticOnly!==true||
    !matchJsonObject(fixture.actors))fail();
  const actorA=fixture.actors.A,actorB=fixture.actors.B;
  const validActor=x=>matchJsonObject(x)&&
    typeof x.ownerId==="string"&&/^[a-f0-9-]{36}$/i.test(x.ownerId)&&
    typeof x.accessToken==="string"&&x.accessToken.split(".").length===3&&
    x.role==="USER"&&Number.isSafeInteger(x.authEpoch)&&x.authEpoch>=0&&
    typeof x.sessionScope==="string"&&x.sessionScope.length>=4;
  if(!validActor(actorA)||!validActor(actorB)||
    actorA.ownerId===actorB.ownerId||
    actorA.accessToken===actorB.accessToken)fail();
  if(!matchJsonObject(sha))fail();
  for(const name of SOURCE_PINS){
    if(!/^[a-f0-9]{64}$/.test(grant.sourcePins[name]??"")||
      grant.sourcePins[name]!==sha[name])fail();
  }
  if(grant.proofs.ag3Sha256!==sha["AG3"]||
    grant.proofs.ag1Sha256!==sha["AG1"]||
    grant.proofs.leaseSha256!==sha["LEASE"]||
    grant.proofs.fixtureSha256!==sha["FIXTURE"])fail();
  return Object.freeze({
    grantId:grant.grantId, leaseId:grant.leaseId,
    honoOrigin:grant.honoOrigin, actors:fixture.actors,
    allowedCases:Object.freeze([...grant.allowedCases]),
    expiresAt:Math.min(...[grant.expiresUTC,ag1.expiresUTC,lease.expiresUTC].map(Date.parse)),
  });
}
// Byte-identical relocated G05 receipt: accept only the exact retired contract path
// or its fixed new docs location. All hashes, authorization, time and isolation
// checks remain unchanged; never follow arbitrary user-supplied paths.
export function canonicalG05Ag3ReceiptPath(original){
  const oldPath=OLD_G05_AG3_RECEIPT;
  if(original===oldPath || original===NEW_G05_AG3_RECEIPT) return NEW_G05_AG3_RECEIPT;
  fail();
}
const OLD_G05_AG3_RECEIPT="apps/mobile/docs/refactor/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json";
const NEW_G05_AG3_RECEIPT="docs/archive/agents/receipts/mobile-g05/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json";

export function readG05WebGate(grantRelative){
  const gitRoot=execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim();
  const branch=execFileSync("git",["-C",ROOT,"branch","--show-current"],{encoding:"utf8"}).trim();
  if(gitRoot!==ROOT||realpathSync(ROOT)!==ROOT||branch!=="vite")fail();
  const grant=readScopedDoc(grantRelative,"apps/admin-panel/");
  const proofs=grant.proofs;
  if(!matchJsonObject(proofs))fail();
  const paths=[
    ["AG3",canonicalG05Ag3ReceiptPath(proofs.ag3Done),"docs/archive/agents/receipts/mobile-g05/"],
    ["AG1",proofs.ag1Ready,"apps/api/"],
    ["LEASE",proofs.lease,"apps/admin-panel/"],
    ["FIXTURE",proofs.fixture,"apps/api/"],
  ];
  const docs={},sha={};
  for(const [name,path,prefix] of paths){
    const file=insideProject(path,prefix);
    sha[name]=createHash("sha256").update(readFileSync(file)).digest("hex");
    docs[name]=readScopedDoc(path,prefix);
  }
  for(const path of SOURCE_PINS){
    sha[path]=createHash("sha256").update(readFileSync(
      insideProject(path,path.split("/").slice(0,2).join("/")+"/")
    )).digest("hex");
  }
  const ok=validateG05WebDocuments({
    grant,ag3:docs.AG3,ag1:docs.AG1,lease:docs.LEASE,fixture:docs.FIXTURE,sha,
  });
  // Do not expose raw tokens in logs: return sensitive data ONLY to gated tests.
  return ok;
}
