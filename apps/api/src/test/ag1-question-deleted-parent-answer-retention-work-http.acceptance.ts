/** Exact original registered Hono3001 → WORK SQL parent tombstone, retained child and no public orphan read. */
import {randomBytes,randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const PREFIX="ag1_qret_"+randomBytes(5).toString("hex");
const actors:{id:string,username:string}[]=[];
let questionId:string|undefined,answerId:string|undefined;
function assert(v:unknown,k:string):asserts v{if(!v)throw Error("QRET_"+k);}
function obj(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function pass(k:string){console.warn("AG1_Q_PARENT_RETENTION_ORIGINAL_HONO_WORK "+k+"=PASS");}
async function cleanup(){
 for(const a of [...actors].reverse()){
  const row=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});
  if(row?.username===a.username&&row.username.startsWith(PREFIX))await prisma.user.delete({where:{id:a.id}});
 }
}
async function main(){
 assert(process.env.AG1_Q_DELETED_PARENT_RETENTION_WORK==="1","EXPLICIT_NONPROD_ONLY");
 assert(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","PHYSICAL_PROJECT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");assert(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_ONLY");
 const identity=await prisma.$queryRaw<{db:string,actor:string}[]>`SELECT current_database() AS db,current_user AS actor`;
 assert(identity[0]?.db==="gafus_refactor_real_work_20261024"&&identity[0]?.actor==="gafus_refactor_local_real","SQL_IDENTITY");
 const ready=await fetch("http://127.0.0.1:3001/ready",{signal:AbortSignal.timeout(5000)});
 assert(ready.status===200,"ORIGINAL_SHARED_HONO_READY");pass("ORIGINAL_SHARED_HONO3001_AND_WORK_IDENTITY");
 async function request(path:string,method="GET",token?:string,body?:unknown){
  const response=await fetch("http://127.0.0.1:3001/api/v1"+path,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  return {status:response.status,data:obj(await response.json()),privateHeader:response.headers.get("cache-control")};
 }
 async function actor(suffix:"owner"|"answerer"){
  const password=randomBytes(22).toString("base64url");
  const row=await prisma.user.create({data:{username:PREFIX+suffix,role:"USER",password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false}});
  actors.push({id:row.id,username:row.username});
  const auth=await request("/auth/login","POST",undefined,{username:row.username,password});
  const token=obj(auth.data.data).accessToken;
  assert(auth.status===200&&auth.data.success===true&&typeof token==="string"&&token.length>40,"STOCK_SIGNED_USER_LOGIN");
  return {id:row.id,token};
 }
 const before=await prisma.$queryRaw<{userCount:bigint,questionCount:bigint,answerCount:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS "userCount",(SELECT count(*) FROM "Question") AS "questionCount",(SELECT count(*) FROM "QuestionAnswer") AS "answerCount"`;
 const owner=await actor("owner"),answerer=await actor("answerer");pass("TWO_STOCK_ORIGINAL_JWT_LOGIN200");
 const created=await request("/questions","POST",owner.token,{title:"Синтетический вопрос только для tombstone",body:"Тестовая проверка видимости ответов после удаления родительского вопроса",category:"Поведение",tags:[],photoIds:[],clientRequestId:randomUUID()});
 questionId=obj(created.data.data).id as string;
 assert(created.status===200&&typeof questionId==="string"&&questionId.length>10,"ORIGINAL_QUESTION_POST200");
 const answered=await request("/questions/"+questionId+"/answers","POST",answerer.token,{body:"Ответ для проверки tombstone недоступности",photoIds:[],clientRequestId:randomUUID()});
 answerId=obj(answered.data.data).id as string;
 assert(answered.status===200&&typeof answerId==="string"&&answerId.length>10,"ORIGINAL_ANSWER_POST200");
 pass("ONE_OWN_QUESTION_ONE_OTHER_ANSWER_HTTP_SQL");
 const beforeDelete=await request("/questions/"+questionId,"GET",answerer.token);
 assert(beforeDelete.status===200,"ACTIVE_PARENT_READ200");
 const beforeAnswers=obj(beforeDelete.data.data).answers;
 assert(Array.isArray(beforeAnswers)&&beforeAnswers.some(x=>obj(x).id===answerId),"ANSWER_VISIBLE_PRE_DELETE");
 const priorChild=await prisma.questionAnswer.findUnique({where:{id:answerId},select:{questionId:true,deletedAt:true,authorId:true}});
 assert(priorChild?.questionId===questionId&&priorChild.authorId===answerer.id&&priorChild.deletedAt===null,"ORIGINAL_CHILD_PRE_SQL");
 const deleteRes=await request("/questions/"+questionId,"DELETE",owner.token);
 assert(deleteRes.status===200&&deleteRes.data.success===true,"ORIGINAL_PARENT_DELETE200");
 const [parent,child]=await Promise.all([
  prisma.question.findUnique({where:{id:questionId},select:{deletedAt:true,bestAnswerId:true,authorId:true}}),
  prisma.questionAnswer.findUnique({where:{id:answerId},select:{deletedAt:true,questionId:true,authorId:true}}),
 ]);
 assert(parent?.authorId===owner.id&&parent.deletedAt instanceof Date&&parent.bestAnswerId===null,"PARENT_SQL_SOFT_TOMBSTONE");
 assert(child?.questionId===questionId&&child.authorId===answerer.id&&child.deletedAt===null,"CHILD_SQL_RETAINED_UNDELETED_INTENTIONALLY");
 pass("PARENT_DELETEDAT_SET_CHILD_DELETEDAT_STAYS_NULL_RETENTION");
 const [ownerGet,foreignGet,replies,listing,ownerList,deletedAnswerWrite]=await Promise.all([
  request("/questions/"+questionId,"GET",owner.token),
  request("/questions/"+questionId,"GET",answerer.token),
  request("/questions/answers/"+answerId+"/replies","GET",answerer.token),
  request("/questions?sort=new&page=1","GET",answerer.token),
  request("/questions?mine=true&page=1","GET",owner.token),
  request("/questions/answers/"+answerId,"PATCH",answerer.token,{body:"NO_EDIT_ALLOWED",photoIds:[]}),
 ]);
 assert(ownerGet.status===404&&foreignGet.status===404,"PARENT_GET404_BOTH_ACTORS");
 assert(replies.status===404,"ORPHAN_ANSWER_REPLIES_GET404");
 const rows=obj(listing.data.data).items,ownRows=obj(ownerList.data.data).items;
 assert(listing.status===200&&ownerList.status===200&&Array.isArray(rows)&&Array.isArray(ownRows),"LIST_AFTER_DELETE200");
 assert(!rows.some(x=>obj(x).id===questionId)&&!ownRows.some(x=>obj(x).id===questionId),"PARENT_NOT_IN_ANY_LIST");
 assert(deletedAnswerWrite.status===404,"RETAINED_ANSWER_CANNOT_BE_MUTATED_WITH_DELETED_PARENT");
 pass("REGISTERED_OWNER_FOREIGN_DETAIL404_ORPHAN_REPLY404_LIST_FILTER_AND_WRITE404");
 const after=await prisma.questionAnswer.findUnique({where:{id:answerId},select:{deletedAt:true,body:true}});
 assert(after?.deletedAt===null&&after.body==="Ответ для проверки tombstone недоступности","RETAINED_NOT_MUTATED");
 await cleanup();
 const counts=await prisma.$queryRaw<{userCount:bigint,questionCount:bigint,answerCount:bigint}[]>`SELECT (SELECT count(*) FROM "User") AS "userCount",(SELECT count(*) FROM "Question") AS "questionCount",(SELECT count(*) FROM "QuestionAnswer") AS "answerCount"`;
 assert(Number(counts[0]?.userCount)===Number(before[0]?.userCount)&&Number(counts[0]?.questionCount)===Number(before[0]?.questionCount)&&Number(counts[0]?.answerCount)===Number(before[0]?.answerCount),"SYNTHETIC_CLEANUP_RESTORES_COUNTS");
 pass("ONLY_TWO_OWN_SYNTHETIC_USERS_AND_OWN_CHILD_RECORDS_REMOVED_SQL_COUNT_RESTORED");
 pass("PARENT_RETENTION_CONTRACT_ACCEPTED_NO_CORE_POLICY_CHANGE");
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_QRET_ACCEPTANCE_FAILED_"+(e instanceof Error&&e.message.startsWith("QRET_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{try{await cleanup();}catch{process.exitCode=1;console.error("AG1_QRET_SYNTHETIC_CLEANUP_REQUIRES_REVIEW");}await prisma.$disconnect();});
