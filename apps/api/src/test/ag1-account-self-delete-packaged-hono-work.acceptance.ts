/** Original stock Hono self-account-delete API backed by restricted WORK SQL + isolated private S3.
 * Never use on production, snapshot users, or external mail/provider APIs.
 * Tests durable erasure intents, NOT execution of global purge workers.
 */
import {randomUUID,randomBytes} from "node:crypto";
import {realpathSync} from "node:fs";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
import {uploadPrivateUserMedia,deletePrivateUserMedia} from "@gafus/cdn-upload";
import {isolatedNonprodS3Config} from "@gafus/cdn-upload/isolated-nonprod-s3";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const prefix="ag1_acctx_"+randomBytes(5).toString("hex");
const actors:{id:string,username:string}[]=[];
const privateObjects:{location:string,bucket:string,key:string}[]=[];
const publicOnly=process.env.AG1_ACCOUNT_DELETE_PUBLIC_ONLY === "1";
let beforeCounter:number|undefined;
let ownerId:string|undefined;
let ownerDeleted=false;
let capturedJobs=false;
function insist(value:unknown,k:string):asserts value{if(!value)throw Error("ACCOUNT_HTTP_"+k);}
function pass(s:string){console.warn("AG1_ACCOUNT_ORIGINAL_HONO_WORK "+s+"=PASS");}
function rec(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
async function request(path:string,method="GET",token?:string,body?:unknown){const res=await fetch("http://127.0.0.1:3001/api/v1"+path,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body!==undefined?{"Content-Type":"application/json"}:{})},body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return{status:res.status,data:rec(await res.json())};}
async function actor(suffix:"owner"|"other"){
 const pwd=randomBytes(26).toString("base64url"),username=prefix+"_"+suffix;
 const row=await prisma.user.create({data:{username,password:await bcrypt.hash(pwd,10),passwordSetAt:new Date(),registrationPending:false,role:"USER"}});
 actors.push({id:row.id,username});
 const login=await request("/auth/login","POST",undefined,{username,password:pwd});
 const token=rec(login.data.data).accessToken;
 insist(login.status===200&&login.data.success===true&&typeof token==="string"&&token.length>30,"TWO_STOCK_LOGIN200_JWT");
 return{id:row.id,username,token};
}
async function cleanup(){
 // No global purge worker, no external provider, no sweeping any foreign prefix.
 for(const entry of privateObjects){
  try{await deletePrivateUserMedia(entry.location);}catch(e){process.exitCode=1;console.error("ACCOUNT_HTTP_OWN_PRIVATE_S3_CLEANUP_REVIEW_"+(e instanceof Error?e.name:"UNKNOWN"));}
 }
 privateObjects.length=0;
 for(const a of actors){const row=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});if(row?.username===a.username&&row.username.startsWith(prefix)){await prisma.user.delete({where:{id:a.id}});}}
 if(ownerId){
   // Cleanup task snapshots are ephemeral TEST records, not executed real provider jobs.
   await prisma.$executeRaw`DELETE FROM "AccountStorageCleanup" WHERE "ownerId" = ${ownerId} AND "status" = 'pending' AND "attempts" = 0`;
   await prisma.$executeRaw`DELETE FROM "GalleryStorageJob" WHERE "ownerId" = ${ownerId} AND "kind" = 'delete' AND "status" IN ('pending', 'failed')`;
   await prisma.$executeRaw`DELETE FROM "FeedStorageJob" WHERE "ownerId" = ${ownerId} AND "kind" = 'delete_keys' AND "status" IN ('pending', 'failed')`;
   if(ownerDeleted){
     // A synthetic deletion is still a real audit fact, so retain audit/counter as
     // internally consistent WORK-only audit; never falsify the global audit.
     console.warn("AG1_ACCOUNT_WORK_SYNTHETIC_AUDIT_AND_COUNTER_RETAINED_AS_ACTUAL_DELETE");
   }
 }
}
async function main(){
 insist(process.env.AG1_ACCOUNT_DELETE_ORIGINAL_WORK==="1"&&publicOnly,"EXPLICIT_ONLY_SUPPORTED_SCOPES_OPTIN");
 insist(realpathSync(root)===root&&realpathSync(process.cwd())===root+"/apps/api","PROJECT_PHYSICAL_ONLY");
 const u=new URL(process.env.DATABASE_URL??"");insist(u.hostname==="127.0.0.1"&&u.port==="55921"&&u.username==="gafus_refactor_local_real"&&u.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_DB");
 insist(process.env.NODE_ENV==="development"&&process.env.GAFUS_LOCAL_ISOLATED_API==="1"&&process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled","LOCAL_PRIVATE_ONLY");
 const cfgDocs=isolatedNonprodS3Config("documents"),cfgQuestions=isolatedNonprodS3Config("questions");
 insist(cfgDocs?.endpoint==="http://127.0.0.1:9000"&&cfgQuestions?.endpoint==="http://127.0.0.1:9000","S3_EXACT_PRIVATE_LOCAL");
 insist((await fetch("http://127.0.0.1:3001/ready",{signal:AbortSignal.timeout(4000)})).status===200,"ORIGINAL_HONO3001");
 const initialCount=await prisma.user.count();
 beforeCounter=(await prisma.accountDeletionCounter.findUnique({where:{id:"global"}}))?.totalDeleted??0;
 const owner=await actor("owner"),other=await actor("other");ownerId=owner.id;
 pass("STOCK_TWO_SIGNED_USER_LOGINS_REAL_WORK");
 try{
  const existingForeign=await prisma.user.findUnique({where:{id:other.id},select:{username:true}});
  insist(existingForeign?.username===other.username,"FOREIGN_BASELINE");
  const pet=await prisma.pet.create({data:{ownerId:owner.id,name:"Synthetic deletion pet",type:"DOG",breed:"Test",birthDate:new Date("2023-02-04T00:00:00Z")}});
  const pdf=new Uint8Array([37,80,68,70,45,49,46,55,10,49,10,37,37,69,79,70,10]);
  const docPath=`users/${owner.id}/pets/${pet.id}/documents/${randomUUID()}.pdf`;
  const privateDoc=publicOnly?docPath:await uploadPrivateUserMedia("documents",docPath,pdf,"application/pdf");
  if(!publicOnly)privateObjects.push({location:privateDoc,bucket:cfgDocs.bucket,key:"documents/uploads/"+docPath});
  await prisma.petDocument.create({data:{petId:pet.id,ownerId:owner.id,name:"Synthetic own PDF",mimeType:"application/pdf",sizeBytes:pdf.length,url:privateDoc}});
  const question=await prisma.question.create({data:{authorId:owner.id,clientRequestId:randomUUID(),title:"Synthetic account cleanup",body:"Own temporary question",category:"general"}});
  const otherAnswer=await prisma.questionAnswer.create({data:{questionId:question.id,authorId:other.id,clientRequestId:randomUUID(),body:"Synthetic foreign answer"}});
  const img=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gm0AAAAASUVORK5CYII=","base64"));
  const photoPath=`questions/${owner.id}/${randomUUID()}.png`;
  const privatePhoto=publicOnly?photoPath:await uploadPrivateUserMedia("questions",photoPath,img,"image/png");
  if(!publicOnly)privateObjects.push({location:privatePhoto,bucket:cfgQuestions.bucket,key:"questions/uploads/"+photoPath});
  await prisma.questionPhoto.create({data:{ownerId:owner.id,questionId:question.id,url:privatePhoto,storagePath:photoPath}});
  const post=await prisma.feedPost.create({data:{authorId:owner.id,clientRequestId:randomUUID()}});
  const thumb=`posts/${owner.id}/${post.id}/attachments/thumb.webp`;
  await prisma.feedMediaAsset.create({data:{postId:post.id,ownerId:owner.id,kind:"photo",thumbKey:thumb}});
  const otherPost=await prisma.feedPost.create({data:{authorId:other.id,clientRequestId:randomUUID()}});
  const rootComment=await prisma.feedComment.create({data:{postId:otherPost.id,authorId:owner.id,clientRequestId:randomUUID(),text:"Synthetic owner reply parent"}});
  const childComment=await prisma.feedComment.create({data:{postId:otherPost.id,authorId:other.id,clientRequestId:randomUUID(),text:"Synthetic foreign reply retained",rootId:rootComment.id,replyToId:rootComment.id}});
  insist((await prisma.petDocument.count({where:{ownerId:owner.id}}))===1&&otherAnswer.authorId===other.id,"REAL_OWN_PET_DOC_QUESTION_ANSWER_FEED_FK_FIXTURE");
  pass(publicOnly?"OWN_PET_LEGACY_DOC_QUESTION_FEED_FOREIGN_FK_WORK_NO_PRIVATE_S3":"OWN_PET_PRIVATE_PDF_QUESTION_PRIVATE_PNG_FEED_FOREIGN_FK_WORK_S3");
  const challenge="7"+String(randomBytes(3).readUIntBE(0,3)%100000).padStart(5,"0");
  // External email is prohibited: simulate already-delivered code only for own synthetic user.
  await prisma.accountDeletionToken.create({data:{userId:owner.id,shortCode:challenge,expiresAt:new Date(Date.now()+600_000)}});
  const naked=await request("/user/account/delete","POST",undefined,{code:challenge});insist(naked.status===401,"GUEST_401");
  const invalid=await request("/user/account/delete","POST",owner.token,{code:"abc"});insist(invalid.status===400,"BAD_SCHEMA_400");
  const foreignCode=await request("/user/account/delete","POST",other.token,{code:challenge});insist(foreignCode.status===401,"FOREIGN_CHALLENGE_401");
  const wrong=await request("/user/account/delete","POST",owner.token,{code:"000000"});insist(wrong.status===401,"OWNER_INVALID_CODE_401");
  insist((await prisma.user.findUnique({where:{id:owner.id}}))!==null,"BEFORE_CORRECT_TOKEN_OWNER_PRESENT");
  pass("GUEST401_BAD_CODE400_FOREIGN401_INVALID401_NO_DELETION");
  const deleted=await request("/user/account/delete","POST",owner.token,{code:challenge});
  insist(deleted.status===200&&deleted.data.success===true,"ORIGINAL_USER_DELETE_HTTP200");ownerDeleted=true;
  insist(await prisma.user.findUnique({where:{id:owner.id}})===null,"OWNER_PHYSICAL_SQL_DELETED");
  insist((await prisma.pet.count({where:{ownerId:owner.id}}))===0&&
   (await prisma.petDocument.count({where:{ownerId:owner.id}}))===0&&
   (await prisma.question.count({where:{authorId:owner.id}}))===0&&
   (await prisma.feedPost.count({where:{authorId:owner.id}}))===0,"FK_SQL_OWN_CASCADE");
  insist((await prisma.user.findUnique({where:{id:other.id},select:{username:true}}))?.username===other.username,"FOREIGN_USER_INTACT");
  insist((await prisma.feedPost.findUnique({where:{id:otherPost.id},select:{authorId:true}}))?.authorId===other.id,"FOREIGN_FEED_POST_INTACT");
  const reply=await prisma.feedComment.findUnique({where:{id:childComment.id},select:{authorId:true,text:true,rootId:true,replyToId:true}});
  insist(reply?.authorId===other.id&&reply.rootId===null&&reply.replyToId===null,"FOREIGN_REPLY_DETACHED_RETAINED");
  pass("ORIGINAL_POST_DELETE200_REAL_SQL_OWN_USER_PET_DOC_QUESTION_FEED_REMOVED_FOREIGN_PRESERVED");
  const jobs=await prisma.accountStorageCleanup.findMany({where:{ownerId:owner.id},select:{scope:true,status:true,attempts:true,keys:true,prefixes:true,availableAt:true}});
  const m=new Map(jobs.map(row=>[row.scope,row]));
  insist((publicOnly?["public","gallery","feed"]:["public","gallery","feed","questions","documents"]).every(scope=>m.has(scope)),"DURABLE_SCOPED_SNAPSHOTS");
  insist(jobs.every(x=>x.status==="pending"&&x.attempts===0&&x.availableAt.getTime()>Date.now()),"PROVIDER_CLEANUP_ONLY_QUEUED_NO_AUTODRAIN");
  if(!publicOnly)insist(m.get("documents")!.keys.includes(privateDoc)&&m.get("questions")!.keys.includes(privatePhoto),"PRESERVED_PRIVATE_S3_OBJECT_LOCATORS_IN_CLEANUP");
  else insist(m.get("public")!.keys.includes(privateDoc)&&m.get("public")!.keys.includes(photoPath),"LEGACY_KEYS_RETAINED_IN_PUBLIC_PURGE_INTENT");
  insist(m.get("feed")!.keys.includes(thumb),"PRESERVED_FEED_MEDIA_KEYS");
  const audit=await prisma.accountDeletionAudit.findMany({where:{userId:owner.id},select:{initiatedBy:true,role:true}});
  const count=(await prisma.accountDeletionCounter.findUnique({where:{id:"global"}}))?.totalDeleted??0;
  insist(audit.length===1&&audit[0]?.initiatedBy==="SELF_SERVICE"&&count===beforeCounter+1,"DURABLE_AUDIT_COUNTER_ONCE");
  capturedJobs=true;
  pass(publicOnly?"THREE_SUPPORTED_DURABLE_PROVIDER_SCOPES_AUDIT_COUNTER_ONCE":"FIVE_SCOPED_DURABLE_CLEANUP_INTENTS_INCLUDING_PRIVATE_S3_AUDIT_COUNTER_ONCE");
  const replay=await request("/user/account/delete","POST",owner.token,{code:challenge});
  insist(replay.status!==200,"DELETED_TOKEN_REPLAY_NON_SUCCESS");
  insist((await prisma.accountDeletionAudit.count({where:{userId:owner.id}}))===1,"IDEMPOTENT_AUDIT_NO_DOUBLE_DELETE");
  pass("REPLAY_DOES_NOT_DELETE_TWICE_AND_NO_AUDIT_DUPLICATE");
  await cleanup();
  insist((await prisma.user.count())===initialCount,"BOTH_SYNTHETIC_USERS_RETIRED_GLOBAL_USER_COUNT_RESTORED");
  pass("ONLY_OWN_FIXTURES_RETIRED_EXTERNAL_PRIVATE_OBJECTS_DELETED_AS_TEST_CLEANUP_NOT_WORKER");
  pass("REGISTERED_ACCOUNT_SELF_DELETE_PUBLIC_ONLY_REAL_HONO_SQL_DURABLE_PROVIDER_PENDING_ACCEPTED");
 }finally {if(!capturedJobs)console.warn("AG1_ACCOUNT_HTTP_FIXTURE_PARTIAL_CLEANUP_GUARD");}
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_ACCOUNT_HTTP_FAIL_"+(e instanceof Error&&e.message.startsWith("ACCOUNT_HTTP_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{try{await cleanup();}catch(e){console.error("AG1_ACCOUNT_HTTP_OWN_FIXTURE_CLEANUP_REVIEW_REQUIRED_"+(e instanceof Error?e.name:"UNKNOWN"));process.exitCode=1;}await prisma.$disconnect();});
