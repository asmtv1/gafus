import {test} from "node:test";
import assert from "node:assert/strict";
import {ROOT,SOURCE_PINS,CASES,AG1_V9_PATH,AG1_V9_SHA,validateG05WebDocuments} from "./g05-web-gate.mjs";

const now=Date.parse("2026-10-17T17:05:00.000Z");
function documents(){
 const sha=Object.fromEntries(SOURCE_PINS.map(x=>[x,"a".repeat(64)]));
 sha[AG1_V9_PATH]=AG1_V9_SHA;
 Object.assign(sha,{AG3:"b".repeat(64),AG1:"c".repeat(64),
   LEASE:"d".repeat(64),FIXTURE:"e".repeat(64)});
 const grant={kind:"AG4_G05_WEB_CONSUMER_GRANT_V1",state:"GRANTED",owner:"AG2",
   repo:ROOT,branch:"vite",environment:"ISOLATED_SYNTHETIC_ONLY",
   grantId:"AG4-G05-WEB-LOCAL-001",leaseId:"AG4_G05_WEB_LOCAL_RESOURCE_001",
   expiresUTC:"2026-10-17T17:30:00.000Z",
   issuedUTC:"2026-10-17T17:02:00.000Z",
   allowedCases:[...CASES],operations:["POST /api/v1/pets"],
   honoOrigin:"http://127.0.0.1:4128",
   sourcePins:{...Object.fromEntries(SOURCE_PINS.map(x=>[x,"a".repeat(64)])),
     [AG1_V9_PATH]:AG1_V9_SHA},
   proofs:{ag3Sha256:sha.AG3,ag1Sha256:sha.AG1,
     leaseSha256:sha.LEASE,fixtureSha256:sha.FIXTURE}};
 const ag3={kind:"AG3_G05_RESOURCE_DONE_V1",state:"DONE",
   resourceReleased:true,repo:ROOT,branch:"vite",
   doneUTC:"2026-10-17T16:59:00.000Z"};
 const ag1={kind:"AG1_G05_WEB_CONSUMER_READY_V1",state:"READY",
   leaseId:grant.leaseId,repo:ROOT,branch:"vite",consumer:"AG2_WEB",
   ag3DoneReceiptSha256:sha.AG3,runtime:"NORMAL_PACKAGED_CORE_SHARED_PRISMA_V9",
   producerManifestSha256:AG1_V9_SHA,
   readyUTC:"2026-10-17T17:01:00.000Z",syntheticPgIdentityChecked:true,
   postgresDatabase:"gafus_g05_petcreate_synthetic_20261017",
   postgresUser:"g05_ag1_synthetic",
   syntheticUsersOnly:true,honoOrigin:grant.honoOrigin,
   expiresUTC:grant.expiresUTC};
 const lease={kind:"AG4_G05_WEB_EXCLUSIVE_LEASE_V1",state:"ACTIVE_AG2_EXCLUSIVE",
   owner:"AG2",leaseId:grant.leaseId,repo:ROOT,branch:"vite",
   expiresUTC:grant.expiresUTC,activeUTC:"2026-10-17T17:01:30.000Z",
   postgresHost:"127.0.0.1",redisHost:"127.0.0.1",
   postgresDatabase:"gafus_g05_petcreate_synthetic_20261017",
   postgresUser:"g05_ag1_synthetic",postgresPort:55462,redisPort:6400,
   honoPort:4128,honoOrigin:grant.honoOrigin};
 const fixture={kind:"AG1_G05_WEB_SYNTHETIC_FIXTURE_V1",state:"READY",
   leaseId:grant.leaseId,repo:ROOT,syntheticOnly:true,
   actors:{
     A:{ownerId:"11111111-1111-4111-8111-111111111111",
       accessToken:"abc.def.sig",role:"USER",authEpoch:1,sessionScope:"scope_1"},
     B:{ownerId:"22222222-2222-4222-8222-222222222222",
       accessToken:"ghi.jkl.sig",role:"USER",authEpoch:1,sessionScope:"scope_2"}}};
 return {grant,ag3,ag1,lease,fixture,sha,now};
}
const accepted=()=>validateG05WebDocuments(documents());
test("GATE01 pure complete local WEB-specific proof accepted (NO network)",()=>{
 assert.equal(accepted().honoOrigin,"http://127.0.0.1:4128");
});
for(const [name,change] of [
 ["GATE02 Mobile grant cannot authorize Web",v=>{v.grant.owner="AG3";}],
 ["GATE03 AG3 busy cannot be bypassed",v=>{v.ag3.state="IN_PROGRESS";}],
 ["GATE04 AG1 not READY blocks Web",v=>{v.ag1.state="PENDING";}],
 ["GATE05 resource is AG3-owned",v=>{v.lease.owner="AG3";}],
 ["GATE06 expired lease",v=>{v.lease.expiresUTC="2026-10-17T16:59:00Z";}],
 ["GATE07 production/nonloopback URL",v=>{v.grant.honoOrigin="https://gafus.example";}],
 ["GATE08 no 409 approval",v=>{v.grant.allowedCases.pop();}],
 ["GATE09 missing source pin",v=>{v.grant.sourcePins[SOURCE_PINS[0]]="0".repeat(64);}],
 ["GATE10 resource port mismatch",v=>{v.lease.honoPort=4129;}],
 ["GATE11 source changed after grant",v=>{v.sha[SOURCE_PINS[0]]="0".repeat(64);}],
 ["GATE12 forged second owner",v=>{v.fixture.actors.B.ownerId=v.fixture.actors.A.ownerId;}],
 ["GATE13 mismatched AG1 readiness receipt",v=>{v.ag1.ag3DoneReceiptSha256="0".repeat(64);}],
 ["GATE14 expired grant",v=>{v.grant.expiresUTC="2026-10-17T16:59:00Z";}],
 ["GATE15 wrong root",v=>{v.grant.repo="/another";}],
 ["GATE16 wrong branch",v=>{v.grant.branch="main";}],
 ["GATE17 unsupported operation",v=>{v.grant.operations=["POST /api/v1/pets","DELETE /api/v1/pets"];}],
 ["GATE18 unsafe actor token",v=>{v.fixture.actors.A.accessToken="test-token";}],
 ["GATE19 resource mapped to unrelated database",v=>{v.lease.postgresDatabase="gafus_prod";}],
 ["GATE20 AG1 READY predates AG3 DONE",v=>{v.ag1.readyUTC="2026-10-17T16:58:00.000Z";}],
 ["GATE21 grant predates AG1 READY",v=>{v.grant.issuedUTC="2026-10-17T17:00:00.000Z";}],
 ["GATE22 actor has elevated role",v=>{v.fixture.actors.A.role="ADMIN";}],
 ["GATE23 AG1 has not checked synthetic DB identity",v=>{v.ag1.syntheticPgIdentityChecked=false;}],
]){
 test(name,()=>{const v=documents();change(v);
   assert.throws(()=>validateG05WebDocuments(v),/G05_WEB_GATE_DENIED/);
 });
}
