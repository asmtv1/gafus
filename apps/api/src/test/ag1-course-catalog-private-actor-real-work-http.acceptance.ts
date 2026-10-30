/** Genuine original Hono private /courses per-actor projection + WORK SQL; ephemeral TCP only. */
import {randomBytes} from "node:crypto";
import {once} from "node:events";
import {readFileSync,realpathSync,statSync} from "node:fs";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const TAG="ag1_privcat_"+randomBytes(5).toString("hex");
const own:{ids:string[],courses:string[]}={ids:[],courses:[]};
let stage="PRECHECK";
function check(v:unknown,k:string):asserts v{if(!v)throw Error("AG1_COURSE_PRIVACY_"+k);}
function object(v:unknown):Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function pass(n:string){console.warn("AG1_COURSE_CATALOG_GENUINE_HTTP_WORK "+n+"=PASS");}
async function cleanup(){
 for(const id of own.courses){const row=await prisma.course.findUnique({where:{id},select:{type:true,authorId:true}});
  if(row?.type.startsWith(TAG)&&row.authorId===own.ids[0])await prisma.course.deleteMany({where:{id,authorId:own.ids[0],type:row.type}});
 }
 for(const id of [...own.ids].reverse()){
  const row=await prisma.user.findUnique({where:{id},select:{username:true}});
  if(row?.username.startsWith(TAG))await prisma.user.deleteMany({where:{id,username:row.username}});
 }
}
async function main(){
 check(process.env.AG1_COURSE_PRIVATE_CATALOG_WORK_HTTP==="1","OPT_IN");
 check(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","OWN_PROJECT");
 const url=new URL(process.env.DATABASE_URL??"");
 check(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.username==="gafus_refactor_local_real"&&url.pathname==="/gafus_refactor_real_work_20261024","WORK_ONLY");
 check(process.env.REDIS_URL==="redis://127.0.0.1:55927/1","OWN_REDIS");
 for(const [k,file] of [["JWT_SECRET","hono-local-access.secret"],["JWT_REFRESH_SECRET","hono-local-refresh.secret"]] as const){
  const path=ROOT+"/.local-pg-scratch/"+file;
  check(realpathSync(path)===path&&(statSync(path).mode&0o777)===0o600,"PRIVATE_JWT_CONFIG");
  process.env[k]=readFileSync(path,"utf8").trim();
 }
 stage="IMPORT_REAL_HONO";
 const [{app},{serve}]=await Promise.all([import("../app.js"),import("@hono/node-server")]);
 const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
 try{
  if(!server.listening)await once(server,"listening");
  const address=server.address();check(address&&typeof address!=="string"&&address.port>0&&address.port!==3001,"ISOLATED_LISTENER");
  const api="http://127.0.0.1:"+address.port+"/api/v1";
  async function req(path:string,token?:string,body?:unknown){
   const res=await fetch(api+path,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
   return {status:res.status,data:object(await res.json()),cache:res.headers.get("cache-control")??""};
  }
  stage="SQL_BASELINE";
  const base=await prisma.$queryRaw<{users:bigint,courses:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "Course") AS courses`;
  const usersBefore=Number(base[0]?.users),coursesBefore=Number(base[0]?.courses);
  async function actor(role:"TRAINER"|"USER",label:string){
   const password=randomBytes(24).toString("base64url");
   const u=await prisma.user.create({data:{username:TAG+"_"+label,role,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false}});
   own.ids.push(u.id);
   const a=await req("/auth/login",undefined,{username:u.username,password});
   const token=object(a.data.data).accessToken;
   check(a.status===200&&a.data.success===true&&typeof token==="string"&&token.length>30,"STOCK_JWT_LOGIN");
   return {id:u.id,token};
  }
  stage="SIGNED_AUTH_USERS";
  const owner=await actor("TRAINER","author");const a=await actor("USER","a");const b=await actor("USER","b");
  pass("THREE_REAL_SIGNED_ORIGINAL_LOGINS");
  async function course(label:string,privateCourse:boolean){
   const c=await prisma.course.create({data:{type:TAG+"_"+label,authorId:owner.id,name:"Catalog synthetic "+label,shortDesc:"Synthetic",description:"WORK only",duration:"7 days",logoImg:"",trainingLevel:"BEGINNER",isPrivate:privateCourse,isPaid:false}});
   own.courses.push(c.id);return c;
  }
  const pub=await course("public",false);
  const hidden=await course("private",true);
  await prisma.favoriteCourse.create({data:{userId:a.id,courseId:pub.id}});
  await prisma.favoriteCourse.create({data:{userId:b.id,courseId:pub.id}});
  await prisma.courseAccess.create({data:{userId:a.id,courseId:hidden.id}});
  stage="ORIGINAL_SIGNED_CATALOG_READ";
  const guest=await req("/courses");check(guest.status===401,"GUEST_PROTECTED");pass("UNSIGNED_401");
  const [catalogA,catalogB]=await Promise.all([req("/courses",a.token),req("/courses",b.token)]);
  check(catalogA.status===200&&catalogB.status===200&&catalogA.cache.includes("private")&&catalogA.cache.includes("no-store")&&catalogB.cache.includes("no-store"),"PRIVATE_200_NOSTORE");
  const rowsA=catalogA.data.data,rowsB=catalogB.data.data;
  check(Array.isArray(rowsA)&&Array.isArray(rowsB),"CATALOG_ARRAYS");
  const publicA=rowsA.find(x=>object(x).id===pub.id),publicB=rowsB.find(x=>object(x).id===pub.id);
  check(publicA&&publicB,"PUBLIC_VISIBLE_TO_BOTH");
  check(object(publicA).isFavorite===true&&object(publicB).isFavorite===true,"OWN_IS_FAVORITE_DERIVED");
  const favA=object(publicA).favoritedBy,favB=object(publicB).favoritedBy;
  check(Array.isArray(favA)&&favA.length===1&&object(favA[0]).userId===a.id,"ACTOR_A_ONLY_FAVORITE");
  check(Array.isArray(favB)&&favB.length===1&&object(favB[0]).userId===b.id,"ACTOR_B_ONLY_FAVORITE");
  check(!JSON.stringify(publicA).includes(b.id)&&!JSON.stringify(publicB).includes(a.id),"CROSS_USER_ID_NEVER_SERIALIZED");
  pass("TWO_MEMBERS_ONE_COURSE_PER_ACTOR_FAVORITES_PRIVATE");
  check(rowsA.some(x=>object(x).id===hidden.id)&&!rowsB.some(x=>object(x).id===hidden.id),"PRIVATE_MEMBERSHIP_ONLY_ACTOR_A");
  check(!JSON.stringify(catalogB.data).includes(hidden.id),"PRIVATE_COURSE_NOT_LEAKED_TO_B");
  pass("PRIVATE_COURSE_MEMBER_ONLY_VISIBILITY");
  const SQL=await Promise.all([
   prisma.favoriteCourse.count({where:{courseId:pub.id}}),
   prisma.courseAccess.count({where:{courseId:hidden.id,userId:a.id}}),
   prisma.courseAccess.count({where:{courseId:hidden.id,userId:b.id}}),
  ]);
  check(SQL[0]===2&&SQL[1]===1&&SQL[2]===0,"REAL_SQL_FOREIGN_FAVORITES_AND_MEMBER_PROOF");
  pass("PHYSICAL_WORK_SQL_PROVES_TWO_FAVORITES_AND_ONLY_A_MEMBERSHIP");
  await cleanup();
  const after=await prisma.$queryRaw<{users:bigint,courses:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "Course") AS courses`;
  check(Number(after[0]?.users)===usersBefore&&Number(after[0]?.courses)===coursesBefore,"COUNT_RESTORED_AFTER_OWN_CLEANUP");
  pass("EXACT_OWN_USERS_COURSES_DELETED_COUNTS_UNCHANGED");
  pass("ORIGINAL_PRIVATE_COURSES_SIGNED_HTTP_REAL_WORK_ACCEPTED");
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_PRIVATE_CATALOG_FAILED_STAGE="+stage+";ERROR="+(e instanceof Error&&e.message.startsWith("AG1_COURSE_PRIVACY_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{
 try{await cleanup();}catch(e){console.error("AG1_PRIVATE_CATALOG_OWN_CLEANUP_FAILED_"+(e instanceof Error?e.name:"UNKNOWN"));process.exitCode=1;}
 try{await prisma.$disconnect();}catch{process.exitCode=1;}
 try{const {connection}=await import("@gafus/queues");connection.disconnect();}catch{process.exitCode=1;}
 process.exit(process.exitCode??0);
});
