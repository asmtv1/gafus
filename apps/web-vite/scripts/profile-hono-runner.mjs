#!/usr/bin/env node
/** AG2 ordinary profile/Hono contract runner. Real mode closed by default. */
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {executeProfileAttempt,projection,PATH} from "./profile-hono-contract.mjs";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const files=[
 "apps/web-vite/scripts/profile-hono-contract.mjs",
 "apps/web-vite/scripts/profile-hono-runner.mjs",
 "apps/web-vite/migration/AG2_PROFILE_HONO_SYNTHETIC_FIXTURES_20261018.json",
 "apps/web-vite/src/features/profile/ProfileOverview.tsx",
 "apps/web-vite/src/features/profile/profileApi.ts",
];
const fixturePath="apps/web-vite/migration/AG2_PROFILE_HONO_SYNTHETIC_FIXTURES_20261018.json";
function scoped(relative,prefix){
  if(typeof relative!=="string"||!relative.startsWith(prefix)||
    relative.startsWith("/")||relative.includes("\\")||
    relative.split("/").some(x=>!x||x==="."||x===".."))throw Error("DENIED");
  const abs=resolve(ROOT,relative);
  if(!abs.startsWith(ROOT+sep))throw Error("DENIED");
  let step=ROOT;
  for(const part of relative.split("/")){
    step=resolve(step,part);
    if(lstatSync(step).isSymbolicLink())throw Error("DENIED");
  }
  if(realpathSync(abs)!==abs)throw Error("DENIED");
  return abs;
}
const sha=p=>createHash("sha256").update(readFileSync(scoped(p,p.split("/").slice(0,2).join("/")+"/"))).digest("hex");
function gate(relative){
  const git=execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim();
  const branch=execFileSync("git",["-C",ROOT,"branch","--show-current"],{encoding:"utf8"}).trim();
  if(git!==ROOT||realpathSync(ROOT)!==ROOT||branch!=="vite")throw Error("DENIED");
  const grant=JSON.parse(readFileSync(scoped(relative,"apps/admin-panel/"),"utf8"));
  const now=Date.now(),exp=Date.parse(grant.expiresUTC);
  if(grant.kind!=="AG4_AG2_PROFILE_HTTP_EXCLUSIVE_GRANT_V1"||
    grant.state!=="ACTIVE_AG2_EXCLUSIVE"||grant.owner!=="AG2"||
    grant.repo!==ROOT||grant.branch!=="vite"||
    grant.scope!=="ISOLATED_LOCAL_SYNTHETIC_PROFILE_ONLY"||
    grant.operations?.join(",")!=="GET /api/v1/user/profile,PUT /api/v1/user/profile"||
    !Number.isFinite(exp)||exp<=now||exp>now+30*60_000||
    typeof grant.honoOrigin!=="string"||
    !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(grant.honoOrigin)||
    typeof grant.databaseName!=="string"||!/^gafus_ag2_profile_synthetic_[a-z0-9_]+$/.test(grant.databaseName)||
    grant.exclusiveLeaseConfirmed!==true||grant.syntheticActorsConfirmed!==true||
    grant.ag1CurrentProducerAccepted!==true||grant.requireRestoreOnCompletion!==true||
    !grant.pin||files.some(p=>grant.pin[p]!==sha(p))||
    grant.pin[fixturePath]!==sha(fixturePath))throw Error("DENIED");
  if(process.env.AG2_PROFILE_REAL_HTTP!=="AG4_SCOPE_ACKNOWLEDGED"||
    !process.env.AG2_PROFILE_COOKIE_A||!process.env.AG2_PROFILE_COOKIE_B||
    process.env.AG2_PROFILE_COOKIE_A===process.env.AG2_PROFILE_COOKIE_B)
    throw Error("DENIED");
  return {origin:grant.honoOrigin,expires:exp};
}
/**
 * Cookie mutations must carry the actual AG4-leased local Origin.
 * This is NOT a CSRF allowlist: the Hono producer independently decides
 * whether that Origin is trusted. Never spoof a production Web hostname.
 */
export function scopedCookieRequest(origin, cookie, method, changes){
  if(typeof origin!=="string"||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(origin)||
    !["GET","PUT"].includes(method)||
    typeof cookie!=="string"||cookie.length===0){
    throw Error("DENIED");
  }
  if(method==="GET"&&changes!==undefined)throw Error("DENIED");
  if(method==="PUT"&&(!changes||typeof changes!=="object"||
    Array.isArray(changes)||Object.keys(changes).length!==1||
    typeof changes.city!=="string"||changes.city.trim().length===0||
    changes.city.length>100))throw Error("DENIED");
  return {
    url:origin+PATH,
    init:{
      method,headers:{Cookie:cookie,Accept:"application/json",
        ...(method==="PUT"?{"Content-Type":"application/json",
          "X-Gafus-Auth-Transport":"cookie",Origin:origin}:{})},
      ...(method==="PUT"?{body:JSON.stringify(changes)}:{}),
      signal:AbortSignal.timeout(10_000),cache:"no-store",
    },
  };
}
const report=(results)=>({kind:"AG2_PROFILE_HTTP_RUNNER_V1",
  mode:results.mode,cases:results.cases,pass:results.cases.every(x=>x.pass),
  realHono:results.mode==="AG4_GATED_REAL_LOCAL_HTTP"});
export async function runSynthetic(){
  const f=JSON.parse(readFileSync(scoped(fixturePath,"apps/web-vite/"),"utf8"));
  const original=projection(f.actorA), b=projection(f.actorB);
  const cases=[];
  async function scenario(name,setup,expected){
    let a=structuredClone(original),actor="synthetic-user-a",count=0;
    const wire=async req=>{
      if(req.method==="PUT"){count++;const reply=await setup(req,{a,actor,b});
        return reply===undefined?{status:200,success:true}:{...reply};}
      return {status:200,success:true,data:a};
    };
    const result=await executeProfileAttempt({
      owner:original.id,before:original,draft:{...original.profile,city:"Казань"},
      wire,isCurrent:owner=>actor===owner});
    cases.push({name,pass:result.kind===expected&&count===1,
      outcome:result.kind,writes:count});
  }
  await scenario("P01_ONLY_CHANGED_FIELDS",async(req,{a})=>{
    if(JSON.stringify(req.changes)!=='{"city":"Казань"}')throw Error("WRONG_FIELDS");
    a.profile.city="Казань";
  },"MATCHED_READBACK");
  await scenario("P02_ACK_EXACT_OWNER_READBACK",async(_,{a})=>{
    a.profile.city="Казань";
  },"MATCHED_READBACK");
  await scenario("P03_SYNTHETIC_INJECTED_403_NO_RETRY",async()=>({status:403,success:false}),"REJECTED");
  // A->B->A must be permanently fenced even if the identifier returns to A.
  let epoch=0,ackRelease,lateWrites=0;
  const pending=new Promise(resolve=>{ackRelease=resolve;});
  const late=executeProfileAttempt({owner:original.id,before:original,
    draft:{...original.profile,city:"Казань"},
    isCurrent:owner=>owner===original.id&&epoch===0,
    wire:async req=>{
      if(req.method!=="PUT")throw Error("LATE_GET_FORBIDDEN");
      lateWrites++;return pending;
    }});
  epoch++; // B and later A are both fenced by original epoch
  ackRelease({status:200,success:true});
  const lateResult=await late;
  cases.push({name:"P04_LATE_ACK_A_B_A_FENCED",
    pass:lateResult.kind==="FENCED"&&lateWrites===1,
    outcome:lateResult.kind,writes:lateWrites});
  await scenario("P05_LOST_ACK_UNKNOWN_NO_AUTORETRY",async()=>{throw Error("LOST_ACK");},"UNKNOWN");
  await scenario("P06_HTTP_503_UNKNOWN",async()=>({status:503,success:false}),"UNKNOWN");
  await scenario("P07_SERVER_SUCCESS_BUT_STALE_GET_UNKNOWN",async()=>({status:200,success:true}),"UNKNOWN");
  const foreign=await executeProfileAttempt({owner:original.id,before:original,
    draft:{...original.profile,city:"Казань"},isCurrent:()=>true,
    wire:async req=>req.method==="PUT"?{status:200,success:true}:
      {status:200,success:true,data:{...b,profile:{...b.profile,city:"Казань"}}}});
  cases.push({name:"P08_FOREIGN_READBACK_REJECTED",
    pass:foreign.kind==="UNKNOWN",outcome:foreign.kind,writes:1});
  const unchanged=await executeProfileAttempt({owner:original.id,before:original,
    draft:{...original.profile},isCurrent:()=>true,wire:()=>{throw Error("SHOULD_NOT_CALL");}});
  cases.push({name:"P09_NO_CHANGES_ZERO_PUT",pass:unchanged.kind==="NO_CHANGES",writes:0});
  return report({mode:"SYNTHETIC",cases});
}
async function real(grantPath){
  const permission=gate(grantPath);
  // Only two preissued AG4 synthetic cookies. Never log or persist them.
  const get=async cookie=>{
    const {url,init}=scopedCookieRequest(permission.origin,cookie,"GET");
    const response=await fetch(url,init);
    const body=await response.json();
    if(response.status!==200||body.success!==true)throw Error("READ_FAIL");
    return projection(body.data);
  };
  const aCookie=process.env.AG2_PROFILE_COOKIE_A,bCookie=process.env.AG2_PROFILE_COOKIE_B;
  const aBefore=await get(aCookie),bBefore=await get(bCookie);
  if(aBefore.id===bBefore.id||
    typeof aBefore.profile.city!=="string"||aBefore.profile.city.length===0)
    throw Error("SYNTHETIC_ACTOR_BASELINE_DENIED");
  const changedCity="AG2-synthetic-"+Date.now().toString(36);
  const wire=async req=>{
    if(Date.now()>=permission.expires)throw Error("LEASE_EXPIRED");
    if(req.owner!==aBefore.id)throw Error("OWNER_MISMATCH");
    const {url,init}=scopedCookieRequest(permission.origin,aCookie,
      req.method,req.changes);
    const response=await fetch(url,init);
    let body;
    try{body=await response.json();}catch{return {status:response.status,success:false};}
    return {status:response.status,...body};
  };
  let result,restore="NOT_ATTEMPTED";
  try{
    result=await executeProfileAttempt({owner:aBefore.id,before:aBefore,
      draft:{...aBefore.profile,city:changedCity},wire,isCurrent:id=>id===aBefore.id});
  }finally{
    // This writes ONLY into an exclusive synthetic DB, never production.
    // A lost ACK may still have committed, so verify current state before restore.
    const seen=await get(aCookie);
    if(seen.profile.city===changedCity){
      const reply=await wire({owner:aBefore.id,method:"PUT",
        path:PATH,changes:{city:aBefore.profile.city??""}});
      if(reply.status!==200||reply.success!==true)throw Error("RESTORE_UNKNOWN");
      const check=await get(aCookie);
      if(check.profile.city!==(aBefore.profile.city??""))throw Error("RESTORE_MISMATCH");
      restore="READBACK_RESTORED";
    }else if(seen.profile.city===aBefore.profile.city){
      restore="UNCHANGED_CONFIRMED";
    }else throw Error("RESTORE_UNSAFE_STALE_OR_FOREIGN");
  }
  const bAfter=await get(bCookie);
  if(bAfter.profile.city!==bBefore.profile.city)throw Error("OWNER_B_CHANGED");
  return report({mode:"AG4_GATED_REAL_LOCAL_HTTP",cases:[{
    name:"LOCAL_HONO_A_PROFILE_CHANGED_FIELDS_AND_GET",
    pass:result?.kind==="MATCHED_READBACK"&&restore!=="NOT_ATTEMPTED",
    outcome:result?.kind,restore
  },{
    name:"LOCAL_HONO_B_OTHER_OWNER_UNCHANGED",
    pass:bAfter.id===bBefore.id,outcome:"READ_ONLY"
  }]});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,flag,path,ack]=process.argv.slice(2);
  try{
    const result=mode==="--synthetic"&&!flag?await runSynthetic():
      mode==="--real"&&flag==="--grant"&&path&&
      ack==="--I-ACKNOWLEDGE-AG4-ISOLATED-PROFILE-WRITE"?
        await real(path):null;
    if(!result)throw Error("INVALID_ARGS");
    console.log(JSON.stringify(result,null,2));
    if(!result.pass)process.exitCode=1;
  }catch{
    // Never emit cookies or grant content.
    process.stderr.write("AG2_PROFILE_HONO_RUNNER_DENIED_OR_FAILED; no unauthorized fallback\n");
    process.exitCode=78;
  }
}
