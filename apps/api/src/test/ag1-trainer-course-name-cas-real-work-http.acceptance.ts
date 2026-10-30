/** Actual original Hono TCP HTTP (ephemeral localhost, never shared API3001) + stock auth login + WORK PG Course CAS. */
import { randomBytes } from "node:crypto";
import {once} from "node:events";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const PREFIX="ag1_trainer_cas_work_http_20261025_"+randomBytes(5).toString("hex");
const ids:{owner?:string,foreign?:string,course?:string}={};
let phase="START";
function ok(v:unknown,reason:string):asserts v{if(!v)throw Error("AG1_TRAINER_CAS_"+reason);}
function o(v:unknown):Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function pass(v:string){console.warn("AG1_TRAINER_CAS_ORIGINAL_HTTP_WORK "+v+"=PASS");}
async function main(){
 ok(process.env.AG1_TRAINER_CAS_WORK_HTTP==="1","EXPLICIT_OWNER_OPT_IN");
 ok(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","PHYSICAL_PROJECT_ROOT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");
 ok(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","WORK_PG_ONLY");
 ok(process.env.REDIS_URL==="redis://127.0.0.1:55927/1","ISOLATED_REDIS_ONLY");
 for(const [key,file] of [["JWT_SECRET","hono-local-access.secret"],["JWT_REFRESH_SECRET","hono-local-refresh.secret"]] as const){
  const path=ROOT+"/.local-pg-scratch/"+file;
  ok(realpathSync(path)===path&&(statSync(path).mode&0o777)===0o600,"PRIVATE_KEY_ONLY");
  process.env[key]=readFileSync(path,"utf8").trim();
 }
 phase="IMPORT_ORIGINAL_APP";
 const [{app},{serve}]=await Promise.all([import("../app.js"),import("@hono/node-server")]);
 phase="EPHEMERAL_LISTENER";
 const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
 try {
  if(!server.listening)await once(server,"listening");
  const addr=server.address();ok(addr&&typeof addr!=="string"&&addr.port>0&&addr.port!==3001,"EPHEMERAL_PRIVATE_PORT");
  const url="http://127.0.0.1:"+addr.port+"/api/v1";
  async function http(path:string,method="GET",token?:string,body?:unknown){
   const res=await fetch(url+path,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
   const payload=o(await res.json());
   return {status:res.status,body:payload,headers:res.headers};
  }
  phase="ORIGINAL_PUBLIC_HTTP";
  const health=await http("/public/courses");ok(health.status===200,"ORIGINAL_REGISTERED_HONO_TCP_REAL_HTTP");pass("UNMOCKED_ORIGINAL_HONO_EPHEMERAL_TCP");
  const baseline=await prisma.$queryRaw<{users:bigint,courses:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "Course") AS courses`;
  const baselineUsers=Number(baseline[0]?.users),baselineCourses=Number(baseline[0]?.courses);
  async function addTrainer(label:"owner"|"foreign"){
   const password=randomBytes(26).toString("base64url");
   const row=await prisma.user.create({data:{username:PREFIX+"_"+label,role:"TRAINER",password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false}});
   ids[label]=row.id;
   const auth=await http("/auth/login","POST",undefined,{username:row.username,password});
   const token=o(auth.body.data).accessToken;
   ok(auth.status===200&&auth.body.success===true&&typeof token==="string"&&token.length>30,"ACTUAL_ORIGINAL_AUTH_LOGIN");
   return {id:row.id,token};
  }
  phase="ORIGINAL_AUTH_LOGIN";
  const owner=await addTrainer("owner");const foreign=await addTrainer("foreign");
  pass("TWO_STOCK_HTTP_LOGINS_REAL_JWT_ROLES");
  phase="SYNTHETIC_COURSE_CREATE";
  const course=await prisma.course.create({data:{type:PREFIX,name:"CAS baseline",shortDesc:"Private synthetic acceptance",description:"Synthetic isolated WORK only",duration:"1 week",logoImg:"",trainingLevel:"BEGINNER",isPrivate:true,isPaid:false,authorId:owner.id}});
  ids.course=course.id;
  const basePath="/trainer/courses/"+course.id;
  phase="SIGNED_OWNER_VERSION_GET";
  const read=await http(basePath+"/version","GET",owner.token);
  ok(read.status===200&&o(read.body.data).name==="CAS baseline"&&o(read.body.data).version===1,"OWNER_GET_VERSION1");
  ok(read.headers.get("cache-control")?.includes("no-store")&&read.headers.get("referrer-policy")==="no-referrer","PRIVATE_HEADERS");pass("OWNER_GET_SQL_VERSION1_PRIVACY");
  const foreignRead=await http(basePath+"/version","GET",foreign.token);
  ok(foreignRead.status===404&&foreignRead.body.code==="NOT_FOUND","FOREIGN_READ_MASKED");pass("FOREIGN_READ_404");
  const denied=await http(basePath+"/name","PATCH",foreign.token,{name:"Wrong-owner mutation",expectedVersion:1});
  ok(denied.status===404&&denied.body.code==="NOT_FOUND","FOREIGN_WRITE_MASKED");pass("FOREIGN_PATCH_404_NO_WRITE");
  phase="SIGNED_OWNER_NAME_PATCH";
  const updated=await http(basePath+"/name","PATCH",owner.token,{name:"CAS name changed",expectedVersion:1});
  const row=o(updated.body.data);
  ok(updated.status===200&&updated.body.success===true&&row.name==="CAS name changed"&&row.version===2,"ORIGINAL_PATCH_VERSION2");pass("OWNER_PATCH_SQL_TRIGGER_VERSION2");
  const check=await prisma.course.findUnique({where:{id:course.id},select:{authorId:true,name:true,version:true}});
  ok(check?.authorId===owner.id&&check.name==="CAS name changed"&&check.version===2,"SQL_POST_PATCH_OWNER_NAME_VERSION");pass("INDEPENDENT_WORK_SQL_RECONCILE");
  const stale=await http(basePath+"/name","PATCH",owner.token,{name:"STALE MUST NOT COMMIT",expectedVersion:1});
  ok(stale.status===409&&stale.body.code==="STALE_VERSION","STALE_HTTP409");
  const replay=await http(basePath+"/name","PATCH",owner.token,{name:"CAS name changed",expectedVersion:1});
  ok(replay.status===409&&replay.body.code==="STALE_VERSION","REPLAY_IS_STALE_NO_IDEMPOTENCY_CONTRACT");
  const afterStale=await prisma.course.findUnique({where:{id:course.id},select:{name:true,version:true}});
  ok(afterStale?.name==="CAS name changed"&&afterStale.version===2,"STALE_SQL_NO_OVERWRITE");pass("STALE_REPLAY_409_SQL_UNCHANGED");
  const afterGet=await http(basePath+"/version","GET",owner.token);
  ok(afterGet.status===200&&o(afterGet.body.data).name==="CAS name changed"&&o(afterGet.body.data).version===2,"OWNER_GET_AFTER_PATCH");pass("OWNER_GET_AFTER_CAS_VERSION2");
  const ownerMasked=await http(basePath+"/name","PATCH",owner.token,{name:"Attempt tampering",expectedVersion:2,authorId:foreign.id});
  ok(ownerMasked.status===400&&ownerMasked.body.code==="BAD_QUERY","ACTOR_FIELD_DENIED");pass("ACTOR_BODY_INJECTION_400_NO_SQL_MUTATION");
  const final=await prisma.course.findUnique({where:{id:course.id},select:{name:true,version:true}});
  ok(final?.name==="CAS name changed"&&final.version===2,"FINAL_OWN_COURSE_INTEGRITY");
  pass("ORIGINAL_SIGNED_TRAINER_NAME_CAS_TCP_HTTP_REAL_WORK_ACCEPTED");
  // Baseline is rechecked by the outer finally after deleting only the exactly owned synthetic ids.
  await cleanup();
  phase="POST_CLEANUP_SQL_COUNTS";
  const after=await prisma.$queryRaw<{users:bigint,courses:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "Course") AS courses`;
  ok(Number(after[0]?.users)===baselineUsers&&Number(after[0]?.courses)===baselineCourses,"WORK_USER_COURSE_COUNTS_RESTORED");
  pass("SYNTHETIC_OWN_ROWS_REMOVED_FOREIGN_COUNTS_UNCHANGED");
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
async function cleanup(){
 if(ids.course&&ids.owner){
  const row=await prisma.course.findUnique({where:{id:ids.course},select:{authorId:true,type:true}});
  if(row?.authorId===ids.owner&&row.type===PREFIX)await prisma.course.deleteMany({where:{id:ids.course,authorId:ids.owner,type:PREFIX}});
 }
 for(const label of ["foreign","owner"] as const){const id=ids[label];if(!id)continue;
  const row=await prisma.user.findUnique({where:{id},select:{username:true}});
  if(row?.username===PREFIX+"_"+label)await prisma.user.delete({where:{id}});
 }
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_TRAINER_CAS_ACCEPTANCE_FAILED_PHASE="+phase+";ERROR="+(e instanceof Error&&e.message.startsWith("AG1_TRAINER_CAS_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{
 try{await cleanup();}catch(e){console.error("AG1_TRAINER_CAS_EXACT_OWNER_CLEANUP_FAILED_"+(e instanceof Error?e.name:"UNKNOWN"));process.exitCode=1;}
 try{await prisma.$disconnect();}catch{console.error("AG1_TRAINER_CAS_PRISMA_DISCONNECT_FAILED");process.exitCode=1;}
 try{const {connection}=await import("@gafus/queues");connection.disconnect();}catch{console.error("AG1_TRAINER_CAS_ISOLATED_REDIS_DISCONNECT_FAILED");process.exitCode=1;}
 // Self-contained OneShot only: stop our ephemeral test process after own SQL cleanup and port close.
 process.exit(process.exitCode??0);
});
