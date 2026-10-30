#!/usr/bin/env node
/** AG2-READ-WALLET-027-001. Only AG4-approved synthetic local GET.
 * No live mode without a fresh exact lease + producer READY.
 * No authentic user cookies or wallet IDs are logged or persisted.
 */
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const err=()=>{throw Error("AG2_WALLET_READ_DENIED");};
const ok=(value)=>{if(!value)err();};
const id=/^[A-Za-z0-9_-]{1,128}$/;
export const SOURCE_PINS=[
 "apps/web-vite/scripts/wallet-read-batch-runner.mjs",
 "apps/web-vite/src/features/gafus/walletReadApi.ts",
 "apps/web-vite/src/features/gafus/walletReadApi.test.ts",
 "apps/web-vite/src/features/gafus/WalletOptIn.tsx",
 "apps/web-vite/migration/AG2_WEB_URL027_WALLET_SOURCE_EVIDENCE_20261018.json",
 "apps/api/src/routes/v1/gafus.ts",
 "packages/types/src/gafus.ts",
];
export const ALLOWED=[
 "GET /api/v1/gafus/status",
 "GET /api/v1/gafus/history?limit=20",
 "GET /api/v1/gafus/history?limit=1",
 "GET /api/v1/gafus/history?limit=1&cursor=<opaque>",
];
export function ownedPath(path){
 ok(typeof path==="string"&&/^(apps\/|packages\/)/.test(path)&&
  !path.includes("\\")&&!path.startsWith("/")&&
  path.split("/").every(x=>x&&x!==".."&&x!=="."));
 const full=resolve(ROOT,path);
 ok(full.startsWith(ROOT+sep));
 let cur=ROOT;
 for(const part of path.split("/")){
  cur=resolve(cur,part);ok(!lstatSync(cur).isSymbolicLink());
 }
 ok(realpathSync(full)===full);
 return full;
}
export const digest=(p)=>createHash("sha256")
 .update(readFileSync(ownedPath(p))).digest("hex");
const bInt=(v)=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000;
export function validateWalletFixture(f){
 ok(f&&typeof f==="object"&&!Array.isArray(f));
 ok(typeof f.principalA==="string"&&typeof f.principalB==="string"&&
   id.test(f.principalA)&&id.test(f.principalB)&&f.principalA!==f.principalB);
 ok(bInt(f.expectedBalanceA)&&bInt(f.expectedBalanceB)&&
   f.expectedBalanceA!==f.expectedBalanceB);
 ok(Array.isArray(f.historyAIds)&&f.historyAIds.length===1&&
   Array.isArray(f.historyBIds)&&f.historyBIds.length===2);
 const ids=[...f.historyAIds,...f.historyBIds];
 ok(ids.every(x=>typeof x==="string"&&id.test(x))&&
   new Set(ids).size===ids.length);
 // Ensure data is labeled as disposable test-only and not actual users.
 ok(f.principalA.startsWith("ag2wallet")&&f.principalB.startsWith("ag2wallet"));
 return f;
}
export function walletGet(origin,path,cookie){
 ok(typeof origin==="string"&&
  /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(origin));
 ok(typeof path==="string"&&(
  path==="/api/v1/gafus/status"||
  path==="/api/v1/gafus/history?limit=20"||
  path==="/api/v1/gafus/history?limit=1"||
  /^\/api\/v1\/gafus\/history\?limit=1&cursor=[A-Za-z0-9_-]{1,128}$/.test(path)));
 ok(typeof cookie==="string"&&cookie.length>=16&&
  !/[\r\n]/.test(cookie));
 const url=new URL(path,origin);
 ok(url.origin===origin);
 return {url:url.href,init:{
  method:"GET",cache:"no-store",redirect:"error",
  headers:{Accept:"application/json",Cookie:cookie},
  signal:AbortSignal.timeout(8000),
 }};
}
function checkedRows(data,expectedIds){
 ok(data&&typeof data==="object"&&!Array.isArray(data)&&
  Array.isArray(data.items)&&data.items.length===expectedIds.length&&
  data.items.every(x=>x&&typeof x==="object"&&
   id.test(x.id)&&typeof x.kind==="string"&&
   Number.isSafeInteger(x.delta)&&bInt(x.balanceAfter)&&
   typeof x.createdAt==="string"&&Number.isFinite(Date.parse(x.createdAt))));
 const rows=data.items.map(x=>x.id);
 ok(new Set(rows).size===rows.length&&rows.every((v,i)=>v===expectedIds[i]));
 return data.nextCursor;
}
function checkedStatus(data,expectedBalance){
 ok(data&&typeof data==="object"&&!Array.isArray(data)&&
  data.wallet&&typeof data.wallet==="object"&&
  data.wallet.balance===expectedBalance&&
  data.enabled&&typeof data.enabled.economy==="boolean"&&
  data.activity&&bInt(data.activity.limit)&&
  data.rules&&bInt(data.rules.courseStepCost));
}
export async function exerciseWalletRead({
 origin,fixture,cookieA,cookieB,transport=fetch,leaseCheck=()=>true,
}){
 validateWalletFixture(fixture);
 ok(cookieA!==cookieB);
 const cases=[];
 const request=async(path,cookie)=>{
  ok(leaseCheck());
  const {url,init}=walletGet(origin,path,cookie);
  const response=await transport(url,init);
  ok(response&&response.status===200);
  const payload=await response.json();
  ok(payload&&payload.success===true&&payload.data&&
   typeof payload.data==="object"&&!Array.isArray(payload.data));
  return payload.data;
 };
 checkedStatus(await request("/api/v1/gafus/status",cookieB),fixture.expectedBalanceB);
 cases.push({case:"WALLET_STATUS_B_SELF",pass:true});
 const allB=await request("/api/v1/gafus/history?limit=20",cookieB);
 ok(checkedRows(allB,fixture.historyBIds)===null);
 cases.push({case:"WALLET_B_HISTORY_20_TWO_ROWS",pass:true});
 const firstB=await request("/api/v1/gafus/history?limit=1",cookieB);
 const cursor=checkedRows(firstB,fixture.historyBIds.slice(0,1));
 ok(typeof cursor==="string"&&id.test(cursor));
 const lastB=await request("/api/v1/gafus/history?limit=1&cursor="+cursor,cookieB);
 ok(checkedRows(lastB,fixture.historyBIds.slice(1))===null);
 cases.push({case:"WALLET_B_CURSOR_1_1_NO_DUPLICATES",pass:true});
 checkedStatus(await request("/api/v1/gafus/status",cookieA),fixture.expectedBalanceA);
 cases.push({case:"WALLET_STATUS_A_DISTINCT",pass:true});
 const allA=await request("/api/v1/gafus/history?limit=20",cookieA);
 ok(checkedRows(allA,fixture.historyAIds)===null);
 cases.push({case:"WALLET_HISTORY_A_ONLY",pass:true});
 ok(fixture.historyAIds.every(a=>!fixture.historyBIds.includes(a)));
 cases.push({case:"NO_A_B_LEDGER_LEAK",pass:true});
 return {
  kind:"AG2_WALLET_REAL_HONO_GET6_V1",pass:true,realHono:true,
  readOnly:true,methods:["GET"],writes:0,getCount:6,
  checksCount:cases.length,cases,
  // Not a single balance, cookie, user ID, transaction ID or error body.
 };
}
export function validateWalletGrant(grant,now=Date.now()){
 ok(realpathSync(ROOT)===ROOT);
 ok(execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],
  {encoding:"utf8"}).trim()===ROOT);
 ok(execFileSync("git",["-C",ROOT,"branch","--show-current"],
  {encoding:"utf8"}).trim()==="vite");
 ok(grant?.kind==="AG4_AG2_WALLET_REAL_GET_EXCLUSIVE_GRANT_V1"&&
  grant.state==="ACTIVE_AG2_EXCLUSIVE"&&grant.owner==="AG2"&&
  grant.issuer==="AG4"&&grant.repo===ROOT&&grant.branch==="vite"&&
  grant.batch==="AG2-READ-WALLET-027-001"&&
  grant.exclusiveLeaseConfirmed===true&&
  grant.syntheticActorsConfirmed===true&&
  grant.ag1CurrentProducerAccepted===true&&
  grant.readOnlyVerifiedByAG1===true&&
  grant.readOnlyRoleConfirmedByAG4===true&&
  grant.databaseName==="gafus_ag2_wallet_read_20261018"&&
  grant.readOnlyPgRole==="ag2_wallet_read_20261018"&&
  Array.isArray(grant.operations)&&grant.operations.length===ALLOWED.length&&
  ALLOWED.every(v=>grant.operations.includes(v)));
 const expiry=Date.parse(grant.expiresUTC);
 ok(Number.isFinite(expiry)&&expiry>now+10000&&expiry<=now+30*60*1000);
 ok(grant.pin&&SOURCE_PINS.every(p=>grant.pin[p]===digest(p)));
 ok(typeof grant.ag1ProducerReady==="string"&&
  grant.ag1ProducerReady.startsWith("apps/api/")&&
  grant.ag1ProducerReadySHA256===digest(grant.ag1ProducerReady));
 const producer=JSON.parse(readFileSync(ownedPath(grant.ag1ProducerReady),"utf8"));
 ok(producer.kind==="AG1_AG2_WALLET_READ_PRODUCER_READY_V1"&&
  producer.state==="READY_FOR_AG2_WALLET_GATED_READ"&&
  producer.origin===grant.honoOrigin&&producer.readOnlyVerified===true);
 validateWalletFixture(grant.syntheticFixture);
 ok(typeof grant.honoOrigin==="string"&&
  /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(grant.honoOrigin));
 return {origin:grant.honoOrigin,fixture:grant.syntheticFixture,expiry};
}
async function runReal(){
 ok(process.env.AG2_WALLET_REAL_GET==="AG4_SCOPE_ACKNOWLEDGED");
 ok(typeof process.env.AG2_WALLET_COOKIE_A==="string"&&
   typeof process.env.AG2_WALLET_COOKIE_B==="string");
 const grantRel="apps/admin-panel/AG4_AG2_WALLET_REAL_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json";
 const grant=JSON.parse(readFileSync(ownedPath(grantRel),"utf8"));
 const ready=validateWalletGrant(grant);
 return exerciseWalletRead({
  ...ready,cookieA:process.env.AG2_WALLET_COOKIE_A,
  cookieB:process.env.AG2_WALLET_COOKIE_B,
  leaseCheck:()=>Date.now()+1000<ready.expiry,
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=="--real"||
  process.argv[3]!=="--I-ACKNOWLEDGE-AG4-READONLY-WALLET-LEASE"){
  process.stderr.write("AG2_WALLET_READ_DENIED_NO_GRANT\n");
  process.exitCode=78;
 }else{
  try{console.log(JSON.stringify(await runReal(),null,2));}
  catch{
   process.stderr.write("AG2_WALLET_READ_DENIED_OR_FAILED_NO_FALLBACK\n");
   process.exitCode=78;
  }
 }
}
