/** Only newly synthetic original Questions Hono -> WORK PG18 -> private localhost Questions S3. */
import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import bcrypt from "bcryptjs";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { parsePrivateMediaLocation, deletePrivateUserMedia } from "@gafus/cdn-upload";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const API="http://127.0.0.1:3001/api/v1";
const BUCKET="gafus-refactor-questions-test";
const PREFIX=`ag1_questions_photo_real_${randomBytes(7).toString("hex")}`;
const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
function requireTrue(v:unknown,name:string):asserts v{if(!v)throw Error("ASSERT_"+name);}
function pass(s:string){console.warn(`AG1_QUESTIONS_PHOTO_REAL_${s}=PASS`);}
interface Actor{id:string;username:string;token:string}
const actors:Actor[]=[];
const locators=new Map<string,string>();
let client:S3Client|undefined,phase="preflight";
async function api(path:string,method:string,actor:Actor,body?:unknown){
 const r=await fetch(API+path,{method,headers:{Authorization:`Bearer ${actor.token}`,...(body===undefined?{}:{"Content-Type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:obj(await r.json())};
}
async function actor(name:string):Promise<Actor>{
 const username=`${PREFIX}_${name}`, password=randomBytes(24).toString("base64url");
 const saved=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),role:"USER",registrationPending:false}});
 const response=await fetch(`${API}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
 const data=obj(await response.json()),token=obj(data.data).accessToken;
 requireTrue(response.status===200&&typeof token==="string","AUTHENTIC_REAL_HONO_JWT");
 const a={id:saved.id,username,token};actors.push(a);return a;
}
async function upload(a:Actor){
 const form=new FormData();form.append("file",new File([image],"owned.png",{type:"image/png"}));
 const response=await fetch(`${API}/questions/photos`,{method:"POST",headers:{Authorization:`Bearer ${a.token}`},body:form,signal:AbortSignal.timeout(20000)});
 const data=obj(await response.json());
 requireTrue(response.status===200&&data.success===true,"ORIGINAL_HONO_QUESTION_PHOTO_UPLOAD200");
 const responsePhoto=obj(data.data);const id=responsePhoto.id;
 requireTrue(typeof id==="string","PHOTO_ID_HTTP");
 const row=await prisma.questionPhoto.findUnique({where:{id}});
 requireTrue(row?.ownerId===a.id&&row.questionId===null&&row.answerId===null,"WORK_SQL_PRIVATE_PHOTO_OWNER");
 const parsed=parsePrivateMediaLocation(row.storagePath);
 requireTrue(parsed?.kind==="questions"&&parsed.key.startsWith(`questions/uploads/questions/${a.id}/`),"NEW_TEST_BUCKET_ONLY");
 locators.set(id,row.storagePath);
 requireTrue(client,"MINIO_CLIENT");
 const meta=await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:parsed.key}));
 requireTrue(meta.ContentLength===image.length&&meta.ContentType==="image/png","PHYSICAL_S3_HEAD");
 const get=await client.send(new GetObjectCommand({Bucket:BUCKET,Key:parsed.key}));
 requireTrue(Buffer.from(await get.Body!.transformToByteArray()).equals(image),"PHYSICAL_S3_BYTES");
 requireTrue(typeof responsePhoto.url==="string"&&new URL(responsePhoto.url).origin==="http://127.0.0.1:9000","ORIGINAL_HONO_SIGNED_LOCAL_PRIVATE_LINK");
 const signed=await fetch(responsePhoto.url,{signal:AbortSignal.timeout(5000)});
 requireTrue(signed.status===200&&Buffer.from(await signed.arrayBuffer()).equals(image),"ORIGINAL_HONO_SIGNED_IMAGE_BYTES200");
 requireTrue((await fetch(`http://127.0.0.1:9000/${BUCKET}/${parsed.key}`)).status===403,"QUESTIONS_S3_UNAUTHENTICATED403");
 return id;
}
async function main(){
 requireTrue(process.env.AG1_QUESTIONS_PHOTO_REAL_HONO==="1","EXPLICIT_ACCEPTANCE");
 const cwd=realpathSync(process.cwd());requireTrue(realpathSync(ROOT)===ROOT&&(cwd===ROOT||cwd.startsWith(ROOT+"/")),"LOCAL_ROOT");
 const db=new URL(process.env.DATABASE_URL??"");
 requireTrue(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_PG");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
 GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
 GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:BUCKET,GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test",
 GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-feed-test"});
 const cfg=isolatedNonprodS3Config("questions");requireTrue(cfg?.bucket===BUCKET,"STRICT_S3_QUESTIONS_ONLY");
 client=new S3Client({endpoint:cfg.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1});
 requireTrue((await fetch("http://127.0.0.1:3001/ready")).status===200,"HONO_READY");
 const owner=await actor("owner"),other=await actor("other");
 phase="original-question-upload";
 const owned=await upload(owner),otherPhoto=await upload(other);
 pass("ORIGINAL_HONO_OWNER_FOREIGN_S3_PUT_HEAD_GET_SIGNED_REAL_WORK_SQL");
 phase="bind-questions";
 const title=`AG1 real test training dog question ${PREFIX}`;
 const created=await api("/questions","POST",owner,{title,body:"Test photo for safe owner and foreign reader",category:"Поведение",tags:["тренировка"],photoIds:[owned],clientRequestId:randomUUID()});
 requireTrue(created.status===200,"QUESTION_WITH_PHOTO_CREATE_HTTP200");
 const questionId=obj(created.data.data).id;
 requireTrue(typeof questionId==="string"&&
   (await prisma.questionPhoto.findUnique({where:{id:owned}}))?.questionId===questionId,"QUESTION_PHOTO_PHYSICAL_SQL_BIND");
 const invalid=await api("/questions/photos/"+owned,"DELETE",other);
 requireTrue(invalid.status===403,"FOREIGN_ATTACHED_PHOTO_DENIED403");
 const forbidden=await api("/questions/photos/"+owned,"DELETE",owner);
 requireTrue(forbidden.status===403,"ATTACHED_PHOTO_OWNER_CANNOT_UNBIND_THROUGH_UNATTACHED_DELETE");
 const detail=await api(`/questions/${questionId}`,"GET",other);
 const photos=obj(detail.data.data).photos;
 requireTrue(detail.status===200&&Array.isArray(photos)&&photos.length===1,"FOREIGN_PUBLISHED_QUESTION_PHOTO_VISIBLE");
 const presented=obj(photos[0]);
 requireTrue(presented.id===owned&&typeof presented.url==="string"&&new URL(presented.url).origin==="http://127.0.0.1:9000","FOREIGN_GET_SIGNED_QUESTIONS_PHOTO");
 requireTrue((await fetch(presented.url)).status===200,"FOREIGN_GET_REAL_IMAGE_BYTES");
 pass("QUESTION_BOUND_PHOTO_OWNER_ACL_FOREIGN_SIGNED_READ_SQL");
 phase="answer-photo";
 const answered=await api(`/questions/${questionId}/answers`,"POST",other,{clientRequestId:randomUUID(),body:"A real picture of a dog training example",photoIds:[otherPhoto]});
 requireTrue(answered.status===200,"ORIGINAL_HONO_ANSWER_WITH_PHOTO200");
 const answerId=obj(answered.data.data).id;
 requireTrue(typeof answerId==="string"&&
   (await prisma.questionPhoto.findUnique({where:{id:otherPhoto}}))?.answerId===answerId,"ANSWER_PHOTO_PHYSICAL_SQL_BIND");
 const detail2=await api(`/questions/${questionId}`,"GET",owner);
 requireTrue(detail2.status===200,"OWNER_GET_ANSWER_PHOTO_DETAIL");
 const answers=obj(detail2.data.data).answers;
 requireTrue(Array.isArray(answers)&&answers.some((x:unknown)=>{
   const a=obj(x);return a.id===answerId&&Array.isArray(a.photos)&&a.photos.some((photo:unknown)=>
      obj(photo).id===otherPhoto&&typeof obj(photo).url==="string"&&new URL(obj(photo).url as string).origin==="http://127.0.0.1:9000");
 }),"OWNER_GET_ANSWER_ATTACHED_SIGNED_PHOTO");
 pass("ORIGINAL_HONO_ANSWER_PRIVATE_S3_SIGNED_PHOTO_AND_WORK_SQL");
 phase="unattached-delete";
 const free=await upload(owner);
 const deleted=await api("/questions/photos/"+free,"DELETE",owner);
 requireTrue(deleted.status===200&&await prisma.questionPhoto.count({where:{id:free}})===0,"UNATTACHED_PHOTO_DELETE_SQL");
 const parsed=parsePrivateMediaLocation(locators.get(free)!);
 requireTrue(parsed&&client,"UNATTACHED_S3_LOCATOR");
 try{await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:parsed.key}));throw Error("DELETE_FAILED");}
 catch(e){requireTrue((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"UNATTACHED_S3_ACTUAL_DELETED");}
 locators.delete(free);
 pass("ORIGINAL_HONO_UNATTACHED_PHOTO_DELETE_SQL_AND_S3_HEAD404");
}
async function cleanup(){
 // Each S3 key must be read from a physical row already owner-scoped to a fresh synthetic user;
 // avoid arbitrary bucket sweeps, other users, or historical producer artifacts.
 for(const [id,location] of locators){
   const parsed=parsePrivateMediaLocation(location);
   const ownerId=actors.find(a=>parsed?.key.startsWith(`questions/uploads/questions/${a.id}/`))?.id;
   if(!parsed||!ownerId){console.error("FOREIGN_PHOTO_CLEANUP_DENIED");process.exitCode=1;continue;}
   try{await deletePrivateUserMedia(location);if(client){
      try{await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:parsed.key}));throw Error("UNCONFIRMED_DELETE");}
      catch(e){requireTrue((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"EXACT_S3_CLEANUP_HEAD404");}
   }}catch{console.error("OWN_QUESTION_S3_CLEANUP_FAILED");process.exitCode=1;}
   locators.delete(id);
 }
 for(const a of actors){
   const row=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});
   if(row?.username===a.username&&a.username.startsWith(PREFIX))await prisma.user.delete({where:{id:a.id}});
 }
}
void(async()=>{try{await main();}catch(e){process.exitCode=1;
 console.error(`AG1_QUESTIONS_PHOTO_REAL_FAILED phase=${phase} code=${e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"}`);
}finally{try{await cleanup();if(actors.length)pass("OWN_PRIVATE_S3_AND_SYNTHETIC_SQL_CLEANUP");}
 catch{process.exitCode=1;console.error("QUESTIONS_SYNTHETIC_CLEANUP_REVIEW_REQUIRED");}
 client?.destroy();await prisma.$disconnect();}})();
