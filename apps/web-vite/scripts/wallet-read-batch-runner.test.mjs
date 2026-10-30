import {test} from "node:test";
import assert from "node:assert/strict";
import {
 SOURCE_PINS,ALLOWED,walletGet,validateWalletFixture,
 exerciseWalletRead,validateWalletGrant,
} from "./wallet-read-batch-runner.mjs";
const origin="http://127.0.0.1:4142";
const cookieA="ag2_wallet_disposable_A_runtime";
const cookieB="ag2_wallet_disposable_B_runtime";
const fixture={
 principalA:"ag2walletactorA20261018",
 principalB:"ag2walletactorB20261018",
 expectedBalanceA:1,expectedBalanceB:8,
 historyAIds:["ag2walletA_tx1"],
 historyBIds:["ag2walletB_tx1","ag2walletB_tx2"],
};
const row=(id)=>({id,kind:"EARN",delta:1,balanceAfter:8,
 createdAt:"2026-10-18T06:00:00Z",rewardKind:"POST_PUBLISHED",
 sourceEntityId:"SECRET_USER_ID",targetKey:"PRIVATE_TARGET"});
const status=(balance)=>({
 wallet:{balance},activity:{earned:2,remaining:1,limit:3,
  windowSeconds:86400,nextCapacityAt:null},
 rules:{courseStepCost:1,miniGuideCost:1},enabled:{economy:true},
 username:"PRIVATE_USER",token:"SECRET_APIKEY",
});
const reply=data=>({status:200,json:async()=>({success:true,data})});
function wire({badHistory=false,wrongBalance=false,wrongCursor=false,leakA=false}={}){
 const requests=[];
 const transport=async(url,init)=>{
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  const u=new URL(url);
  assert.equal(u.origin,origin);
  const isB=init.headers.Cookie===cookieB;
  const isA=init.headers.Cookie===cookieA;
  assert.ok(isB||isA);
  requests.push({path:u.pathname+u.search,principal:isB?"B":"A"});
  if(u.pathname.endsWith("/status")){
   return reply(status(wrongBalance&&isB?100:isB?8:1));
  }
  if(u.pathname.endsWith("/history")){
   if(isA)return reply({items:[row(leakA?"ag2walletB_tx1":"ag2walletA_tx1")],nextCursor:null});
   if(u.searchParams.get("limit")==="20")
    return reply({items:[row("ag2walletB_tx1"),row(badHistory?
     "ag2walletB_wrong":"ag2walletB_tx2")],nextCursor:null});
   if(u.searchParams.has("cursor"))
    return reply({items:[row("ag2walletB_tx2")],nextCursor:null});
   return reply({items:[row("ag2walletB_tx1")],
    nextCursor:wrongCursor?"../../outside":"next_1"});
  }
  throw Error("WRONG_ENDPOINT");
 };
 return {requests,transport};
}
test("W01 6 actual GET transport calls / 6 boolean acceptance cases",async()=>{
 const w=wire();
 const out=await exerciseWalletRead({origin,cookieA,cookieB,fixture,
  transport:w.transport});
 assert.equal(out.pass,true);
 assert.equal(out.getCount,6);
 assert.equal(out.checksCount,6);
 assert.equal(out.writes,0);
 assert.deepEqual(w.requests.map(x=>x.principal),["B","B","B","B","A","A"]);
 assert.equal(w.requests[3].path,
  "/api/v1/gafus/history?limit=1&cursor=next_1");
 assert.doesNotMatch(JSON.stringify(out),
  /ag2walletB_|SECRET_|PRIVATE_|balance:8|cookie/);
});
test("W02 no network without current lease",async()=>{
 const w=wire();
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport:w.transport,
  leaseCheck:()=>false,
 }));
 assert.equal(w.requests.length,0);
});
test("W03 owner B balance mismatch must fail closed",async()=>{
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport:wire({wrongBalance:true}).transport,
 }));
});
test("W04 B history entity mismatch must fail",async()=>{
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport:wire({badHistory:true}).transport,
 }));
});
test("W05 unsafe server cursor cannot continue",async()=>{
 const w=wire({wrongCursor:true});
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport:w.transport,
 }));
 assert.equal(w.requests.length,3);
});
test("W06 A cannot return B wallet history",async()=>{
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport:wire({leakA:true}).transport,
 }));
});
test("W07 identical B and A cookies denied before request",async()=>{
 const w=wire();
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB:cookieA,transport:w.transport,
 }));
 assert.equal(w.requests.length,0);
});
test("W08 fixture requires distinct test actors and ledger sets",()=>{
 assert.equal(validateWalletFixture(fixture),fixture);
 assert.throws(()=>validateWalletFixture({
  ...fixture,principalA:"REAL_USER",
 }));
 assert.throws(()=>validateWalletFixture({
  ...fixture,historyAIds:["ag2walletB_tx1"],
 }));
});
test("W09 get whitelist ignores arbitrary path/remote host",()=>{
 assert.equal(walletGet(origin,"/api/v1/gafus/status",cookieB).init.method,"GET");
 assert.throws(()=>walletGet("https://gafus.ru","/api/v1/gafus/status",cookieB));
 assert.throws(()=>walletGet(origin,"/api/v1/gafus/unlock",cookieB));
 assert.throws(()=>walletGet(origin,"/api/v1/gafus/history?limit=999",cookieB));
 assert.throws(()=>walletGet(origin,"/api/v1/gafus/history?limit=1&cursor=../../",cookieB));
 assert.throws(()=>walletGet(origin,"/api/v1/gafus/status","bad\ncookie"));
});
test("W10 active AG4 grant cannot be forged by old Feed producer proof",()=>{
 assert.ok(SOURCE_PINS.length>=7);
 assert.deepEqual(ALLOWED.length,4);
 assert.throws(()=>validateWalletGrant({
  kind:"AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE",
 }));
 assert.throws(()=>validateWalletGrant({
  kind:"AG4_AG2_WALLET_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG1_PRODUCER_ONLY",
 }));
});
test("W11 first GET status 403 denied",async()=>{
 const w=wire();
 const original=w.transport;
 const transport=async(url,init)=>url.endsWith("/status")?{
  status:403,json:async()=>({success:false,error:"SECRET_DB"}),
 }:original(url,init);
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport,
 }));
});
test("W12 missing history payload denied",async()=>{
 const w=wire();
 const transport=async(url,init)=>{
  if(url.includes("/history"))return {
   status:200,json:async()=>({success:true,data:{items:null,nextCursor:null}}),
  };
  return w.transport(url,init);
 };
 await assert.rejects(exerciseWalletRead({
  origin,fixture,cookieA,cookieB,transport,
 }));
});
