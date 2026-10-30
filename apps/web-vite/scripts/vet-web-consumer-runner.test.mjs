import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {
 ALLOWED,WEB_VET_SOURCE_PINS,fixtureVet,validateVetWebGrant,
 loadActualVetWebAdapter,exerciseVetWebConsumer,
} from "./vet-web-consumer-runner.mjs";
const fixture={
 ownerA:"ag2vet_owner_a_20261018",ownerB:"ag2vet_owner_b_20261018",
 petA:"ag2vet_pet_a_20261018",petB:"ag2vet_pet_b_20261018",
 emptyA:"ag2vet_empty_a_20261018",
 visitA:"ag2vet_visit_a_20261018",visitB:"ag2vet_visit_b_20261018",
 missingVisit:"ag2vet_visit_missing_20261018",
 syntheticMedicalOnly:true,disposeAfterRun:true,
};
const visit=(id,petId)=>({
 id,petId,visitedOn:"2026-10-18",specialty:"Терапевт",
 doctorName:"SYNTHETIC_DOCTOR",clinic:"SYNTHETIC_CLINIC",
 diagnosis:"SYNTHETIC_DIAGNOSIS",conclusion:"SYNTHETIC_CONCLUSION",
 notes:"SYNTHETIC_NOTES",attachments:[{
  id:"ag2vet_att_01",name:"synthetic.pdf",mimeType:"application/pdf",
  sizeBytes:1600,hasPreview:false,previewProcessing:false,
  originalKey:"SECRET_S3_ORIGINAL",signedUrl:"SECRET_CLOUD_URL",
 }],
});
const pet=id=>({id,name:"SYNTHETIC_PET",type:"DOG",breed:"Метис",
 showInProfile:false,notes:"PRIVATE_MEDICAL_RECORD",birthDate:null,
 weightKg:null,heightCm:null,neckGirthCm:null,muzzleGirthCm:null,
 bellyGirthCm:null,ownerId:"SECRET_OWNER"});
const res=(status,data,{noStore=true,nosniff=true}={})=>new Response(
 JSON.stringify(status<300?{success:true,data}:
  {success:false,error:"PRIVATE_DIAGNOSIS_RAW_ERROR",
   code:status===404?"VET_VISIT_NOT_FOUND":"AUTH_DENIED"}),
 {status,headers:{
  ...(noStore?{"Cache-Control":"private, no-store, max-age=0"}:{}),
  ...(nosniff?{"X-Content-Type-Options":"nosniff"}:{}),
  "Content-Type":"application/json",
 }});
const MOCK_ONLY="SYNTHETIC_TEST_TRANSPORT_NOT_REAL";
function fake(overrides={}){
 const requests=[];
 const webFetch=async({actor,path,init})=>{
  assert.equal(init.method,"GET");
  assert.equal(init.credentials,"include");
  assert.equal(init.cache,"no-store");
  assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.headers.Cookie,undefined);
  requests.push({actor,path});
  if(overrides.noStoreAt===requests.length)
   return requests.length===5?res(404,null,{noStore:false}):
    res(200,[visit(fixture.visitA,fixture.petA)],{noStore:false});
  if(overrides.wrongPetAt===requests.length)
   return res(200,pet(fixture.petB));
  if(overrides.wrongOwnerAt===requests.length)
   return res(200,[visit(fixture.visitB,fixture.petB)]);
  if(overrides.expiredAt===requests.length)
   return res(503,null);
  if(actor==="none")return res(401,null);
  if(actor==="rateLimited")return res(429,null);
  if(path===`/api/v1/pets/${fixture.petA}`&&actor==="A")
   return res(200,pet(fixture.petA));
  if(path===`/api/v1/pets/${fixture.petB}`&&actor==="A")
   return res(404,null);
  if(path===`/api/v1/pets/${fixture.petA}/vet-visits`)
   return actor==="A"?res(200,[visit(fixture.visitA,fixture.petA)]):
    res(404,null);
  if(path===`/api/v1/pets/${fixture.emptyA}/vet-visits`)
   return actor==="A"?res(200,[]):res(404,null);
  if(path===`/api/v1/pets/${fixture.petA}/vet-visits/${fixture.visitA}`)
   return actor==="A"?res(200,visit(fixture.visitA,fixture.petA)):
    res(404,null);
  if(path===`/api/v1/pets/${fixture.petA}/vet-visits/${fixture.visitB}`||
    path===`/api/v1/pets/${fixture.petA}/vet-visits/${fixture.missingVisit}`)
   return res(404,null);
  if(path===`/api/v1/pets/${fixture.petB}/vet-visits`)
   return actor==="B"?res(200,[visit(fixture.visitB,fixture.petB)]):
    res(404,null);
  throw Error("TEST_UNAUTHORIZED_ROUTE");
 };
 return {webFetch,requests,tag:MOCK_ONLY};
}
async function withAdapter(task){
 const adapter=await loadActualVetWebAdapter();
 try{return await task(adapter);}finally{await adapter.close();}
}
test("VET-WEB-R01 12 cases exercise ACTUAL imported Web GET adapter without secrets",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake();let checked=0;
  const result=await exerciseVetWebConsumer({
   fixture,adapter,webFetch:mock.webFetch,
   leaseCheck:()=>{checked++;return true;},
  });
  assert.equal(result.pass,true);
  assert.equal(result.checksCount,12);
  assert.equal(result.adapterGetCount,11);
  assert.equal(result.writes,0);
  assert.equal(mock.requests.length,11);
  assert.ok(checked>=12);
  assert.deepEqual(mock.requests.map(x=>x.actor),
   ["A","A","A","A","B","A","A","none","B","A","rateLimited"]);
  assert.deepEqual(result.cases.map(x=>x.status),
   [200,200,200,200,404,404,404,401,200,404,429,404]);
  assert.doesNotMatch(JSON.stringify(result),/ag2vet_|PRIVATE_|SECRET_|SYNTHETIC_|Cookie|JWT|Bearer|diagnosis/i);
 });
});
test("VET-WEB-R02 no injected live scope -> no read, no global fetch modification",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake();const original=globalThis.fetch;
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>false,
  }));
  assert.equal(mock.requests.length,0);
  assert.equal(globalThis.fetch,original);
 });
});
test("VET-WEB-R03 200 foreign DTO cannot masquerade as 404 or own history",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake({wrongOwnerAt:2});
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>true,
  }));
  assert.equal(mock.requests.length,2);
 });
});
test("VET-WEB-R04 200 or 404 without private no-store MUST fail closed",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake({noStoreAt:2});
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>true,
  }));
  assert.equal(mock.requests.length,2);
 });
});
test("VET-WEB-R05 503 UNKNOWN not 200[] and never retry",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake({expiredAt:2});
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>true,
  }));
  assert.equal(mock.requests.length,2);
 });
});
test("VET-WEB-R09 owner pet 200 mismatched ID fails before any Vet list",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake({wrongPetAt:1});
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>true,
  }));
  assert.equal(mock.requests.length,1);
 });
});
test("VET-WEB-R10 404 without private no-store fails, even though status is expected",async()=>{
 await withAdapter(async adapter=>{
  const mock=fake({noStoreAt:5});
  await assert.rejects(exerciseVetWebConsumer({
   fixture,webFetch:mock.webFetch,adapter,leaseCheck:()=>true,
  }));
  assert.equal(mock.requests.length,5);
 });
});
test("VET-WEB-R06 malformed fixture, actor reuse, non-synthetic data fail",()=>{
 assert.equal(fixtureVet(fixture),fixture);
 assert.throws(()=>fixtureVet({...fixture,syntheticMedicalOnly:false}));
 assert.throws(()=>fixtureVet({...fixture,ownerB:fixture.ownerA}));
 assert.throws(()=>fixtureVet({...fixture,petA:"production_pet"}));
});
test("VET-WEB-R07 nonexistent AG4 signed grant, mismatched type, expiry fail BEFORE network",()=>{
 assert.equal(WEB_VET_SOURCE_PINS.length,16);
 assert.equal(ALLOWED.length,3);
 assert.throws(()=>validateVetWebGrant({
  kind:"AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE",
 }));
 assert.throws(()=>validateVetWebGrant({
  kind:"AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE",
  owner:"AG2",issuer:"AG4",repo:"/Users/asmtv1/Desktop/gafus-refactor",
  branch:"vite",batch:"AG2-WEB-VET-029-001",
  expiresUTC:"2000-01-01T00:00:00Z",
 }));
});
test("VET-WEB-R08 CLI preflight denies without grant and NEVER executes transport",()=>{
 const r=execFileSync("node",[
  "--input-type=module","-e",
  `import {spawnSync} from "node:child_process";
  const r=spawnSync(process.execPath,["apps/web-vite/scripts/vet-web-consumer-runner.mjs","--preflight"],{
   cwd:"/Users/asmtv1/Desktop/gafus-refactor",encoding:"utf8"});
  if(r.status!==78||!r.stderr.includes("AG2_WEB_VET_DENIED_NO_FALLBACK")||
    r.stdout)process.exit(1);`
 ],{encoding:"utf8",cwd:"/Users/asmtv1/Desktop/gafus-refactor"});
 assert.equal(r.trim(),"");
});
