import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {Hono} from "hono";
import {serve} from "@hono/node-server";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,"1");
assert.deepEqual([db.protocol,db.hostname,db.username,db.pathname,db.port],
  ["postgresql:","127.0.0.1","qaread","/gafus_roadmap_read_qa",process.env.GAFUS_ROADMAP_READ_PG_PORT]);
assert.match(process.env.GAFUS_ROADMAP_READ_PG_DIR??"", /^\/tmp\/gafus-roadmap-read-pg\.[A-Za-z0-9]+\/pg$/);
assert.equal(process.env.GAFUS_DB_QUERY_METRICS,"true");
const {prisma}=await import("@gafus/prisma");
const historical=await import("./roadmap-historical-slices.generated.js");
const {createChatAvatars}=await import("../../src/modules/chat2/avatars.js");
const {createChatReads}=await import("../../src/modules/chat2/reads.js");
const {createChatAccess}=await import("../../src/modules/chat2/access.js");
const {getCatalogCardPage}=await import("../../src/modules/courses/composition/read-courses.js");
const {walksRoutes}=await import("../../src/routes/v1/walks.js");
type Event={query:string;params:string;duration:number};
let events:Event[]=[];
(prisma as unknown as {$on:(event:"query",handler:(e:Event)=>void)=>void}).$on("query",e=>events.push(e));
const psql=(sql:string)=>execFileSync("psql",["-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",db.port,"-U","qaread","-d","gafus_roadmap_read_qa","-c",sql],{encoding:"utf8",maxBuffer:8*1024*1024}).trim();
const actors=new Set<string>();
const currentChat=createChatReads(prisma,createChatAccess(prisma),createChatAvatars(prisma,async(key,ttl)=>{
  assert.equal(ttl,60);return "https://qa.invalid/"+encodeURIComponent(key);
}));
const app=new Hono();
app.use("*",async(c,next)=>{
  const actor=c.req.header("x-qa-owner")??"";
  if(!actors.has(actor))return c.json({success:false},401);
  c.set("user",{id:actor,role:"USER",username:"synthetic"});
  await next();
});
app.get("/avatar-old",async c=>c.json(await historical.discover(c.get("user").id,c.req.query("search"))));
app.get("/avatar-new",async c=>c.json(await currentChat.discover(c.get("user").id,c.req.query("search"))));
app.get("/rooms-old",async c=>c.json(await historical.accessibleCourseRooms(c.get("user").id)));
app.get("/rooms-new",async c=>c.json(await currentChat.accessibleCourseRooms(c.get("user").id)));
app.get("/catalog-old",async c=>c.json(await historical.getCoursesWithProgress(c.get("user").id)));
app.get("/catalog-new",async c=>{
  const id=c.req.query("id"),createdAt=c.req.query("createdAt");
  return c.json(await getCatalogCardPage(c.get("user").id,id&&createdAt?{id,createdAt:new Date(createdAt)}:undefined));
});
app.get("/walk-old",async c=>c.json({success:true,data:await historical.listCompletedDogWalks(c.get("user").id)}));
app.put("/walk-old/sync",async c=>{
  assert.deepEqual(await c.req.json(),{walks:[]});
  return c.json({success:true,data:await historical.syncCompletedDogWalks(c.get("user").id,[])});
});
app.route("/walk-new",walksRoutes);
const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
await new Promise<void>((resolve,reject)=>{if(server.listening)resolve();else{server.once("listening",resolve);server.once("error",reject);}});
const address=server.address();assert.ok(address&&typeof address!=="string");
const base="http://127.0.0.1:"+address.port;
type Sample={ms:number;sqlStatements:number;sqlMs:number;bytes:number;gzipBytes:number};
async function request(path:string,actor:string,body?:unknown){
  const start=performance.now(),offset=events.length;
  const response=await fetch(base+path,{method:body===undefined?"GET":"PUT",headers:{"x-qa-owner":actor,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const raw=await response.text(),ms=performance.now()-start;
  assert.equal(response.status,200,raw.slice(0,200));
  const sql=events.slice(offset);
  return {data:JSON.parse(raw),sample:{ms,sqlStatements:sql.length,sqlMs:sql.reduce((sum,e)=>sum+e.duration,0),bytes:Buffer.byteLength(raw),gzipBytes:gzipSync(raw).length}};
}
type RequestResult=Awaited<ReturnType<typeof request>>;
type Arm=()=>Promise<RequestResult>;
const q=(xs:number[],p:number)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]!;
const pgStats=()=>JSON.parse(psql(`SELECT COALESCE(json_agg(row_to_json(s)),'[]'::json) FROM (
SELECT query,calls::int,rows::int,shared_blks_hit::int,shared_blks_read::int,total_exec_time
FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
AND query !~* 'pg_stat_statements|pg_database' ORDER BY query) s`)) as {query:string;calls:number;rows:number;shared_blks_hit:number;shared_blks_read:number;total_exec_time:number}[];
function summarize(samples:Sample[]){
  const stats=pgStats();
  const reads=stats.filter(s=>/^\s*(SELECT|WITH)\b/i.test(s.query));
  const sum=(key:"calls"|"rows"|"shared_blks_hit"|"shared_blks_read")=>reads.reduce((n,s)=>n+s[key],0)/samples.length;
  return {p95Ms:q(samples.map(s=>s.ms),.95),p50Ms:q(samples.map(s=>s.ms),.5),statements:[...new Set(samples.map(s=>s.sqlStatements))],rowsPerRequest:sum("rows"),readCallsPerRequest:sum("calls"),sharedHitsPerRequest:sum("shared_blks_hit"),sharedReadsPerRequest:sum("shared_blks_read"),bytes:[...new Set(samples.map(s=>s.bytes))],gzipBytes:[...new Set(samples.map(s=>s.gzipBytes))],stats};
}
const literal=(v:unknown):string=>{
  if(v===null)return "NULL";
  if(typeof v==="number"&&Number.isFinite(v))return String(v);
  if(typeof v==="boolean")return v?"TRUE":"FALSE";
  if(typeof v==="string")return "'"+v.replaceAll("'","''")+"'";
  if(Array.isArray(v))return "ARRAY["+v.map(literal).join(",")+"]";
  throw Error("unsupported parameter");
};
async function explain(arm:Arm){
  events=[];await arm();
  const distinct=new Map<string,Event>();for(const e of events.filter(e=>/^\s*(SELECT|WITH)\b/i.test(e.query)))if(!distinct.has(e.query))distinct.set(e.query,e);
  return [...distinct.values()].slice(0,20).map(e=>{
    try{
      const params=JSON.parse(e.params) as unknown[];
      const sql=e.query.replace(/\$(\d+)/g,(_,n)=>literal(params[Number(n)-1]));
      return {query:e.query,plan:JSON.parse(psql("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+sql))};
    }catch(error){return {query:e.query,error:String(error)};}
  });
}
async function benchmark(name:string,old:Arm,next:Arm){
  await old();await next();
  const pairs=[];
  for(let pair=0;pair<5;pair++){
    const result={} as Record<"historicalSlice"|"candidate",ReturnType<typeof summarize>>;
    for(const key of (pair%2===0?["historicalSlice","candidate"]:["candidate","historicalSlice"]) as ("historicalSlice"|"candidate")[]){
      psql("SELECT pg_stat_statements_reset()");
      const samples:Sample[]=[];
      for(let i=0;i<10;i++){events=[];samples.push((await (key==="historicalSlice"?old:next)()).sample);}
      result[key]=summarize(samples);
    }
    pairs.push(result);
  }
  const compact=(a:ReturnType<typeof summarize>)=>({p95Ms:a.p95Ms,statements:a.statements,rows:a.rowsPerRequest,bytes:a.bytes});
  console.log("BASELINE_PAIR_RESULT "+JSON.stringify({name,pairs:pairs.map(p=>({historicalSlice:compact(p.historicalSlice),candidate:compact(p.candidate)}))}));
  return {name,pairs,explain:{historicalSlice:await explain(old),candidate:await explain(next)}};
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


async function main(){
  assert.equal(await prisma.user.count(),0);
  console.log("PG_VERSION "+psql("SHOW server_version"));
  const users=await Promise.all(["learner","trainer","partner","premium","expired","outsider"].map((username,i)=>
    prisma.user.create({data:{username:"qa_"+username,password:"synthetic",role:i===1?"TRAINER":i===2?"PARTNER":"USER"}})));
  users.forEach(u=>actors.add(u.id));
  const [learner,trainer,partner,premium,expired,outsider]=users;
  await prisma.appFeatureFlag.create({data:{key:"app_subscription_gating_enabled",enabled:true}});
  await prisma.appSubscription.createMany({data:[{userId:premium!.id,provider:"MANUAL",status:"ACTIVE",currentPeriodEnd:new Date(Date.now()+86400_000)},
    {userId:expired!.id,provider:"MANUAL",status:"ACTIVE",currentPeriodEnd:new Date(Date.now()-86400_000)}]});
  const reviewerIds=Array.from({length:105},(_,i)=>"qa-reviewer-"+i);
  await prisma.user.createMany({data:reviewerIds.map(id=>({id,username:id,password:"synthetic"}))});
  const courseRows=Array.from({length:200},(_,i)=>({
    id:"qa-course-"+String(i).padStart(3,"0"), name:"Synthetic course "+i,type:"qa-course-"+i,
    authorId:i%17===0?learner!.id:trainer!.id,trainingLevel:"BEGINNER" as const,
    duration:"10 days",logoImg:"/qa.png",description:"Synthetic course description",shortDesc:"Synthetic summary",
    isPrivate:i%5===0,isPaid:i%3===0,createdAt:new Date(Date.UTC(2026,10,1)+Math.floor(i/4)*1000),
  }));
  await prisma.trainingDay.createMany({data:Array.from({length:5},(_,i)=>({id:"qa-day-"+i,title:"QA day "+i,authorId:trainer!.id}))});
  await prisma.step.createMany({data:Array.from({length:10},(_,i)=>({id:"qa-step-"+i,title:"QA step "+i,authorId:trainer!.id}))});
  await prisma.stepOnDay.createMany({data:Array.from({length:5},(_,i)=>Array.from({length:10},(_,j)=>({dayId:"qa-day-"+i,stepId:"qa-step-"+j,order:j+1}))).flat()});
  async function seedCourses(from:number,to:number){
    const batch=courseRows.slice(from,to);
    await prisma.course.createMany({data:batch});
    await prisma.dayOnCourse.createMany({data:batch.flatMap(c=>Array.from({length:5},(_,i)=>({courseId:c.id,dayId:"qa-day-"+i,order:i+1})))});
    await prisma.courseReview.createMany({data:batch.flatMap(c=>reviewerIds.slice(0,5).map(userId=>({courseId:c.id,userId,rating:4,comment:"synthetic review ".repeat(16)})))});
    await prisma.courseAccess.createMany({data:batch.filter((c)=>c.isPrivate).flatMap(c=>[
      {courseId:c.id,userId:outsider!.id}, ...(Number(c.id.slice(-3))%10===0?[{courseId:c.id,userId:learner!.id}]:[]),
    ])});
    await prisma.favoriteCourse.createMany({data:batch.filter((_,i)=>i%7===0).map(c=>({courseId:c.id,userId:learner!.id}))});
    await prisma.userCourse.createMany({data:batch.filter((_,i)=>i%6===0).map(c=>({courseId:c.id,userId:learner!.id,status:"IN_PROGRESS",startedAt:new Date("2026-11-01")}))});
  }

  await seedCourses(0,20);
  await seedCourses(20,200);
  for(const size of [1,10,60]){
    const prefix="qa-size-"+size+"-";
    await prisma.chat2Conversation.createMany({data:Array.from({length:size},(_,i)=>({
      id:prefix+i,kind:"GROUP",visibility:"PUBLIC",name:prefix+i,createdById:trainer!.id,
      avatarMediaId:prefix+"media-"+i,createdAt:new Date(Date.UTC(2026,10,1)+i*1000),
    }))});
    await prisma.chat2Media.createMany({data:Array.from({length:size},(_,i)=>({
      id:prefix+"media-"+i,conversationId:prefix+i,ownerId:trainer!.id,objectKey:prefix+"key-"+i,
      name:"avatar.webp",kind:"IMAGE",mime:"image/webp",bytes:1000,status:"AVATAR",
    }))});

  }
  const walkOwner=await prisma.user.create({data:{username:"walk_delta_owner",password:"synthetic-disposable"}});
  actors.add(walkOwner.id);
  const fixtures=Array.from({length:2000},(_,i)=>fixtureWalk(i+1));
  for(let i=0;i<fixtures.length;i+=100){
    const ack=await request("/walk-new/sync?response=ack",walkOwner.id,{walks:fixtures.slice(i,i+100)});
    assert.equal(ack.data.data.accepted.length,100);
  }
  const initial=await request("/walk-new?view=changes",walkOwner.id);
  const cursor=initial.data.data.cursor;
  assert.equal(initial.data.data.walks.length,2000);
  assert.equal(await prisma.dogWalkChange.count({where:{userId:walkOwner.id}}),2000);
  psql("ANALYZE");
  const actor=learner!.id;
  const req=(path:string,owner=actor,body?:unknown):Arm=>()=>request(path,owner,body);
  const avatarsOld=req("/avatar-old?search=qa-size-60-"),avatarsNew=req("/avatar-new?search=qa-size-60-");
  assert.deepEqual((await avatarsOld()).data,(await avatarsNew()).data);
  assert.equal((await avatarsNew()).data.length,60);
  const roomsOld=req("/rooms-old"),roomsNew=req("/rooms-new");
  const ro=(await roomsOld()).data as {id:string;name:string}[];
  const rn=(await roomsNew()).data as {id:string;name:string}[];
  const sorted=(xs:{id:string;name:string}[])=>[...xs].sort((a,b)=>a.id.localeCompare(b.id));
  const roomsParity={oldCount:ro.length,newCount:rn.length,sameSet:JSON.stringify(sorted(ro))===JSON.stringify(sorted(rn)),sameOrder:JSON.stringify(ro)===JSON.stringify(rn)};
  const catalogOld=req("/catalog-old"),catalogNew=req("/catalog-new");
  const all=(await catalogOld()).data;
  assert.equal(all.length,180);
  const page=(await catalogNew()).data;
  assert.equal(page.items.length,60);
  async function fullCatalog():Promise<RequestResult>{
    let cursor:{id:string;createdAt:string}|null=null;
    const samples:Sample[]=[];const data:any[]=[];
    const start=performance.now();
    do{
      const next=await request("/catalog-new"+(cursor?"?"+new URLSearchParams(cursor):""),actor);
      samples.push(next.sample);data.push(...next.data.items);cursor=next.data.next;
      assert.ok(samples.length<=4);
    }while(cursor);
    return {data,sample:{ms:performance.now()-start,sqlStatements:samples.reduce((s,x)=>s+x.sqlStatements,0),sqlMs:samples.reduce((s,x)=>s+x.sqlMs,0),bytes:samples.reduce((s,x)=>s+x.bytes,0),gzipBytes:samples.reduce((s,x)=>s+x.gzipBytes,0)}};
  }
  const full=await fullCatalog();
  const project=(c:any)=>({id:c.id,hasAccess:c.hasAccess,isFavorite:c.isFavorite,userStatus:c.userStatus,startedAt:c.startedAt,completedAt:c.completedAt,startedUsersCount:c.startedUsersCount,reviewsCount:c.reviewsCount??c.reviews?.length});
  assert.deepEqual(full.data.map(project).sort((a,b)=>a.id.localeCompare(b.id)),all.map(project).sort((a:any,b:any)=>a.id.localeCompare(b.id)));
  const walkOld=req("/walk-old",walkOwner.id),walkNew=req("/walk-new",walkOwner.id);
  const emptyRead=req("/walk-new?view=changes&after="+cursor,walkOwner.id);
  const emptyOld=req("/walk-old/sync",walkOwner.id,{walks:[]}),emptyNew=req("/walk-new/sync?response=ack",walkOwner.id,{walks:[]});
  assert.deepEqual((await walkOld()).data,(await walkNew()).data);
  assert.deepEqual((await emptyRead()).data.data,{reset:false,walks:[],deleted:[],cursor,more:false});
  assert.deepEqual((await emptyNew()).data.data,{accepted:[]});
  const results=[];
  for(const [name,a,b] of [
    ["avatars60",avatarsOld,avatarsNew],["rooms80",roomsOld,roomsNew],
    ["catalog200-first-page",catalogOld,catalogNew],["catalog200-full-traversal",catalogOld,fullCatalog],
    ["walk2000-full-read",walkOld,walkNew],["walk2000-empty-delta",walkOld,emptyRead],["walk2000-empty-put",emptyOld,emptyNew],
  ] as [string,Arm,Arm][]) results.push(await benchmark(name,a,b));
  const report={historicalSource:"b9bfc537f18610afe81016440ed9cd33dacc3229",candidate:process.env.GAFUS_BASELINE_CANDIDATE_SHA,
    scope:"historical source slices with shared current runtime/Prisma and real PG; not independently built historical release",
    database:psql("SHOW server_version"),settings:{concurrency:1,poolLimit:8,pairs:5,requestsPerArm:10,sharedBuffers:"32MB"},
    fixtures:{courses:200,visible:180,roomCandidates:80,avatars:60,walks:2000,roomsParity},results};
  writeFileSync(process.env.GAFUS_BASELINE_REPORT_PATH!,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
}
try{await main();}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect();}
