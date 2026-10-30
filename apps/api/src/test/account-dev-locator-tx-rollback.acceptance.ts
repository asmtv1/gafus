/** Migration+Core enqueue acceptance against restricted WORK PG18, FULL TRANSACTION ROLLBACK. */
import {randomBytes,randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import {prisma} from "@gafus/prisma";
import {enqueueAccountStorageCleanup} from "../../../../packages/core/src/services/accountCleanup/enqueue";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const marker="ag1_scope_tx_"+randomBytes(5).toString("hex");
function assert(x:unknown,name:string):asserts x{if(!x)throw Error("ACCOUNT_MIGRATION_SOURCE_"+name);}
async function main(){
 assert(process.env.ACCOUNT_DEV_MARKER_TX_PROOF==="1","EXPLICIT_OWN_TX_OPTIN");
 assert(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","EXACT_SOURCE_ROOT");
 const u=new URL(process.env.DATABASE_URL??"");
 assert(u.hostname==="127.0.0.1"&&u.port==="55921"&&u.username==="gafus_refactor_local_real"&&u.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_ONLY");
 assert(process.env.NODE_ENV==="development"&&process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled"&&process.env.GAFUS_LOCAL_ISOLATED_API==="1","LOCAL_DEV_ONLY");
 const initialUsers=await prisma.user.count();
 const initialJobs=await prisma.accountStorageCleanup.count();
 let validated=false;
 try{
  await prisma.$transaction(async tx=>{
   const user=await tx.user.create({data:{username:marker,password:"synthetic-no-login",role:"USER",registrationPending:false}});
   const avatar=`isodev-avatar:documents/uploads/users/${user.id}/avatar/${randomUUID()}.png`;
   await tx.userProfile.create({data:{userId:user.id,avatarUrl:avatar}});
   const pet=await tx.pet.create({data:{ownerId:user.id,name:"Synthetic scope proof",type:"DOG",breed:"Test",birthDate:new Date("2024-01-01T00:00:00Z")}});
   const doc=`isodev-private:documents:documents/uploads/users/${user.id}/pets/${pet.id}/documents/${randomUUID()}.pdf`;
   await tx.petDocument.create({data:{petId:pet.id,ownerId:user.id,name:"Synthetic scope PDF",mimeType:"application/pdf",sizeBytes:4,url:doc}});
   const question=await tx.question.create({data:{authorId:user.id,title:"Synthetic scope question",body:"Disposable within DB TX",clientRequestId:randomUUID(),category:"general"}});
   const photo=`isodev-private:questions:questions/uploads/questions/${user.id}/${randomUUID()}.png`;
   await tx.questionPhoto.create({data:{ownerId:user.id,questionId:question.id,url:photo,storagePath:`questions/${user.id}/synthetic.png`}});
   const post=await tx.feedPost.create({data:{authorId:user.id,clientRequestId:randomUUID()}});
   const thumb=`posts/${user.id}/${post.id}/synthetic/thumb.webp`;
   await tx.feedMediaAsset.create({data:{ownerId:user.id,postId:post.id,kind:"photo",thumbKey:thumb}});
   await enqueueAccountStorageCleanup(tx,user.id,new Date());
   const jobs=await tx.accountStorageCleanup.findMany({where:{ownerId:user.id},select:{scope:true,status:true,keys:true,prefixes:true,attempts:true}});
   const byScope=new Map(jobs.map(x=>[x.scope,x]));
   assert(["public","gallery","feed","questions","documents"].every(x=>byScope.has(x)),"ALL_FIVE_REAL_WORK_SCOPES_INSERTED");
   assert(jobs.every(x=>x.status==="pending"&&x.attempts===0),"PENDING_SCOPE_CHECK_PRESERVED");
   assert(byScope.get("documents")!.keys.includes(doc)&&byScope.get("documents")!.keys.includes(avatar),"PRIVATE_DOCUMENTS_AND_LOCAL_AVATAR_INTENT");
   assert(byScope.get("questions")!.keys.includes(photo),"PRIVATE_QUESTION_INTENT");
   assert(!byScope.get("public")!.keys.includes(avatar)&&!byScope.get("public")!.keys.includes(doc),"NO_PRIVATE_MEDIA_LEGACY_PUBLIC");
   assert(byScope.get("feed")!.keys.includes(thumb),"OWNER_FEED_STILL_DURABLE");
   validated=true;
   throw Error("__AG1_INTENTIONAL_WHOLE_TX_ROLLBACK__");
  },{timeout:13000});
  throw Error("ACCOUNT_MIGRATION_SOURCE_TX_UNEXPECTED_COMMIT");
 }catch(error){
  assert(validated&&error instanceof Error&&error.message==="__AG1_INTENTIONAL_WHOLE_TX_ROLLBACK__","INTENTIONAL_SQL_ROLLBACK_ONLY");
 }
 assert(await prisma.user.count()===initialUsers,"USER_TOTAL_NO_CHANGE");
 assert(await prisma.accountStorageCleanup.count()===initialJobs,"CLEANUP_JOB_TOTAL_NO_CHANGE");
 assert(await prisma.user.count({where:{username:marker}})===0,"NO_SYNTHETIC_USER_REMAINING");
 console.warn("ACCOUNT_DEV_PROVIDER_LOCATORS_REAL_WORK_TX_FIVE_SCOPES_ROLLED_BACK=PASS");
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_ACCOUNT_SCOPE_LIVE_WORK_FAILED_"+(e instanceof Error&&e.message.startsWith("ACCOUNT_MIGRATION_SOURCE_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{await prisma.$disconnect();});
