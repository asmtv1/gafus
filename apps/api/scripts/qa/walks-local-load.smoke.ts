/**
 * Local-only route/DB p95/p99 + crash/recovery probe. This is NOT real JWT or
 * internet/edge/staging workload: a loopback fixture injects the test owner.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {setTimeout as sleep} from "node:timers/promises";
import {serve} from "@hono/node-server";
import {Hono} from "hono";
import {prisma} from "@gafus/prisma";
import {walksRoutes} from "../../src/routes/v1/walks.js";

const db=new URL(process.env.DATABASE_URL??"http://invalid");
const pgDir=process.env.GAFUS_WALKS_LOAD_PG_DIR??"";
const port=Number(process.env.GAFUS_WALKS_LOAD_PG_PORT);
const output=process.env.GAFUS_WALKS_LOAD_REPORT??"";
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_WALKS_LOAD_REAL_PG!=="1" ||
   db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" || db.pathname!=="/gafus_refactor_walks_load" ||
   !/^\/tmp\/gafus-walks-load-pg\.[A-Za-z0-9]+\/pg$/.test(pgDir) ||
   !Number.isInteger(port) || port<1024 || port>65535 || db.port!==String(port) ||
   output!=="/tmp/gafus-walks-local-latency.json")
  throw new Error("REFUSING_NON_DISPOSABLE_WALKS_LOAD_TARGET");

function quantile(sorted:number[],pct:number):number{
 if(!sorted.length)throw Error("NO_LATENCY_SAMPLES");
 return Math.round((sorted[Math.ceil(sorted.length*pct)-1]??sorted[sorted.length-1]??0)*100)/100;
}

async function main(){
 const a=await prisma.user.create({data:{username:"walk_load_A",password:"synthetic-disposable"}});
 const b=await prisma.user.create({data:{username:"walk_load_B",password:"synthetic-disposable"}});
 const walkClientId="736bf40e-e2ea-4cad-9ec9-74d340d114dd";
 await prisma.dogWalkRecord.create({data:{
   userId:a.id,clientId:walkClientId,
   startedAt:new Date("2026-11-06T11:00:00.000Z"),finishedAt:new Date("2026-11-06T11:45:00.000Z"),
   durationSeconds:2700,steps:4300,estimatedMeters:3100,
   timerMode:"stopwatch",incompleteSteps:false,
 }});
 const actors=new Set([a.id,b.id]);
 const app=new Hono();
 app.use("*",async(c,next)=>{
   const actor=c.req.header("x-qa-owner");
   if(!actor || !actors.has(actor))return c.json({success:false,code:"UNAUTHENTICATED"},401);
   c.set("user",{id:actor,username:"disposable-test",role:"USER"});
   await next();
 });
 app.route("/api/v1/walks",walksRoutes);
 const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
 await new Promise<void>((resolve,reject)=>{
   if(server.listening){resolve();return;}
   server.once("listening",resolve);server.once("error",reject);
 });
 const address=server.address();
 assert.ok(address && typeof address!=="string");
 const base=`http://127.0.0.1:${address.port}/api/v1/walks`;
 const get=async(path:string,actor:string)=>fetch(base+path,{headers:{"x-qa-owner":actor}});
 let chaosStopped=false;
 try{
   const unauth=await fetch(base);
   assert.equal(unauth.status,401);
   assert.equal((await get("",b.id)).status,200);
   const spoof=await get(`?userId=${encodeURIComponent(a.id)}`,b.id);
   assert.equal((await spoof.json()).data.length,0,"query string cannot override server owner");
   const denied=await get(`/${walkClientId}/track`,b.id);
   assert.equal(denied.status,404,"private track must be owner-scoped");
   const seen=await get("",a.id);
   assert.equal((await seen.json()).data[0].clientId,walkClientId);

   const paths=["","/deleted"];
   const readOnce=async(i:number)=>{
     const before=performance.now();
     const response=await get(paths[i%2]!,a.id);
     const body=await response.json();
     assert.equal(response.status,200);
     assert.equal(body.success,true);
     assert.match(response.headers.get("cache-control")??"",/no-store/);
     return performance.now()-before;
   };
   async function runRequests(total:number,parallel:number){
     let next=0;const samples:number[]=[];
     await Promise.all(Array.from({length:parallel},async()=>{
       while(true){const i=next++;if(i>=total)return;samples.push(await readOnce(i));}
     }));
     samples.sort((x,y)=>x-y);
     return samples;
   }
   await runRequests(80,8); // Warmup excluded from the measurements.
   const start=performance.now();
   const samples=await runRequests(400,12);
   const duration=performance.now()-start;
   assert.equal(samples.length,400);
   const report={
     label:"local-only Hono route + actual disposable PostgreSQL, test-injected actor (NOT JWT)",
     total:400,concurrency:12,warmup:80,
     p50Ms:quantile(samples,0.50),p95Ms:quantile(samples,0.95),p99Ms:quantile(samples,0.99),
     maxMs:Math.round(samples[samples.length-1]! * 100)/100,
     totalMs:Math.round(duration*100)/100,
     rps:Math.round((400_000/duration)*100)/100,
   };
   writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
   // This exact PostgreSQL cluster is throwaway and bound to 127.0.0.1.
   execFileSync("pg_ctl",["-D",pgDir,"-m","immediate","stop"],{stdio:"pipe"});
   chaosStopped=true;
   const failing=await get("",a.id);
   assert.equal(failing.status,503,"DB outage should fail closed, not expose stale private data");
   const failedPayload=await failing.json();
   assert.equal(failedPayload.code,"WALKS_UNAVAILABLE");
   execFileSync("pg_ctl",["-D",pgDir,"-l",pgDir+"/../server.log",
     "-o",`-h 127.0.0.1 -p ${port}`,"-w","start"],{stdio:"pipe"});
   chaosStopped=false;
   let recovered=false;
   for(let i=0;i<25;i++){
     const res=await get("",a.id);
     if(res.status===200){
       const body=await res.json();
       assert.equal(body.data[0]?.clientId,walkClientId);
       recovered=true;break;
     }
     await sleep(200);
   }
   assert.ok(recovered,"Prisma and Hono must recover without a server restart");
   console.log("WALKS_LOCAL_P95_P99_PASS",JSON.stringify(report));
   console.log("WALKS_DISPOSABLE_PG_CHAOS_PASS: outage 503, restart 200, no private data leak");
 }finally{
   if(chaosStopped){
     execFileSync("pg_ctl",["-D",pgDir,"-l",pgDir+"/../server.log",
       "-o",`-h 127.0.0.1 -p ${port}`,"-w","start"],{stdio:"pipe"});
   }
   await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }
}
main().then(async()=>prisma.$disconnect())
 .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
