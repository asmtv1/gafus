/** Stage 5: compare the exact current history projection against an owner-local
 * uncorrelated exclusion set on the same disposable PostgreSQL. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync,readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {loadavg,cpus} from "node:os";
import {gzipSync} from "node:zlib";
import {prisma} from "@gafus/prisma";
import {Hono} from "hono";
import {serve} from "@hono/node-server";

const db=new URL(process.env.DATABASE_URL??"http://invalid");
const pgDir=process.env.GAFUS_WALKS_LOAD_PG_DIR??"";
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,"1");
assert.equal(process.env.GAFUS_WALKS_LOAD_REAL_PG,"1");
assert.deepEqual([db.protocol,db.hostname,db.username,db.pathname,db.port],["postgresql:","127.0.0.1","qacourse","/gafus_fresh_walks_load",process.env.GAFUS_WALKS_LOAD_PG_PORT]);
assert.match(pgDir,/^\/tmp\/gafus-walks-load-pg\.[A-Za-z0-9]+\/pg$/);
const report=pgDir+"/../full-read-plan.json";
const owner="qa-walk-plan-owner",other="qa-walk-plan-other";
const baseline=`SELECT w."clientId", w."startedAt", w."finishedAt", w."durationSeconds", w.steps,
           w."estimatedMeters", w."timerMode", w."incompleteSteps", w."gpsEnabled", w."gpsMeters"
    FROM "DogWalkRecord" w
    WHERE w."userId" = $1 AND NOT EXISTS (
      SELECT 1 FROM "DogWalkTombstone" d WHERE d."userId" = w."userId" AND d."clientId" = w."clientId"
    ) ORDER BY w."startedAt" DESC, w."clientId" DESC LIMIT 2000`;
const proposed=baseline.replace('NOT EXISTS (\n      SELECT 1 FROM "DogWalkTombstone" d WHERE d."userId" = w."userId" AND d."clientId" = w."clientId"','w."clientId" NOT IN (\n      SELECT d."clientId" FROM "DogWalkTombstone" d WHERE d."userId" = $2');
assert.notEqual(baseline,proposed);
const clientId=(i:number)=>"00000000-0000-4000-8000-"+i.toString(16).padStart(12,"0");
const fixture=(i:number,userId=owner)=>({
 userId,clientId:clientId(i),startedAt:new Date(Date.UTC(2026,6,1)+Math.floor(i/2)*3600000),
 finishedAt:new Date(Date.UTC(2026,6,1)+Math.floor(i/2)*3600000+1800000),
 durationSeconds:1800,steps:1000+i,estimatedMeters:900,timerMode:"stopwatch",incompleteSteps:false,
});
type Row=ReturnType<typeof fixture>&{gpsEnabled:boolean;gpsMeters:number|null};
const dto=(r:Row)=>({clientId:r.clientId,startedAt:r.startedAt.toISOString(),finishedAt:r.finishedAt.toISOString(),
 durationSeconds:r.durationSeconds,steps:r.steps,estimatedMeters:r.estimatedMeters,timerMode:r.timerMode,
 incompleteSteps:r.incompleteSteps,gpsEnabled:r.gpsEnabled,gpsMeters:r.gpsMeters});
const read=(newPlan:boolean,actor=owner)=>newPlan?prisma.$queryRawUnsafe<Row[]>(proposed,actor,actor):prisma.$queryRawUnsafe<Row[]>(baseline,actor);
const expected=(max:number,excluded:Set<number>)=>Array.from({length:max},(_,j)=>max-j).filter(i=>!excluded.has(i)).slice(0,2000).map(clientId);
const plan=(newPlan:boolean)=>prisma.$queryRawUnsafe<any[]>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) `+(newPlan?proposed:baseline),...(newPlan?[owner,owner]:[owner]));
function nodes(n:any):any[]{return [n,...(n.Plans??[]).flatMap(nodes)];}
function root(p:any[]){return p[0]["QUERY PLAN"][0];}
function scans(p:any[]){return nodes(root(p).Plan).filter(n=>n["Relation Name"]==="DogWalkTombstone").map(n=>({type:n["Node Type"],loops:n["Actual Loops"],rows:n["Actual Rows"],hits:n["Shared Hit Blocks"],read:n["Shared Read Blocks"]}));}
function quantile(xs:number[],p:number){return [...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]!;}
async function bench(label:string,ids:string[]){
 await prisma.$executeRawUnsafe('ANALYZE "DogWalkRecord"');
 await prisma.$executeRawUnsafe('ANALYZE "DogWalkTombstone"');
 const old=await read(false),next=await read(true);
 assert.deepEqual(old,next);
 assert.deepEqual(next.map(r=>r.clientId),ids);
 const raw=JSON.stringify({success:true,data:next.map(dto)});
 const plans={baseline:await plan(false),proposed:await plan(true)};
 const pairs=[];
 for(let k=0;k<5;k++){
  const pair={} as Record<string,{p95Ms:number;p50Ms:number;sqlP95Ms:number;samplesMs:number[];sqlSamplesMs:number[]}>;
  for(const flag of k%2?[true,false]:[false,true]){
   const wall:number[]=[],sql:number[]=[];
   for(let i=0;i<10;i++){
    const start=performance.now();const rows=await read(flag);const sqlMs=performance.now()-start;
    const body=JSON.stringify({success:true,data:rows.map(dto)});wall.push(performance.now()-start);sql.push(sqlMs);
    assert.equal(body,raw);
   }
   pair[flag?"proposed":"baseline"]={p95Ms:quantile(wall,.95),p50Ms:quantile(wall,.5),sqlP95Ms:quantile(sql,.95),samplesMs:wall,sqlSamplesMs:sql};
  }pairs.push(pair);
 }
 const result={label,rows:next.length,bytes:Buffer.byteLength(raw),gzipBytes:gzipSync(raw).length,plans,pairs,
   scans:{baseline:scans(plans.baseline),proposed:scans(plans.proposed)},explainMs:{baseline:root(plans.baseline)["Execution Time"],proposed:root(plans.proposed)["Execution Time"]},load:loadavg()};
 console.log("WALK_FULL_READ_PLAN "+JSON.stringify({...result,plans:undefined,pairs:pairs.map(p=>({baseline:p.baseline.p95Ms,proposed:p.proposed.p95Ms}))}));
 return result;
}
async function compare(){
 assert.equal(await prisma.user.count(),0);
 // Validate the measured old SQL against the checked-out source, not a handwritten approximation.
 const source=execFileSync("git",["show",process.env.GAFUS_WALK_RISK_BASE_SHA+":packages/tracking-server/src/walksService.ts"],{encoding:"utf8"});
 const exact=source.match(/async function readWalkHistory[\s\S]*?\$queryRaw<WalkRow\[\]>\x60([\s\S]*?)\x60/);
 assert.equal(exact?.[1]?.trim().replaceAll("${ownerId}","$1"),baseline);
 await prisma.user.createMany({data:[owner,other].map(id=>({id,username:id,password:"synthetic"}))});
 for(let i=1;i<=2000;i+=100)await prisma.dogWalkRecord.createMany({data:Array.from({length:100},(_,j)=>fixture(i+j))});
 await prisma.dogWalkRecord.createMany({data:[fixture(2000,other),fixture(1999,other)]});
 const initialLoad=loadavg();
 const empty=await bench("empty-tombstones",expected(2000,new Set()));
 // 100 stale rows deliberately left alongside tombstones plus 150 deleted-only
 // markers, and same client IDs on a second owner. 2,100 owner rows, 2,000 visible.
 await prisma.dogWalkRecord.createMany({data:Array.from({length:100},(_,j)=>fixture(2001+j))});
 const excluded=new Set(Array.from({length:100},(_,j)=>2100-j));
 await prisma.dogWalkTombstone.createMany({data:[
  ...[...excluded,...Array.from({length:150},(_,j)=>3000+j)].map(i=>({userId:owner,clientId:clientId(i)})),
  {userId:other,clientId:clientId(2000)},
 ]});
 const realistic=await bench("250-owner-tombstones",expected(2100,excluded));
 assert.deepEqual((await read(false,other)).map(r=>r.clientId),[clientId(1999)]);
 assert.deepEqual(await read(false,other),await read(true,other));
 const reproduced=empty.scans.baseline.some(s=>s.loops>=2000);
 const onePass=[empty,realistic].every(r=>r.scans.proposed.length===1&&r.scans.proposed[0]!.loops===1);
 const result={sourceSha:process.env.GAFUS_WALK_RISK_BASE_SHA,pgVersion:await prisma.$queryRawUnsafe("SELECT version()"),cpu:cpus().length,initialLoad,concurrency:1,pairs:5,requestsPerArm:10,reproduced,onePass,empty,realistic};
 writeFileSync(report,JSON.stringify(result,null,2)+"\n");
 console.log("WALK_FULL_READ_COMPARE_PASS "+JSON.stringify({reproduced,onePass}));
}
async function verify(){
 const result=JSON.parse(readFileSync(report,"utf8"));
 const {walksRoutes}=await import("../../src/routes/v1/walks.js");
 const app=new Hono();app.use("*",async(c,next)=>{const actor=c.req.header("x-qa-owner");if(actor!==owner&&actor!==other)return c.json({success:false},401);c.set("user",{id:actor,role:"USER",username:"synthetic"});await next();});
 app.route("/walks",walksRoutes);
 const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
 await new Promise<void>((resolve,reject)=>{if(server.listening)resolve();else{server.once("listening",resolve);server.once("error",reject);}});
 try{
  const addr=server.address();assert.ok(addr&&typeof addr!=="string");const base="http://127.0.0.1:"+addr.port+"/walks";
  async function req(path="",actor=owner,method="GET",body?:unknown){const res=await fetch(base+path,{method,headers:{"x-qa-owner":actor,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(res.status,200);assert.match(res.headers.get("cache-control")??"",/no-store/);return (await res.json()).data;}
  const old=(await read(false)).map(dto);
  assert.deepEqual(await req(),old);
  assert.deepEqual(await req("?userId="+owner,other), (await read(false,other)).map(dto));
  const snapshot=await req("?view=changes");assert.deepEqual(snapshot.walks,old);assert.equal(snapshot.deleted.length,250);
  assert.deepEqual(await req("?view=changes&after="+snapshot.cursor),{reset:false,walks:[],deleted:[],cursor:snapshot.cursor,more:false});
  const victim=clientId(2000);
  const [during]=await Promise.all([req(),req("/"+victim,owner,"DELETE")]);
  assert.ok(during.length===1999||during.length===2000);
  const after=await req();assert.equal(after.length,1999);assert.ok(!after.some((r:Row)=>r.clientId===victim));
  assert.deepEqual(after,(await read(false)).map(dto));
  const stale=fixture(2000);const {userId:_,...payload}=stale;
  assert.deepEqual(await req("/sync?response=ack",owner,"PUT",{walks:[{...payload,startedAt:payload.startedAt.toISOString(),finishedAt:payload.finishedAt.toISOString()}]}),{accepted:[victim]});
  assert.deepEqual(await req(),after);
  const delta=await req("?view=changes&after="+snapshot.cursor);assert.deepEqual(delta.walks,[]);assert.deepEqual(delta.deleted,[victim]);
  assert.deepEqual(await req("?view=changes&after="+delta.cursor),{reset:false,walks:[],deleted:[],cursor:delta.cursor,more:false});
  assert.deepEqual(await req("/sync?response=ack",owner,"PUT",{walks:[]}),{accepted:[]});
  result.http={legacyParity:true,ownerIsolation:true,initialDeltaParity:true,staleRowsBeforeLimit:true,concurrentDelete:true,staleReplay:true,emptyRepeat:true};
  writeFileSync(report,JSON.stringify(result,null,2)+"\n");
  console.log("WALK_FULL_READ_HTTP_PASS "+JSON.stringify(result.http));
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
try{if(process.argv[2]==="compare")await compare();else if(process.argv[2]==="verify")await verify();else throw Error("invalid mode");}finally{await prisma.$disconnect();}
