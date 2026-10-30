/** Isolated S3-only contract: exercise the exact new source cleaner on own unique prefixes.
 * This is NOT a global AccountStorageCleanup worker or mounted Hono proof.
 */
import {randomBytes,randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import {S3Client,HeadObjectCommand} from "@aws-sdk/client-s3";
import {isolatedNonprodS3Config} from "../../../../packages/cdn-upload/src/isolatedNonprodS3";
import {uploadPrivateUserMedia,deletePrivateUserMedia} from "../../../../packages/cdn-upload/src/privateUserMedia";
import {uploadIsolatedAvatar,deleteIsolatedAvatarLocation} from "../../../../packages/cdn-upload/src/isolatedAvatarMedia";
import {accountStorageTargets,createAccountStorageCleaner} from "../../../../packages/cdn-upload/src/accountStorageCleanup";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const owner="ag1_purge_"+randomBytes(5).toString("hex");
const other="ag1_other_"+randomBytes(5).toString("hex");
const cleanupOwn:{location:string;kind:"questions"|"documents"|"avatar"}[]=[];
function okay(x:unknown,k:string):asserts x{if(!x)throw Error("PURGE_"+k);}
function pass(k:string){console.warn("AG1_PRIVATE_ACCOUNT_CLEANER_LOCAL_S3 "+k+"=PASS");}
const png=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gm0AAAAASUVORK5CYII=","base64"));
async function main(){
 okay(process.env.AG1_PRIVATE_CLEANER_OWN_TEST==="1","EXPLICIT_ISOLATED_ONLY");
 okay(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","EXACT_PROJECT");
 okay(process.env.NODE_ENV==="development"&&process.env.GAFUS_LOCAL_ISOLATED_API==="1"&&process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled","FAIL_CLOSED_DEV_GATE");
 const docs=isolatedNonprodS3Config("documents"),questions=isolatedNonprodS3Config("questions");
 okay(docs?.endpoint==="http://127.0.0.1:9000"&&questions?.endpoint==="http://127.0.0.1:9000","FIXED_LOCAL_PRIVATE_MINIO");
 const client=new S3Client({endpoint:docs.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:docs.accessKeyId,secretAccessKey:docs.secretAccessKey},maxAttempts:1});
 async function head(bucket:string,key:string,present:boolean){
  try {const res=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));okay(present&&!!res.ContentLength,"EXPECTED_OWN_BYTES");}
  catch(error){if(present)throw error;okay((error as{$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"EXPECTED_EXACT_HEAD404");}
 }
 try{
  const ownPet="pet"+randomUUID();
  const docPath=`users/${owner}/pets/${ownPet}/documents/${randomUUID()}.pdf`;
  const docLoc=await uploadPrivateUserMedia("documents",docPath,new Uint8Array([37,80,68,70,45,49,46,55,10]),"application/pdf");
  cleanupOwn.push({location:docLoc,kind:"documents"});
  const avatarPath=`users/${owner}/avatar/${randomUUID()}.png`;
  const avatarLoc=await uploadIsolatedAvatar(new File([png],"avatar.png",{type:"image/png"}),avatarPath);
  cleanupOwn.push({location:avatarLoc,kind:"avatar"});
  const questionPath=`questions/${owner}/${randomUUID()}.png`;
  const qLoc=await uploadPrivateUserMedia("questions",questionPath,png,"image/png");
  cleanupOwn.push({location:qLoc,kind:"questions"});
  const foreignPath=`users/${other}/pets/pet${randomUUID()}/documents/${randomUUID()}.pdf`;
  const foreignLoc=await uploadPrivateUserMedia("documents",foreignPath,new Uint8Array([37,80,68,70,45,49,46,55,10]),"application/pdf");
  cleanupOwn.push({location:foreignLoc,kind:"documents"});
  const docKey="documents/uploads/"+docPath, avatarKey="documents/uploads/"+avatarPath, qKey="questions/uploads/"+questionPath,foreignKey="documents/uploads/"+foreignPath;
  for(const key of [docKey,avatarKey,foreignKey])await head(docs.bucket,key,true);
  await head(questions.bucket,qKey,true);
  pass("THREE_EXACT_OWN_PRIVATE_S3_OBJECTS_AND_ONE_FOREIGN_FIXTURE_CREATED");
  const targets=accountStorageTargets("documents",owner,[docLoc,avatarLoc],[],process.env);
  okay(targets.keys.includes(docKey)&&targets.keys.includes(avatarKey)&&targets.prefixes.every(p=>p.includes(owner)),"OWNER_SCOPED_DOC_AND_AVATAR_LOCATION");
  okay(accountStorageTargets("questions",owner,[qLoc],[],process.env).keys.includes(qKey),"OWNER_SCOPED_QUESTION_LOCATION");
  const d=await createAccountStorageCleaner("documents").sweep(targets,AbortSignal.timeout(20000));
  const q=await createAccountStorageCleaner("questions").sweep(accountStorageTargets("questions",owner,[qLoc],[],process.env),AbortSignal.timeout(20000));
  okay(d>=2&&q>=1,"STORAGE_CLEANER_PHYSICAL_ERASURE_COUNT");
  await head(docs.bucket,docKey,false);
  await head(docs.bucket,avatarKey,false);
  await head(questions.bucket,qKey,false);
  await head(docs.bucket,foreignKey,true);
  pass("LOCAL_CLEANER_DOC_AVATAR_QUESTION_HEAD404_FOREIGN_HEAD200_UNTOUCHED");
  okay(!accountStorageTargets("documents",owner,[avatarLoc],[],process.env).prefixes.some(x=>x.includes(other)),"NO_SIBLING_TARGET_PREFIX");
  pass("PRIVATE_CLEANER_SOURCE_LOOPBACK_ONLY_OWNER_PHYSICAL_S3_ACCEPTED");
 }finally{
  for(const x of cleanupOwn){
   try{if(x.kind==="avatar")await deleteIsolatedAvatarLocation(x.location);else await deletePrivateUserMedia(x.location);}
   catch{console.error("AG1_PRIVATE_CLEANER_OWN_S3_CLEANUP_REVIEW");process.exitCode=1;}
  }
  client.destroy();
 }
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_PRIVATE_CLEANER_SOURCE_FAILED_"+(e instanceof Error&&e.message.startsWith("PURGE_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));});
