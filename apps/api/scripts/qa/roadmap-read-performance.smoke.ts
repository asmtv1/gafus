import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API, "1");
assert.equal(db.hostname, "127.0.0.1");
assert.equal(db.username, "qaread");
assert.equal(db.pathname, "/gafus_roadmap_read_qa");
assert.equal(db.port, process.env.GAFUS_ROADMAP_READ_PG_PORT);
assert.match(process.env.GAFUS_ROADMAP_READ_PG_DIR??"", /^\/tmp\/gafus-roadmap-read-pg\.[A-Za-z0-9]+\/pg$/);
assert.equal(process.env.GAFUS_DB_QUERY_METRICS, "true");

const { prisma } = await import("@gafus/prisma");
const { createChatAvatars } = await import("../../src/modules/chat2/avatars.js");
const { createChatReads } = await import("../../src/modules/chat2/reads.js");
const { createChatAccess } = await import("../../src/modules/chat2/access.js");
const { getCoursesWithProgress, checkCourseAccessById } = await import("../../src/modules/courses/composition/catalog-read-instance.js");
const { getCatalogCardPage } = await import("../../src/modules/courses/composition/read-courses.js");
let statements = 0;
let sqlMs = 0;
(prisma as unknown as { $on: (event: "query", handler: (e: {duration:number}) => void) => void }).$on("query", e => {
  statements++; sqlMs += e.duration;
});
type Sample = { ms: number; statements: number; sqlMs: number; bytes: number; gzipBytes: number };
const quantile = (numbers: number[], q: number) => [...numbers].sort((a,b)=>a-b)[Math.ceil(numbers.length*q)-1]!;
function summarize(samples: Sample[]) {
  return {
    p50Ms: quantile(samples.map(s=>s.ms), .5), p95Ms: quantile(samples.map(s=>s.ms), .95),
    p99Ms: quantile(samples.map(s=>s.ms), .99), statements: [...new Set(samples.map(s=>s.statements))],
    medianSqlMs: quantile(samples.map(s=>s.sqlMs), .5), bytes: [...new Set(samples.map(s=>s.bytes))],
    gzipBytes: [...new Set(samples.map(s=>s.gzipBytes))],
  };
}
const actors = new Set<string>();
const access = createChatAccess(prisma);
let signingCalls = 0;
const sign = async (key: string, ttl: number) => {
  assert.equal(ttl,60); signingCalls++;
  return "https://qa.invalid/" + encodeURIComponent(key);
};
const avatars = createChatAvatars(prisma, sign);
const oldAvatars = createChatAvatars(prisma, sign);
const currentChat = createChatReads(prisma, access, avatars);
const legacyChat = createChatReads(prisma, access, {
  ...oldAvatars,
  // Historical discover read, same current room projection and DTO.
  roomAvatarUrls: async ids => {
    const pairs = await Promise.all(ids.map(async id => [id, await oldAvatars.roomAvatarUrl(id)] as const));
    return new Map(pairs.filter((p): p is readonly [string,string|null] => p[0] !== null));
  },
});
async function legacyCourseRooms(userId: string) {
  const rows = await prisma.course.findMany({
    where:{OR:[{isPrivate:false},{authorId:userId},{access:{some:{userId}}}]},
    select:{id:true,name:true,authorId:true},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:80,
  });
  const checked = await Promise.all(rows.map(async c=>({
    id:c.id,name:c.name,allowed:c.authorId===userId || (await checkCourseAccessById(c.id,userId)).hasAccess,
  })));
  return checked.filter(c=>c.allowed).map(({id,name})=>({id,name}));
}
const app = new Hono();
app.get("/:scenario", async c => {
  const user = c.req.header("x-qa-owner") ?? "";
  if (!actors.has(user)) return c.json({success:false},401);
  const scenario=c.req.param("scenario");
  if(scenario==="avatar-old") return c.json(await legacyChat.discover(user,c.req.query("search")));
  if(scenario==="avatar-new") return c.json(await currentChat.discover(user,c.req.query("search")));
  if(scenario==="rooms-old") return c.json(await legacyCourseRooms(user));
  if(scenario==="rooms-new") return c.json(await currentChat.accessibleCourseRooms(user));
  if(scenario==="catalog-old") return c.json(await getCoursesWithProgress(user));
  if(scenario==="catalog-new") {
    const id=c.req.query("id"), createdAt=c.req.query("createdAt");
    return c.json(await getCatalogCardPage(user,id&&createdAt?{id,createdAt:new Date(createdAt)}:undefined));
  }
  return c.json({success:false},404);
});
const server = serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
await new Promise<void>((resolve,reject)=>{
  if(server.listening) resolve(); else {server.once("listening",resolve);server.once("error",reject);}
});
const address=server.address();
assert.ok(address && typeof address!=="string");
const base="http://127.0.0.1:"+address.port;
async function request(path:string,actor:string) {
  const start=performance.now(), count=statements, sql=sqlMs;
  const res=await fetch(base+"/"+path,{headers:{"x-qa-owner":actor}});
  const body=await res.text();
  const ms=performance.now()-start;
  assert.equal(res.status,200,body.slice(0,100));
  return {data:JSON.parse(body),sample:{ms,statements:statements-count,sqlMs:sqlMs-sql,
    bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length}};
}
async function benchmark(oldPath:string,newPath:string,actor:string) {
  await request(oldPath,actor);await request(newPath,actor);
  const pairs=[];
  for(let pair=0;pair<5;pair++){
    const old:Sample[]=[], next:Sample[]=[];
    for(const isOld of pair%2===0?[true,false]:[false,true]){
      for(let i=0;i<10;i++) (isOld?old:next).push((await request(isOld?oldPath:newPath,actor)).sample);
    }
    pairs.push({legacy:summarize(old),candidate:summarize(next)});
  }
  return pairs;
}
type Card = { id:string; hasAccess:boolean; isFavorite:boolean; userStatus:string; startedAt:string|null; completedAt:string|null; startedUsersCount:number; reviewsCount?:number; reviews?:unknown[] };
type CatalogPage = {items:Card[];next:{id:string;createdAt:string}|null};
async function catalogParity(actor:string) {
  const legacy=(await request("catalog-old",actor)).data as Card[];
  let page=(await request("catalog-new",actor)).data as CatalogPage;
  const result=[...page.items];
  let pages=1;
  while(page.next){
    assert.ok(++pages<=5,"cursor must advance");
    page=(await request("catalog-new?"+new URLSearchParams(page.next),actor)).data as CatalogPage;
    assert.ok(page.items.length<=60);
    result.push(...page.items);
  }
  assert.equal(new Set(result.map(c=>c.id)).size,result.length,"no duplicate cursor results");
  const project=(c:Card)=>({id:c.id,hasAccess:c.hasAccess,isFavorite:c.isFavorite,userStatus:c.userStatus,
    startedAt:c.startedAt,completedAt:c.completedAt,startedUsersCount:c.startedUsersCount,
    reviewsCount:c.reviewsCount??c.reviews?.length});
  assert.deepEqual(result.map(project).sort((a,b)=>a.id.localeCompare(b.id)),
    legacy.map(project).sort((a,b)=>a.id.localeCompare(b.id)));
  return {visible:result.length,pages};
}
async function main(){
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
  const smallParity=await catalogParity(learner!.id);
  const smallCatalog=await benchmark("catalog-old","catalog-new",learner!.id);
  const smallRooms=await benchmark("rooms-old","rooms-new",learner!.id);
  await seedCourses(20,200);
  const roleParity=[];
  for(const user of users){
    const parity=await catalogParity(user.id);
    const old=(await request("rooms-old",user.id)).data;
    const next=(await request("rooms-new",user.id)).data;
    assert.deepEqual(next,old,"course rooms entitlement parity: "+user.username);
    roleParity.push({role:user.username, ...parity,rooms:next.length});
  }
  const catalog=await benchmark("catalog-old","catalog-new",learner!.id);
  // Deterministic budgets: SQL count must stay bounded as the catalog grows.
  assert.ok([...smallCatalog,...catalog].every(p=>p.candidate.statements.every(n=>n<=10)));
  assert.ok([...smallRooms].every(p=>p.candidate.statements.every(n=>n<=6)));
  assert.ok(catalog.every(p=>p.candidate.bytes.every(n=>n<Math.min(...p.legacy.bytes))));
  const rooms=await benchmark("rooms-old","rooms-new",learner!.id);
  assert.ok(rooms.every(pair=>Math.max(...pair.candidate.statements)<=6 && Math.max(...pair.candidate.statements)<Math.min(...pair.legacy.statements)));
  // Measure complete pagination as well: current clients may fetch every page.
  const fullCatalogPairs=[];
  async function completeCatalog(legacy:boolean) {
    const start=performance.now(); const counts=statements; const beforeSql=sqlMs;
    let bytes=0,gzipBytes=0;
    if(legacy){
      const {data,sample}=await request("catalog-old",learner!.id);
      assert.equal(data.length,180); bytes=sample.bytes;gzipBytes=sample.gzipBytes;
    }else{
      let cursor:CatalogPage["next"]=null, total=0, pages=0;
      do{
        const {data,sample}=await request("catalog-new"+(cursor?"?"+new URLSearchParams(cursor):""),learner!.id);
        const page=data as CatalogPage;
        total+=page.items.length;bytes+=sample.bytes;gzipBytes+=sample.gzipBytes;
        cursor=page.next;assert.ok(++pages<=4);
      }while(cursor);
      assert.equal(total,180);
    }
    return {ms:performance.now()-start,statements:statements-counts,sqlMs:sqlMs-beforeSql,bytes,gzipBytes};
  }
  for(let pair=0;pair<5;pair++){
    const a:Sample[]=[], b:Sample[]=[];
    for(const old of pair%2===0?[true,false]:[false,true]){
      for(let i=0;i<10;i++) (old?a:b).push(await completeCatalog(old));
    }
    fullCatalogPairs.push({legacy:summarize(a),candidate:summarize(b)});
  }
  assert.ok(fullCatalogPairs.every(p=>p.candidate.bytes.every(n=>n<Math.min(...p.legacy.bytes))));
  const first=(await request("catalog-new",learner!.id)).data as CatalogPage;
  const firstId=first.items[0]!.id;
  const before=await request("catalog-new",learner!.id);
  await prisma.courseReview.createMany({data:reviewerIds.slice(5).map(userId=>({courseId:firstId,userId,rating:3,comment:"large extra review ".repeat(200)}))});
  const after=await request("catalog-new",learner!.id);
  assert.equal(after.data.items[0].reviewsCount,105);
  assert.ok(after.sample.bytes-before.sample.bytes<=3);
  assert.ok(!JSON.stringify(after.data).includes("large extra review"));
  // Newer insertion during a cursor traversal must not duplicate or displace
  // rows from the previously loaded page (fixture includes equal timestamps).
  const inserted=await prisma.course.create({data:{...courseRows[199]!,
    id:"qa-new-top",type:"qa-new-top",createdAt:new Date("2026-11-02")}});
  let cursor=first.next;
  const traversed=[...first.items];
  while(cursor){
    const page=(await request("catalog-new?"+new URLSearchParams(cursor),learner!.id)).data as CatalogPage;
    traversed.push(...page.items);cursor=page.next;
    assert.ok(traversed.length<=180);
  }
  assert.equal(traversed.length,180);
  assert.equal(new Set(traversed.map(c=>c.id)).size,180);
  assert.ok(!traversed.some(c=>c.id===inserted.id));
  const refreshed=(await request("catalog-new",learner!.id)).data as CatalogPage;
  assert.equal(refreshed.items[0]!.id,inserted.id);
  await prisma.course.delete({where:{id:inserted.id}});
  const revoke=courseRows[190]!;
  assert.ok(revoke.isPrivate);
  const courseRoom=await prisma.chat2Conversation.create({data:{
    id:"qa-course-room-revocation",kind:"COURSE",visibility:"PRIVATE",scopeKey:revoke.id,
    members:{create:{userId:learner!.id,role:"MEMBER"}},
  }});
  assert.equal((await access.readGate(learner!.id,courseRoom.id)).conversationId,courseRoom.id);
  await prisma.courseAccess.deleteMany({where:{courseId:revoke.id,userId:learner!.id}});
  const afterRevoke=(await request("rooms-new",learner!.id)).data as {id:string}[];
  assert.ok(!afterRevoke.some(c=>c.id===revoke.id));
  await assert.rejects(access.readGate(learner!.id,courseRoom.id),
    (error:unknown)=> (error as {code?:string;status?:number}).code==="COURSE_ACCESS_REQUIRED" &&
      (error as {status?:number}).status===403);
  assert.deepEqual(afterRevoke,(await request("rooms-old",learner!.id)).data);
  const revokedPage=(await request("catalog-new",learner!.id)).data as CatalogPage;
  assert.ok(!revokedPage.items.some(c=>c.id===revoke.id));

  const avatarResults=[];
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
    const query="?search="+prefix;
    const beforeSigns=signingCalls;
    const old=await request("avatar-old"+query,learner!.id);
    const next=await request("avatar-new"+query,learner!.id);
    assert.deepEqual(next.data,old.data);assert.equal(next.data.length,size);
    assert.ok(next.data.every((room:{avatarUrl:string})=>room.avatarUrl?.startsWith("https://qa.invalid/")));
    assert.equal(signingCalls-beforeSigns,2*size);
    const warmBefore=signingCalls;
    const pairs=await benchmark("avatar-old"+query,"avatar-new"+query,learner!.id);
    assert.equal(signingCalls,warmBefore,"warm avatar signatures must be reused");
    assert.ok(pairs.every(p=>p.legacy.statements.every(n=>n===p.candidate.statements[0]!+size-1)));
    avatarResults.push({size,coldLegacy:old.sample,coldCandidate:next.sample,pairs});
  }
  // No avatar, repeated references, and missing/non-AVATAR metadata.
  await prisma.chat2Conversation.createMany({data:[
    {id:"qa-edge-empty",kind:"GROUP",visibility:"PUBLIC",name:"qa-edge-empty"},
    {id:"qa-edge-repeat-1",kind:"GROUP",visibility:"PUBLIC",name:"qa-edge-repeat-1",avatarMediaId:"qa-size-60-media-1"},
    {id:"qa-edge-repeat-2",kind:"GROUP",visibility:"PUBLIC",name:"qa-edge-repeat-2",avatarMediaId:"qa-size-60-media-1"},
    {id:"qa-edge-missing",kind:"GROUP",visibility:"PUBLIC",name:"qa-edge-missing",avatarMediaId:"qa-missing-id"},
  ]});
  const none=await request("avatar-new?search=qa-edge-empty",learner!.id);
  assert.equal(none.data[0].avatarUrl,null);assert.equal(none.sample.statements,2);
  const edgeBeforeSigns=signingCalls;
  const edge=await request("avatar-new?search=qa-edge-",learner!.id);
  assert.equal(edge.data.length,4);assert.equal(edge.sample.statements,3);
  assert.equal(signingCalls,edgeBeforeSigns);
  assert.equal(edge.data.find((r:{id:string})=>r.id==="qa-edge-missing").avatarUrl,null);
  assert.equal(edge.data.find((r:{id:string})=>r.id==="qa-edge-repeat-1").avatarUrl,
    edge.data.find((r:{id:string})=>r.id==="qa-edge-repeat-2").avatarUrl);
  await prisma.chat2Media.update({where:{id:"qa-size-60-media-1"},data:{objectKey:"qa-replaced-avatar"}});
  const updated=await request("avatar-new?search=qa-edge-repeat",learner!.id);
  assert.ok(updated.data.every((r:{avatarUrl:string})=>r.avatarUrl==="https://qa.invalid/qa-replaced-avatar"));
  await prisma.chat2Media.update({where:{id:"qa-size-60-media-0"},data:{status:"DELETED"}});
  const revoked=(await request("avatar-new?search=qa-size-60-",learner!.id)).data as {id:string;avatarUrl:string|null}[];
  assert.equal(revoked.find(r=>r.id==="qa-size-60-0")?.avatarUrl,null);
  console.log("ROADMAP_READ_PERFORMANCE_PASS "+JSON.stringify({scope:"loopback Hono + real PG; synthetic signer; current legacy/candidate paths",smallParity,roleParity,smallCatalog,smallRooms,catalog,fullCatalogPairs,rooms,reviewGrowth:{before:before.sample.bytes,after:after.sample.bytes},avatarResults}));
}
try { await main(); }
finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect(); }
