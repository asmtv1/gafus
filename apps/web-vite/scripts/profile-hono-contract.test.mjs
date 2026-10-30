import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {projection,changedFields,executeProfileAttempt,PATH} from "./profile-hono-contract.mjs";
import {runSynthetic,scopedCookieRequest} from "./profile-hono-runner.mjs";
const A={id:"A",username:"a",profile:{fullName:"Иван",city:"Самара",about:"Люблю собак"}};
const B={id:"B",username:"b",profile:{...A.profile,city:"Казань"}};
const draft={...A.profile,city:"Казань"};
test("01 exact route, strict private projection",()=>{
 assert.equal(PATH,"/api/v1/user/profile");
 assert.deepEqual(projection({...A,email:"SECRET",refreshToken:"SECRET"}),A);
 assert.throws(()=>projection({...A,profile:{city:1}}));
});
test("02 trim, changed field only, oversized input denied",()=>{
 assert.deepEqual(changedFields(A.profile,{...A.profile,city:" Казань "}),{city:"Казань"});
 assert.throws(()=>changedFields(A.profile,{...A.profile,city:"X".repeat(101)}));
});
test("03 ack exact owner readback, no extra PUT",async()=>{
 const calls=[];
 const result=await executeProfileAttempt({owner:"A",before:A,draft,isCurrent:()=>true,
   wire:async request=>{
     calls.push(request);
     return request.method==="PUT"?{status:200,success:true}:
       {status:200,success:true,data:{...A,profile:{...A.profile,city:"Казань"}}};
   }});
 assert.equal(result.kind,"MATCHED_READBACK");
 assert.deepEqual(calls.map(x=>x.method),["PUT","GET"]);
 assert.deepEqual(calls[0].changes,{city:"Казань"});
});
test("04 403 no readback, no auto repeat",async()=>{
 let writes=0,reads=0;
 const result=await executeProfileAttempt({owner:"A",before:A,draft,isCurrent:()=>true,
   wire:async req=>{if(req.method==="PUT"){writes++;return {status:403,success:false};}
     reads++;return {};}});
 assert.equal(result.kind,"REJECTED");assert.equal(writes,1);assert.equal(reads,0);
});
test("05 late ACK ABA fences private update and independent GET",async()=>{
 let release;
 const late=new Promise(done=>{release=done;});
 let generation=0,reads=0;
 const task=executeProfileAttempt({owner:"A",before:A,draft,
   isCurrent:()=>generation===0,
   wire:async req=>req.method==="PUT"?late:(reads++,{status:200,success:true,data:A})});
 generation=1;
 release({status:200,success:true});
 assert.equal((await task).kind,"FENCED");
 assert.equal(reads,0);
});
test("06 late GET ABA fences old actor readback",async()=>{
 let release;
 const late=new Promise(done=>{release=done;});
 let generation=0;
 const task=executeProfileAttempt({owner:"A",before:A,draft,
   isCurrent:()=>generation===0,
   wire:async req=>req.method==="PUT"?{status:200,success:true}:late});
 await Promise.resolve();generation=1;
 release({status:200,success:true,data:{...A,profile:{...A.profile,city:"Казань"}}});
 assert.equal((await task).kind,"FENCED");
});
test("07 network loss/503/invalid status unknown and never repeat",async()=>{
 for(const wire of [()=>{throw Error("LOST_ACK");},
   async()=>({status:503,success:false}),
   async()=>({status:200,success:false})]){
   let count=0;
   const result=await executeProfileAttempt({owner:"A",before:A,draft,
     isCurrent:()=>true,wire:async req=>(count++,wire(req))});
   assert.equal(result.kind,"UNKNOWN");assert.equal(count,1);
 }
});
test("08 foreign-owner readback with matching city never accepted",async()=>{
 const result=await executeProfileAttempt({owner:"A",before:A,draft,isCurrent:()=>true,
   wire:async req=>req.method==="PUT"?{status:200,success:true}:
     {status:200,success:true,data:B}});
 assert.equal(result.kind,"UNKNOWN");
});
test("09 no change never writes",async()=>{
 const result=await executeProfileAttempt({owner:"A",before:A,
   draft:A.profile,isCurrent:()=>true,wire:()=>{throw Error("SHOULD_NOT_WRITE");}});
 assert.equal(result.kind,"NO_CHANGES");
});
test("10 executable synthetic fixture scenarios",async()=>{
 const result=await runSynthetic();
 assert.equal(result.pass,true);
 assert.equal(result.cases.length,9);
 assert.equal(result.realHono,false);
 assert.deepEqual(result.cases.map(x=>x.pass),Array(9).fill(true));
});
test("11 ordinary real entrypoint DENIED without AG4 scope and environment",()=>{
 const run=spawnSync(process.execPath,[
   "apps/web-vite/scripts/profile-hono-runner.mjs","--real",
   "--grant","apps/admin-panel/does-not-exist.json",
   "--I-ACKNOWLEDGE-AG4-ISOLATED-PROFILE-WRITE"],{
   cwd:"/Users/asmtv1/Desktop/gafus-refactor",
   env:{...process.env,AG2_PROFILE_REAL_HTTP:"",AG2_PROFILE_COOKIE_A:"",AG2_PROFILE_COOKIE_B:""},
   encoding:"utf8"});
 assert.equal(run.status,78);
 assert.match(run.stderr,/DENIED/);
});

// CSRF security regression: origin cases are a SYNTHETIC Hono-like
// trusted-origin fixture, not evidence that the unmodified real producer
// trusts a local HTTP origin. Real Hono currently allows HTTPS only.
const localOrigin="http://127.0.0.1:5179";
const demoCookie="gafus_access=synthetic-test-cookie";
const csrfResponse=(origin,allowedOrigins)=>(
  origin&&allowedOrigins.includes(origin)
    ?{status:200,success:true}
    :{status:403,success:false,error:"Недоверенный Origin"}
);
test("12 missing Origin -> synthetic cookie PUT 403, never considered success",()=>{
  const response=csrfResponse(undefined,[localOrigin]);
  assert.equal(response.status,403);
  const attempt=scopedCookieRequest(localOrigin,demoCookie,"PUT",{city:"Казань"});
  assert.equal(attempt.init.headers.Origin,localOrigin);
  assert.equal(attempt.init.headers["X-Gafus-Auth-Transport"],"cookie");
  assert.equal(attempt.init.method,"PUT");
});
test("13 untrusted/production-spoof Origin -> synthetic 403 and runner rejects nonlocal",()=>{
  assert.equal(csrfResponse("https://evil.invalid",[localOrigin]).status,403);
  assert.equal(csrfResponse("http://127.0.0.1:5180",[localOrigin]).status,403);
  assert.throws(()=>scopedCookieRequest("https://gafus.ru",demoCookie,
    "PUT",{city:"Казань"}),/DENIED/);
  assert.throws(()=>scopedCookieRequest("http://localhost:5179",demoCookie,
    "PUT",{city:"Казань"}),/DENIED/);
  assert.throws(()=>scopedCookieRequest("http://127.0.0.1:5179",
    demoCookie,"PUT",{city:"Казань",fullName:"Something"}),/DENIED/);
});
test("14 trusted grant-local Origin -> synthetic Hono-like 200, no CSRF bypass",()=>{
  const request=scopedCookieRequest(localOrigin,demoCookie,"PUT",{city:"Казань"});
  assert.equal(request.url,localOrigin+PATH);
  assert.equal(request.init.headers.Origin,localOrigin);
  assert.equal(request.init.headers["Content-Type"],"application/json");
  assert.deepEqual(JSON.parse(request.init.body),{city:"Казань"});
  assert.equal(csrfResponse(request.init.headers.Origin,[localOrigin]).status,200);
  const get=scopedCookieRequest(localOrigin,demoCookie,"GET");
  assert.equal(get.init.headers.Origin,undefined);
  assert.equal(get.init.body,undefined);
});
test("15 injected 403 is origin/auth denial fixture, not foreign-owner endpoint",async()=>{
  const r=await runSynthetic();
  assert.equal(r.cases[2].name,"P03_SYNTHETIC_INJECTED_403_NO_RETRY");
  assert.equal(r.cases[2].outcome,"REJECTED");
  assert.equal(r.cases[2].writes,1);
});
