/** Work-only ORIGINAL Core profile src and actual isolated media adapter src, NOT running shared Hono dist. */
import {randomBytes} from "node:crypto";
import {realpathSync} from "node:fs";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
import {S3Client,HeadObjectCommand,ListObjectsV2Command} from "@aws-sdk/client-s3";
import {getPublicProfile,getUserProfileForApi,updateAvatar} from "../../../../packages/core/src/services/user/profileService";
import {deleteFileFromCDN,uploadFileToCDN} from "@gafus/cdn-upload";
import {isolatedNonprodS3Config} from "../../../../packages/cdn-upload/src/isolatedNonprodS3";
import {isIsolatedAvatarLocation} from "../../../../packages/cdn-upload/src/isolatedAvatarMedia";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const NAME="ag1_avsrc_"+randomBytes(6).toString("hex");
const own:{id:string,name:string}[]=[];
let lastLocation:string|undefined;
function ok(v:unknown,n:string):asserts v{if(!v)throw Error("AG1_AVATAR_"+n);}
function pass(n:string){console.warn("AG1_AVATAR_REAL_SOURCE_S3_WORK "+n+"=PASS");}
async function main(){
 ok(process.env.AG1_AVATAR_SOURCE_WORK_PROOF==="1","OPTIN");
 ok(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","ROOT");
 const url=new URL(process.env.DATABASE_URL??"");
 ok(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.username==="gafus_refactor_local_real"&&url.pathname==="/gafus_refactor_real_work_20261024","WORK_DB");
 ok(process.env.NODE_ENV==="development"&&process.env.GAFUS_LOCAL_ISOLATED_API==="1"&&process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled","DEV_ISOLATED_GATE");
 // Refuse stale built package behavior rather than pretending to prove new source.
 ok(uploadFileToCDN.toString().includes("isIsolatedAvatarPath"),"SOURCE_ALIAS_NOT_STALE_DIST");
 const candidate=isolatedNonprodS3Config("documents");
 ok(candidate&&candidate.endpoint==="http://127.0.0.1:9000","PRIVATE_LOOPBACK_BUCKET");
 const cfg:NonNullable<typeof candidate>=candidate;
 const s3=new S3Client({endpoint:cfg.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1});
 const before=await prisma.user.count();
 async function user(suffix:"owner"|"other"){
  const name=NAME+"_"+suffix;
  const row=await prisma.user.create({data:{username:name,role:"USER",password:await bcrypt.hash(randomBytes(20).toString("hex"),9),passwordSetAt:new Date(),registrationPending:false}});
  own.push({id:row.id,name});return row;
 }
 async function persisted(){
  const row=await prisma.userProfile.findUnique({where:{userId:own[0]!.id},select:{avatarUrl:true}});
  const value=row?.avatarUrl??null;ok(value&&isIsolatedAvatarLocation(value),"OPAQUE_NONPROD_LOCATION_STORED");return value;
 }
 async function head(location:string,expected:boolean){
  const key=location.replace("isodev-avatar:","");
  try{const r=await s3.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:key}));ok(expected&&r.ContentLength===68&&r.CacheControl==="private, no-store","OBJECT_HEAD_BYTES_PRIVATE");}
  catch(e){if(expected)throw e;ok((e as{$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"EXPECTED_S3_PHYSICAL_GONE");}
 }
 // Tiny valid PNG: no ImageMagick or external provider. Number of bytes is derived, not guessed.
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gm0AAAAASUVORK5CYII=","base64");
 async function file(name:string){return new File([png],name,{type:"image/png"});}
 const owner=await user("owner"),foreign=await user("other");
 try{
  const uploaded=await updateAvatar(owner.id,await file("AVATAR.PNG"));
  ok(uploaded.startsWith(cfg.endpoint+"/")&&new URL(uploaded).searchParams.get("X-Amz-Expires")==="600","UPLOAD_RETURNS_SIGNED_DEV_URL");
  const old=await persisted();lastLocation=old;
  await head(old,true);
  const ownGet=await getUserProfileForApi(owner.id),pubGet=await getPublicProfile(owner.username);
  ok(ownGet?.profile.avatarUrl?.startsWith(cfg.endpoint)&&pubGet?.profile?.avatarUrl?.startsWith(cfg.endpoint),"OWNER_PUBLIC_BOTH_SIGNED_URLS");
  for(const signed of [uploaded,ownGet!.profile.avatarUrl!,pubGet!.profile!.avatarUrl!]){
   const result=await fetch(signed,{signal:AbortSignal.timeout(5000)});
   ok(result.status===200&&Buffer.from(await result.arrayBuffer()).equals(png),"SIGNED_GET_ACTUAL_BYTES");
  }
  const unsigned=await fetch(cfg.endpoint+"/"+cfg.bucket+"/"+old.slice("isodev-avatar:".length),{signal:AbortSignal.timeout(5000)});
  ok(unsigned.status===403,"ANONYMOUS_S3_OBJECT_DENIED");
  const foreignRead=await getUserProfileForApi(foreign.id);
  ok(foreignRead?.profile.avatarUrl===null,"FOREIGN_OWN_PROFILE_UNCHANGED");
  pass("FIRST_UPLOAD_OWNER_PUBLIC_SIGNED_EXACT_PNG_PRIVATE_S3_AND_SQL");
  const newResponse=await updateAvatar(owner.id,await file("second.png"));
  ok(new URL(newResponse).origin===cfg.endpoint,"REPLACE_RETURNS_SIGNED");
  const newest=await persisted();lastLocation=newest;ok(newest!==old,"SQL_REPLACEMENT_NEW_RANDOM_KEY");
  await head(old,false);await head(newest,true);
  const oldSigned=await fetch(uploaded,{signal:AbortSignal.timeout(5000)});
  ok(oldSigned.status===404,"OLD_SIGNED_LINK_PHYSICALLY_EXPIRED_BY_DELETE");
  const refreshed=await getPublicProfile(owner.username);
  ok(refreshed?.profile?.avatarUrl&&new URL(refreshed.profile.avatarUrl).searchParams.get("X-Amz-Expires")==="600","PUBLIC_AFTER_REPLACE_NEW_SIGNATURE");
  pass("REPLACE_SQL_NEW_S3_OLD_HEAD404_PUBLIC_URL_NEW");
  await deleteFileFromCDN(newest);
  await head(newest,false);lastLocation=undefined;
  pass("EXACT_OWN_DEV_AVATAR_DELETE_PHYSICAL_HEAD404");
  const missingId="ag1_av_missing_"+randomBytes(5).toString("hex");
  let rejected=false;
  try{await updateAvatar(missingId,await file("no-sql-user.png"));}
  catch(e){rejected=e instanceof Error&&e.message==="Пользователь не найден";}
  ok(rejected,"NONEXISTENT_OWNER_DB_WRITE_REJECTED");
  const leaked=await s3.send(new ListObjectsV2Command({
    Bucket:cfg.bucket,Prefix:"documents/uploads/users/"+missingId+"/avatar/",
  }));
  ok(!leaked.Contents?.length,"FAILED_DB_UPLOAD_COMPENSATED_S3_ZERO");
  pass("NONEXISTENT_OWNER_COMMIT_REJECTED_S3_PHYSICAL_COMPENSATION");
  await prisma.user.delete({where:{id:foreign.id}});
  await prisma.user.delete({where:{id:owner.id}});
  own.length=0;
  ok((await prisma.user.count())===before,"FOREIGN_GLOBAL_USER_COUNT_UNCHANGED_AFTER_EXACT_CLEANUP");
  pass("SYNTHETIC_OWN_SQL_USER_PROFILE_CLEANUP_NO_FOREIGN_TOUCH");
  pass("ORIGINAL_PROFILE_CORE_SOURCE_ISOLATED_AVATAR_S3_WORK_ACCEPTED_NO_HONO_HOTSWAP");
 }finally{s3.destroy();}
}
async function cleanup(){
 if(lastLocation){try{await deleteFileFromCDN(lastLocation);}catch{console.error("AG1_AVATAR_LAST_OBJECT_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}}
 for(const entry of own.reverse()){
  const row=await prisma.user.findUnique({where:{id:entry.id},select:{username:true}});
  if(row?.username===entry.name&&row.username.startsWith(NAME))await prisma.user.delete({where:{id:entry.id}});
 }
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_AVATAR_SOURCE_PROOF_FAILED_"+(e instanceof Error&&e.message.startsWith("AG1_AVATAR_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{try{await cleanup();}catch{process.exitCode=1;console.error("AG1_AVATAR_OWN_SCOPE_CLEANUP_REVIEW_REQUIRED");}await prisma.$disconnect();});
