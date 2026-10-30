/** One genuine private fourth bucket, current source-only: does NOT claim Hono/WORK SQL. */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, GetBucketPolicyCommand,
  HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";
import {
  uploadPrivateUserMedia, deletePrivateUserMedia,
  signPrivateUserMedia, parsePrivateMediaLocation,
} from "../../packages/cdn-upload/src/privateUserMedia";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const BUCKET="gafus-refactor-questions-test";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
function ensure(value:unknown,name:string):asserts value{if(!value)throw Error("QUESTION_ISOLATED_S3_"+name);}
async function main(){
 ensure(process.env.AG1_QUESTIONS_ISOLATED_S3_PHYSICAL==="1","EXPLICIT_OPTIN");
 ensure(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT,"EXACT_ROOT");
 Object.assign(process.env,{
  NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
  GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:BUCKET,
  GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test",
  GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-feed-test",
 });
 const config=isolatedNonprodS3Config("questions");
 ensure(config?.bucket===BUCKET&&config.endpoint==="http://127.0.0.1:9000","LOCAL_PROVIDER_ONLY");
 const client=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,
  credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,
  requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
 let key="";let removed=false;
 try{
  try{await client.send(new HeadBucketCommand({Bucket:BUCKET}));}
  catch(error){
   ensure((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"QUESTION_BUCKET_UNEXPECTED_STATE");
   await client.send(new CreateBucketCommand({Bucket:BUCKET}));
  }
  try{await client.send(new GetBucketPolicyCommand({Bucket:BUCKET}));
    throw Error("QUESTION_PUBLIC_OR_UNVERIFIED_POLICY");
  }catch(error){ensure((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"QUESTION_BUCKET_POLICY_NOT_PRIVATE");}
  const owner="ag1questionsproof_"+randomUUID().replace(/-/g,"");
  const relative=`questions/${owner}/${randomUUID()}.png`;
  const location=await uploadPrivateUserMedia("questions",relative,png,"image/png");
  const parsed=parsePrivateMediaLocation(location);
  ensure(parsed?.kind==="questions"&&parsed.key.startsWith(`questions/uploads/questions/${owner}/`),"PRIVATE_KEY_OWNER_BOUND");
  key=parsed.key;
  ensure((await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}))).ContentLength===png.length,"REAL_S3_HEAD");
  const actual=await client.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  ensure(Buffer.from(await actual.Body!.transformToByteArray()).equals(png),"ACTUAL_S3_BYTES");
  const signed=await signPrivateUserMedia(location,60);
  ensure(new URL(signed).origin==="http://127.0.0.1:9000"&&
    (await fetch(signed,{signal:AbortSignal.timeout(5000)})).status===200,"REAL_SIGNED_GET");
  ensure((await fetch(`http://127.0.0.1:9000/${BUCKET}/${key}`)).status===403,"ANONYMOUS403");
  const changed=new URL(signed);changed.searchParams.set("X-Amz-Signature","0".repeat(64));
  ensure((await fetch(changed)).status===403,"TAMPER403");
  await deletePrivateUserMedia(location);
  try{await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));throw Error("QUESTION_DELETE_UNCONFIRMED");}
  catch(e){ensure((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"DELETE_HEAD404");}
  removed=true;
  console.warn("AG1_QUESTIONS_NEW_PRIVATE_MINIO_S3_PHYSICAL_PUT_HEAD_GET_SIGNED_ACL_DELETE_PASS");
 }finally{
  if(key&&!removed){try{await client.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));}
    catch{console.error("AG1_QUESTIONS_OWN_S3_RECOVERY_REVIEW_REQUIRED");process.exitCode=1;}}
  client.destroy();
 }
}
void main().catch(()=>{console.error("AG1_QUESTIONS_S3_PHYSICAL_FAILED");process.exitCode=1;});
