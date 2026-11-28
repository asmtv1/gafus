/**
 * Local-only route/DB p95/p99 + crash/recovery probe. This is NOT real JWT or
 * internet/edge/staging workload: a loopback fixture injects the test owner.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {gzipSync} from "node:zlib";
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
   db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" || db.pathname!=="/gafus_fresh_walks_load" ||
   !/^\/tmp\/gafus-walks-load-pg\.[A-Za-z0-9]+\/pg$/.test(pgDir) ||
   !Number.isInteger(port) || port<1024 || port>65535 || db.port!==String(port) ||
   (output!=="/tmp/gafus-walks-local-latency.json" && output!==pgDir+"/../walk-delta-profile.json"))
  throw new Error("REFUSING_NON_DISPOSABLE_WALKS_LOAD_TARGET");

function quantile(sorted:number[],pct:number):number{
 if(!sorted.length)throw Error("NO_LATENCY_SAMPLES");
 return Math.round((sorted[Math.ceil(sorted.length*pct)-1]??sorted[sorted.length-1]??0)*100)/100;
}

type WalkInput = {
  clientId: string; startedAt: string; finishedAt: string; durationSeconds: number;
  steps: number; estimatedMeters: number; timerMode: "stopwatch"; incompleteSteps: boolean;
};
type Changes = { reset: boolean; walks: WalkInput[]; deleted: string[]; cursor: string; more: boolean };

function fixtureWalk(index: number): WalkInput {
  const started = Date.UTC(2026, 6, 1) + index * 3600_000;
  return {
    clientId: "00000000-0000-4000-8000-" + index.toString(16).padStart(12,"0"),
    startedAt: new Date(started).toISOString(), finishedAt: new Date(started+1800_000).toISOString(),
    durationSeconds: 1800, steps: 1000+index, estimatedMeters: 900, timerMode: "stopwatch",
    incompleteSteps: false,
  };
}

async function verifyDeltaProtocol(base:string, owner:string, outsider:string) {
  const req = (path:string, method="GET", body?:unknown, actor=owner) => fetch(base+path,{
    method, headers: {"x-qa-owner":actor,...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  async function read<T>(response:Response) {
    const raw=await response.text();
    assert.equal(response.status,200,raw);
    assert.match(response.headers.get("cache-control")??"",/no-store/);
    const envelope=JSON.parse(raw) as {success:boolean;data:T};
    assert.equal(envelope.success,true);
    return {data:envelope.data,bytes:Buffer.byteLength(raw),gzipBytes:gzipSync(raw).length};
  }
  const ack=async(walks:WalkInput[]) => read<{accepted:string[]}>(await req("/sync?response=ack","PUT",{walks}));
  const delta=async(after?:string) => read<Changes>(await req("?view=changes"+(after===undefined?"":"&after="+after)));
  const fixtures=Array.from({length:2000},(_,i)=>fixtureWalk(i+1));
  for(let i=0;i<fixtures.length;i+=100){
    const batch=fixtures.slice(i,i+100);
    assert.deepEqual((await ack(batch)).data.accepted,batch.map(w=>w.clientId));
  }
  const initial=await delta();
  assert.equal(initial.data.reset,true);
  assert.equal(initial.data.walks.length,2000);
  assert.equal(new Set(initial.data.walks.map(w=>w.clientId)).size,2000);
  assert.deepEqual(initial.data.deleted,[]);
  assert.ok(BigInt(initial.data.cursor)>0n,"migration-owned journal trigger must be active");
  const initialCursor=initial.data.cursor;
  const emptyAck=await ack([]);
  assert.deepEqual(emptyAck.data.accepted,[]);
  const empty=await delta(initialCursor);
  assert.deepEqual(empty.data,{reset:false,walks:[],deleted:[],cursor:initialCursor,more:false});
  assert.equal(await prisma.dogWalkChange.count({where:{userId:owner}}),2000);

  // Compare the two current wire contracts, not two historical SHAs.
  // Alternate order to reduce warm-cache bias; gzip sizes are measured offline.
  const pairs:Array<{legacyP95Ms:number;deltaP95Ms:number;legacyBytes:number;deltaBytes:number;legacyGzipBytes:number;deltaGzipBytes:number}>=[];
  async function measure(legacy:boolean) {
    const samples:number[]=[];
    let size={bytes:0,gzipBytes:0};
    for(let i=0;i<10;i++){
      const start=performance.now();
      const response=await req(legacy?"":"?view=changes&after="+initialCursor);
      const raw=await response.text();
      samples.push(performance.now()-start);
      assert.equal(response.status,200);
      const payload=JSON.parse(raw);
      assert.equal(payload.success,true);
      if(legacy) assert.equal(payload.data.length,2000);
      else assert.deepEqual(payload.data,empty.data);
      size={bytes:Buffer.byteLength(raw),gzipBytes:gzipSync(raw).length};
    }
    return {p95Ms:quantile(samples.sort((a,b)=>a-b),.95),...size};
  }
  await measure(true);await measure(false);
  for(let i=0;i<5;i++){
    const first=await measure(i%2===0),second=await measure(i%2!==0);
    const legacy=i%2===0?first:second,change=i%2===0?second:first;
    assert.ok(change.bytes<legacy.bytes);
    pairs.push({legacyP95Ms:legacy.p95Ms,deltaP95Ms:change.p95Ms,legacyBytes:legacy.bytes,
      deltaBytes:change.bytes,legacyGzipBytes:legacy.gzipBytes,deltaGzipBytes:change.gzipBytes});
  }

  // Simulate a lost acknowledgement: finish the first HTTP request but discard
  // the returned receipt. Replaying the exact body must not advance the cursor.
  const newWalk=fixtureWalk(2001);
  const lost=await req("/sync?response=ack","PUT",{walks:[newWalk]});
  assert.equal(lost.status,200);await lost.arrayBuffer();
  const one=await delta(initialCursor);
  assert.equal(one.data.reset,false);assert.equal(one.data.more,false);
  assert.deepEqual(one.data.walks.map(w=>w.clientId),[newWalk.clientId]);
  assert.deepEqual((await ack([newWalk])).data.accepted,[newWalk.clientId]);
  assert.deepEqual((await delta(one.data.cursor)).data,{reset:false,walks:[],deleted:[],cursor:one.data.cursor,more:false});
  assert.ok(one.bytes<initial.bytes/10);

  // 101 actual changes exercise the 100-entry cursor page boundary. A second
  // identical batch must leave the latest versions unchanged.
  const changes=fixtures.slice(0,101).map(w=>({...w,steps:w.steps+17}));
  await ack(changes.slice(0,100));await ack(changes.slice(100));
  const first=await delta(one.data.cursor);
  assert.equal(first.data.more,true);assert.equal(first.data.walks.length,100);
  const second=await delta(first.data.cursor);
  assert.equal(second.data.more,false);assert.equal(second.data.walks.length,1);
  assert.deepEqual(new Set([...first.data.walks,...second.data.walks].map(w=>w.clientId)),new Set(changes.map(w=>w.clientId)));
  await ack(changes.slice(0,100));await ack(changes.slice(100));
  assert.deepEqual((await delta(second.data.cursor)).data,{reset:false,walks:[],deleted:[],cursor:second.data.cursor,more:false});

  // An old device PUT racing with another device's DELETE cannot resurrect a walk.
  const victim=changes[0]!;
  const [removed,replayed]=await Promise.all([
    req("/"+victim.clientId,"DELETE"),req("/sync?response=ack","PUT",{walks:[victim]})
  ]);
  await read(removed);await read(replayed);
  await ack([victim]);
  const deletion=await delta(second.data.cursor);
  assert.deepEqual(deletion.data.deleted,[victim.clientId]);assert.deepEqual(deletion.data.walks,[]);
  assert.equal(await prisma.dogWalkRecord.count({where:{userId:owner,clientId:victim.clientId}}),0);
  assert.deepEqual((await delta(deletion.data.cursor)).data,{reset:false,walks:[],deleted:[],cursor:deletion.data.cursor,more:false});
  const other=await read<Changes>(await req("?view=changes","GET",undefined,outsider));
  assert.equal(other.data.walks.length,0);assert.deepEqual(other.data.deleted,[]);

  const points=Array.from({length:205},(_,i)=>({
    seq:i+1,segment:i<100?1:2,latitude:50+i*0.00001,longitude:30,
    timestamp:new Date(Date.parse(newWalk.startedAt)+i*1000).toISOString(),
    accuracy:5,speed:1,accepted:true,reason:i===0?"first":"ok",deltaMeters:i===0?0:1,
  }));
  for(const batch of [points.slice(0,200),points.slice(200),points.slice(0,200)])
    assert.equal((await read<{accepted:number}>(await req("/"+newWalk.clientId+"/track","PUT",{points:batch}))).data.accepted,batch.length);
  const track1=(await read<typeof points>(await req("/"+newWalk.clientId+"/track"))).data;
  const track2=(await read<typeof points>(await req("/"+newWalk.clientId+"/track?afterSeq=200"))).data;
  assert.deepEqual([...track1,...track2].map(p=>[p.seq,p.segment]),points.map(p=>[p.seq,p.segment]));
  assert.equal((await req("/"+newWalk.clientId+"/track","GET",undefined,outsider)).status,404);

  return {history:2000,emptyAckBytes:emptyAck.bytes,emptyDeltaBytes:empty.bytes,
    oneChangeBytes:one.bytes,initialBytes:initial.bytes,changedRecords:101,trackPoints:205,
    replayCursorStable:true,tombstoneWins:true,ownerIsolation:true,pairs};
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
 const deltaOwner=await prisma.user.create({data:{username:"walk_delta_owner",password:"synthetic-disposable"}});
 const actors=new Set([a.id,b.id,deltaOwner.id]);
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

   // Targeted follow-up: retain actual mounted owner/ACL checks and the
   // complete delta profile, without repeating the unrelated load/chaos test.
   if(process.env.GAFUS_WALKS_LOAD_DELTA_ONLY==="1"){
     assert.equal(output,pgDir+"/../walk-delta-profile.json");
     const delta=await verifyDeltaProtocol(base,deltaOwner.id,b.id);
     writeFileSync(output,JSON.stringify({mode:"delta-only",ownerIsolation:true,delta},null,2)+"\n",{mode:0o600});
     console.log("WALKS_DELTA_REAL_PG_PASS",JSON.stringify(delta));
     return;
   }

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
   const delta=await verifyDeltaProtocol(base,deltaOwner.id,b.id);
   writeFileSync(output,JSON.stringify({...report,delta},null,2)+"\n",{mode:0o600});
   console.log("WALKS_DELTA_REAL_PG_PASS",JSON.stringify(delta));
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
