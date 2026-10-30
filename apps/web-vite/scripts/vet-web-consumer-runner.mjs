#!/usr/bin/env node
/** AG2-WEB-VET-029-001 — EXISTING Web adapter through AG4-owned in-process
 * synthetic cookie-auth transport. No listening TCP, JWT/cookie forwarding,
 * provider calls, database import or real medical records in this module.
 * CLI --preflight denies absent/expired/current-SHA-mismatched AG4 grant
 * BEFORE importing any transport. CLI --real additionally requires a pinned
 * AG4-owned bridge that resolves sessions INSIDE its own approved process.
 */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {resolve,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const GRANT="apps/admin-panel/AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json";
const forbidden=()=>{throw Error("AG2_WEB_VET_GATED_DENIED");};
const requireOk=value=>{if(!value)forbidden();};
const safeId=/^[A-Za-z0-9_-]{1,128}$/;
const safe=(value)=>typeof value==="string"&&safeId.test(value);
export const BATCH="AG2-WEB-VET-029-001";
export const WEB_VET_SOURCE_PINS=[
 "apps/web-vite/scripts/vet-web-consumer-runner.mjs",
 "apps/web-vite/src/features/pets/vetVisitsHonoReadConsumer.ts",
 "apps/web-vite/src/features/pets/vetVisitsSourceMock.ts",
 "apps/web-vite/src/features/pets/petApi.ts",
 "apps/web-vite/src/shared/api/client.ts",
 "apps/web-vite/src/features/pets/PetVetVisits.tsx",
 "apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx",
 "apps/api/src/app.ts",
 "apps/api/src/routes/v1/pet-vet-visits.ts",
 "apps/api/src/middleware/auth.ts",
 "apps/api/src/middleware/rate-limit.ts",
 "packages/core/src/services/pets/petVetVisitHttp.ts",
 "packages/core/src/services/pets/petVetVisitService.ts",
 "packages/core/src/services/pets/g1VetVisitDetailRead.review.ts",
 "packages/prisma/schema.prisma",
 "apps/api/g1-vet-visit-detail-review-v1/ag1-vet-readonly-packaged-runner.mjs",
];
export const ALLOWED=[
 "GET /api/v1/pets/:petId",
 "GET /api/v1/pets/:petId/vet-visits",
 "GET /api/v1/pets/:petId/vet-visits/:visitId",
];
export function owned(path){
 requireOk(typeof path==="string"&&/^(apps|packages)\//.test(path)&&
  !path.startsWith("/")&&!path.includes("\\")&&
  path.split("/").every(x=>x&&x!=="."&&x!==".."));
 const full=resolve(ROOT,path);requireOk(full.startsWith(ROOT+sep));
 let part=ROOT;
 for(const name of path.split("/")){
  part=resolve(part,name);
  requireOk(!lstatSync(part).isSymbolicLink());
 }
 requireOk(realpathSync(full)===full);
 return full;
}
export const digest=path=>createHash("sha256")
 .update(readFileSync(owned(path))).digest("hex");
export function fixtureVet(f){
 requireOk(f&&typeof f==="object"&&!Array.isArray(f)&&
  f.syntheticMedicalOnly===true&&f.disposeAfterRun===true);
 const fields=["ownerA","ownerB","petA","petB","emptyA","visitA","visitB",
  "missingVisit"];
 const vals=fields.map(key=>f[key]);
 requireOk(vals.every(x=>safe(x)&&x.startsWith("ag2vet_"))&&
  new Set(vals).size===vals.length);
 requireOk(f.ownerA!==f.ownerB&&f.petA!==f.petB&&f.visitA!==f.visitB);
 return f;
}
export function validateVetWebGrant(g,now=Date.now()){
 requireOk(realpathSync(ROOT)===ROOT);
 requireOk(execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],
  {encoding:"utf8"}).trim()===ROOT&&
  execFileSync("git",["-C",ROOT,"branch","--show-current"],
   {encoding:"utf8"}).trim()==="vite");
 requireOk(g?.kind==="AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_V1"&&
  g.state==="ACTIVE_AG2_EXCLUSIVE"&&g.owner==="AG2"&&g.issuer==="AG4"&&
  g.repo===ROOT&&g.branch==="vite"&&g.batch===BATCH&&
  g.exclusiveLeaseConfirmed===true&&g.syntheticFixtureConfirmed===true&&
  g.ag1Ag4CurrentSourceDriftReviewed===true&&
  g.readOnlyPgRoleConfirmed===true&&g.readOnlySqlBeforeAfterPlanAccepted===true&&
  g.webCookieToHonoAuthVerifiedByAG4===true&&
  g.rateLimiterReadSideEffectIsolationApproved===true&&
  g.noExternalCredentialTransfer===true&&
  g.inProcessAuthTransportKind==="AG4_APPROVED_WEB_COOKIE_SESSION_INPROCESS"&&
  g.noTcpListener===true&&g.noProviderCalls===true);
 const expires=Date.parse(g.expiresUTC);
 requireOk(Number.isFinite(expires)&&expires>now+10_000&&expires<=now+900_000);
 requireOk(Array.isArray(g.operations)&&g.operations.length===ALLOWED.length&&
  ALLOWED.every(x=>g.operations.includes(x)));
 requireOk(typeof g.databaseName==="string"&&
  /^gafus_ag2_vet_[a-z0-9_]{1,40}$/.test(g.databaseName)&&
  typeof g.readOnlyPgRole==="string"&&
  /^ag2_vet_ro_[a-z0-9_]{1,40}$/.test(g.readOnlyPgRole));
 fixtureVet(g.fixture);
 requireOk(g.pins&&Object.keys(g.pins).length===WEB_VET_SOURCE_PINS.length&&
  WEB_VET_SOURCE_PINS.every(p=>g.pins[p]===digest(p)));
 const producer="apps/admin-panel/AG4_VET_AG1_PACKAGED_HONO10_REALPG_READY_AND_STRUCTURED56_ACCEPTANCE_20261018.v1.json";
 requireOk(g.historicProducerReceipt===producer&&
  g.historicProducerSHA256===digest(producer));
 const historic=JSON.parse(readFileSync(owned(producer),"utf8"));
 requireOk(historic.state==="READY_SOURCE_PACKAGED_INPROCESS_GET10_NOT_NETWORK_LISTENER"&&
  historic.actualGetCases===10&&historic.beforeAfterSQLByteIdentical===true);
 requireOk(typeof g.bridgeModule==="string"&&
  /^apps\/admin-panel\/[A-Za-z0-9_./-]+\.mjs$/.test(g.bridgeModule)&&
  g.bridgeSHA256===digest(g.bridgeModule)&&
  g.bridgeModule!==WEB_VET_SOURCE_PINS[0]);
 return {expires,fixture:g.fixture,bridgeModule:g.bridgeModule,
  leaseCheck:()=>Date.now()+1000<expires};
}
const responseStatus=async(response,status)=>{
 requireOk(response&&response.status===status&&response.headers&&
  /(^|,)\s*(private\s*,\s*)?no-store/.test(
   String(response.headers.get("cache-control")??""))&&
  String(response.headers.get("x-content-type-options")??"")
   .toLowerCase()==="nosniff"&&
  !response.headers.has("location"));
};
const privateData=record=>record&&typeof record==="object"&&
 Array.isArray(record.attachments)&&record.attachments.every(x=>
  x&&typeof x==="object"&&
  !["originalKey","previewKey","signedUrl","url","ownerId"].some(key=>
   Object.prototype.hasOwnProperty.call(x,key)));
export async function loadActualVetWebAdapter(){
 const {createServer}=await import("vite");
 const server=await createServer({
  root:resolve(ROOT,"apps/web-vite"),configFile:false,logLevel:"silent",
  server:{middlewareMode:true,hmr:false},
 });
 try{
  const vet=await server.ssrLoadModule(
   "/src/features/pets/vetVisitsHonoReadConsumer.ts");
  const pet=await server.ssrLoadModule("/src/features/pets/petApi.ts");
  requireOk(typeof vet.sourceOnlyHonoVetListRead==="function"&&
   typeof vet.sourceOnlyHonoVetDetailRead==="function"&&
   typeof pet.getMyPet==="function");
  return {vet,pet,close:()=>server.close()};
 }catch{await server.close();forbidden();}
}
/** ONLY called from AG4 scope after preflight, or from isolated synthetic
 * node:test with a same-process fake. The transport accepts symbolic owner
 * A/B/none; JWT/cookie bytes never enter this runner or its stdout.
 */
export async function exerciseVetWebConsumer({
 fixture,webFetch,adapter,leaseCheck,
}){
 fixtureVet(fixture);
 requireOk(typeof webFetch==="function"&&adapter?.vet&&adapter?.pet&&
  typeof leaseCheck==="function"&&leaseCheck());
 const original=globalThis.fetch;
 requireOk(typeof original==="function");
 let context="none",count=0;
 const allowedRequest=(path,init)=>{
  requireOk(leaseCheck()&&typeof path==="string"&&
   /^\/api\/v1\/pets\/[A-Za-z0-9_-]{1,128}(?:\/vet-visits(?:\/[A-Za-z0-9_-]{1,128})?)?$/.test(path)&&
   init?.method==="GET"&&init.cache==="no-store"&&
   init.credentials==="include"&&
   typeof init.headers==="object"&&
   init.headers.Accept==="application/json"&&
   !Object.keys(init.headers).some(key=>
    ["authorization","cookie"].includes(key.toLowerCase()))&&
   !init.body);
  const isVet=path.includes("/vet-visits");
  requireOk(isVet?init.headers["X-Gafus-Auth-Transport"]==="cookie":
   !init.headers["X-Gafus-Auth-Transport"]);
 };
 const intercepted=async(path,init)=>{
  allowedRequest(path,init);
  requireOk(["A","B","none","rateLimited"].includes(context));
  const response=await webFetch({actor:context,path,init});
  count++;
  requireOk(response&&Number.isInteger(response.status));
  // Both successful and errors MUST stay private (incl 401/404/429).
  await responseStatus(response,response.status);
  return response;
 };
 const observed=[];
 const run=async(name,actor,action,expectedStatus,check)=>{
  requireOk(leaseCheck());
  context=actor;
  const previous=count;
  let value;
  let error;
  try{value=await action();}
  catch(e){error=e;}
  if(expectedStatus===200){
   requireOk(!error&&value!==undefined);
   requireOk(check(value));
  }else{
   requireOk(error&&error.status===expectedStatus&&
    (expectedStatus!==404||error.code==="VET_VISIT_NOT_FOUND"||
      error.code==="PET_NOT_FOUND"||error.code===undefined));
   requireOk(check?check(error):true);
  }
  requireOk(count>previous);
  observed.push({case:name,status:expectedStatus,pass:true});
 };
 try{
  globalThis.fetch=intercepted;
  await run("W-VET-WEB-01-A-PET-GATE","A",()=>
   adapter.pet.getMyPet(fixture.petA),200,data=>data.id===fixture.petA);
  await run("W-VET-WEB-02-A-LIST","A",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.petA),200,
   rows=>Array.isArray(rows)&&rows.length===1&&
    rows[0].id===fixture.visitA&&rows[0].petId===fixture.petA&&
    privateData(rows[0]));
  await run("W-VET-WEB-03-A-EMPTY","A",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.emptyA),200,
   rows=>Array.isArray(rows)&&rows.length===0);
  await run("W-VET-WEB-04-A-DETAIL","A",()=>
   adapter.vet.sourceOnlyHonoVetDetailRead(fixture.petA,fixture.visitA),200,
   row=>row.id===fixture.visitA&&row.petId===fixture.petA&&
    typeof row.diagnosis==="string"&&row.diagnosis.startsWith("SYNTHETIC_")&&
    privateData(row));
  await run("W-VET-WEB-05-B-FOREIGN-LIST","B",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.petA),404);
  await run("W-VET-WEB-06-A-FOREIGN-DETAIL","A",()=>
   adapter.vet.sourceOnlyHonoVetDetailRead(fixture.petA,fixture.visitB),404);
  await run("W-VET-WEB-07-A-MISSING-DETAIL","A",()=>
   adapter.vet.sourceOnlyHonoVetDetailRead(fixture.petA,fixture.missingVisit),404);
  await run("W-VET-WEB-08-NO-SESSION","none",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.petA),401);
  await run("W-VET-WEB-09-B-LIST","B",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.petB),200,
   rows=>Array.isArray(rows)&&rows.length===1&&
    rows[0].petId===fixture.petB&&rows[0].id===fixture.visitB&&
    privateData(rows[0]));
  await run("W-VET-WEB-10-A-FOREIGN-PET-GATE","A",()=>
   adapter.pet.getMyPet(fixture.petB),404);
  await run("W-VET-WEB-11-RATE-LIMIT-PRIVATE","rateLimited",()=>
   adapter.vet.sourceOnlyHonoVetListRead(fixture.petA),429);
  // Invalid route rejected by the actual Web adapter BEFORE transport.
  context="A";const before=count;
  try{
   await adapter.vet.sourceOnlyHonoVetDetailRead(fixture.petA,"bad%2Fid");
   forbidden();
  }catch(e){
   requireOk(e.status===404&&e.code==="VET_VISIT_NOT_FOUND");
  }
  requireOk(before===count);
  observed.push({case:"W-VET-WEB-12-INVALID-ID-LOCAL",status:404,pass:true});
  return {kind:"AG2_WEB_VET_SOURCE_ADAPTER_INPROCESS_READ12_V1",
   cases:observed,checksCount:12,adapterGetCount:count,
   methods:["GET"],writes:0,externalCredentialTransfer:false,
   privateNoStoreVerified:true,pass:true};
 }finally{globalThis.fetch=original;}
}
async function runReal(){
 const grant=JSON.parse(readFileSync(owned(GRANT),"utf8"));
 const verified=validateVetWebGrant(grant);
 requireOk(verified.leaseCheck());
 // The AG4-owned bridge must be preinstalled, SHA pinned and scoped; it
 // creates Web-cookie owner context in process and never returns secrets.
 const bridge=await import(pathToFileURL(owned(verified.bridgeModule)).href);
 requireOk(typeof bridge.createVetWebReadTransport==="function");
 const transport=await bridge.createVetWebReadTransport({
  scope:BATCH,fixture:verified.fixture,leaseCheck:verified.leaseCheck,
 });
 requireOk(transport&&typeof transport.webFetch==="function"&&
  typeof transport.finalize==="function");
 let app;
 try{
  app=await loadActualVetWebAdapter();
  const result=await exerciseVetWebConsumer({
   fixture:verified.fixture,webFetch:transport.webFetch,
   adapter:app,leaseCheck:verified.leaseCheck,
  });
  await transport.finalize({accepted:true});return result;
 }catch{
  await transport.finalize({accepted:false});forbidden();
 }finally{await app?.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cmd=process.argv.slice(2);
 if(cmd.length!==1||!["--preflight","--real"].includes(cmd[0])){
  process.stderr.write("AG2_WEB_VET_NO_SCOPE_NO_NETWORK\n");
  process.exitCode=78;
 }else{
  try{
   if(cmd[0]==="--preflight"){
    const g=JSON.parse(readFileSync(owned(GRANT),"utf8"));
    validateVetWebGrant(g);
    console.log("AG2_WEB_VET_PREFLIGHT_PASS_NO_SQL_NO_HTTP");
   }else{
    const result=await runReal();
    // Only case names/status, no clinical fields, IDs, JWT/cookies, data.
    console.log(JSON.stringify(result));
   }
  }catch{
   process.stderr.write("AG2_WEB_VET_DENIED_NO_FALLBACK\n");
   process.exitCode=78;
  }
 }
}
