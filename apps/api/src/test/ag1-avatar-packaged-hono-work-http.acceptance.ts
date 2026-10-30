/** Genuine ORIGINAL mounted signed Hono3001 multipart avatar -> WORK SQL -> private loopback S3.
 * Only after coordinator browser-IDLE, approved cold build and existing guarded boot.
 * Never runs while shared Hono/API belongs to an active AG2 browser session.
 */
import {randomBytes} from "node:crypto";
import {realpathSync} from "node:fs";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
import {S3Client,DeleteObjectCommand,GetBucketPolicyCommand,HeadObjectCommand,ListObjectsV2Command} from "@aws-sdk/client-s3";
import {isolatedNonprodS3Config} from "@gafus/cdn-upload/isolated-nonprod-s3";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const NAME="ag1_avatar_hono_"+randomBytes(5).toString("hex");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gm0AAAAASUVORK5CYII=","base64");
const base="http://127.0.0.1:3001/api/v1";
const actors:{id:string,username:string}[]=[];
let stage="PRECHECK";
function check(value:unknown,key:string):asserts value{if(!value)throw Error("AVATAR_PACKAGED_"+key);}
function o(x:unknown):Record<string,unknown>{return x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};}
function pass(s:string){console.warn("AG1_AVATAR_PACKAGED_ORIGINAL_HONO_WORK "+s+"=PASS");}
function devLocation(x:unknown,owner:string){
 check(typeof x==="string"&&x.startsWith("isodev-avatar:documents/uploads/users/"+owner+"/avatar/"),"OPAQUE_OWN_SQL_ONLY");
 const key=x.slice("isodev-avatar:".length);
 check(new RegExp("^documents/uploads/users/"+owner+"/avatar/[a-f0-9-]{36}\\.(png)$").test(key),"STRICT_RANDOM_KEY");
 return key;
}
async function main(){
 check(process.env.AG1_AVATAR_PACKAGED_HTTP_WORK==="1"&&process.env.AG2_BROWSER_IDLE_CONFIRMED==="1","OWNER_IDLE_AND_EXPLICIT_OPTIN_REQUIRED");
 check(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+"/apps/api","PHYSICAL_REF_ROOT_ONLY");
 const url=new URL(process.env.DATABASE_URL??"");
 check(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.username==="gafus_refactor_local_real"&&url.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_SQL_ONLY");
 check(process.env.NODE_ENV==="development"&&process.env.GAFUS_LOCAL_ISOLATED_API==="1"&&process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled","NONPROD_ONLY");
 const candidate=isolatedNonprodS3Config("documents");
 check(candidate?.endpoint==="http://127.0.0.1:9000"&&candidate.bucket==="gafus-refactor-documents-test","FIXED_PRIVATE_MINIO_ONLY");
 const cfg:NonNullable<typeof candidate>=candidate;
 const s3=new S3Client({endpoint:cfg.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1});
 async function raw(path:string,method="GET",token?:string,body?:BodyInit){return fetch(base+path,{method,headers:token?{Authorization:"Bearer "+token}:undefined,body,signal:AbortSignal.timeout(12000)});}
 async function json(path:string,method="GET",token?:string,body?:Record<string,unknown>){const res=await fetch(base+path,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});return{status:res.status,data:o(await res.json()),cache:res.headers.get("cache-control")};}
 async function avatar(token:string|undefined,fileType:string,name:string,bytes=png,forgedOwner?:string){const form=new FormData();form.set("file",new Blob([bytes],{type:fileType}),name);if(forgedOwner)form.set("userId",forgedOwner);const response=await raw("/user/avatar","POST",token,form);return{status:response.status,data:o(await response.json()),cache:response.headers.get("cache-control")};}
 async function actor(label:"owner"|"foreign"){
  const password=randomBytes(24).toString("base64url");
  const user=await prisma.user.create({data:{username:NAME+"_"+label,role:"USER",password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false}});
  actors.push({id:user.id,username:user.username});
  const login=await json("/auth/login","POST",undefined,{username:user.username,password});
  const token=o(login.data.data).accessToken;
  check(login.status===200&&login.data.success===true&&typeof token==="string"&&token.length>30,"STOCK_HONO_LOGIN_JWT");
  return{id:user.id,username:user.username,token};
 }
 async function sql(id:string){return(await prisma.userProfile.findUnique({where:{userId:id},select:{avatarUrl:true}}))?.avatarUrl??null;}
 async function getProfile(token:string){const result=await json("/user/profile","GET",token);check(result.status===200&&result.cache==="private, no-store","ORIGINAL_OWNER_GET_PRIVATE");return o(o(result.data.data).profile).avatarUrl;}
 async function publicProfile(username:string){const result=await json("/user/profile/public?username="+encodeURIComponent(username));check(result.status===200&&result.cache==="no-store","ORIGINAL_ANON_PUBLIC_GET_NO_STORE");return o(o(result.data.data).profile).avatarUrl;}
 async function assertSigned(signed:unknown,key:string){
  check(typeof signed==="string"&&!signed.startsWith("isodev-avatar:"),"NO_OPAQUE_WIRE");
  const parsed=new URL(signed);
  check(parsed.origin==="http://127.0.0.1:9000"&&parsed.pathname.includes(key)&&parsed.searchParams.get("X-Amz-Expires")==="600"&&parsed.searchParams.has("X-Amz-Signature"),"FIXED_PRIVATE_S3_URL_600S");
  const response=await fetch(signed,{signal:AbortSignal.timeout(12000)});
  check(response.status===200&&Buffer.from(await response.arrayBuffer()).equals(png),"ACTUAL_SIGNED_S3_GET_PNG_BYTES");
 }
 async function head(key:string,exists:boolean){
  try {const h=await s3.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:key}));check(exists&&h.ContentLength===png.byteLength&&h.ContentType==="image/png"&&h.CacheControl==="private, no-store","PRIVATE_BINARY_OBJECT_METADATA");}
  catch(e){if(exists)throw e;check((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"EXACT_OLD_KEY_HEAD404");}
 }
 try {
  stage="BOUND_GUARD";
  const ready=await fetch("http://127.0.0.1:3001/ready",{signal:AbortSignal.timeout(5000)});
  check(ready.status===200,"SHARED_ORIGINAL_HONO_READY");
  check((await fetch("http://127.0.0.1:9000/minio/health/ready",{signal:AbortSignal.timeout(5000)})).status===200,"PRIVATE_MINIO_READY");
  let absentPublicPolicy=false;
  try{await s3.send(new GetBucketPolicyCommand({Bucket:cfg.bucket}));}
  catch(err){if((err as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)absentPublicPolicy=true;else throw err;}
  check(absentPublicPolicy,"NO_PUBLIC_BUCKET_POLICY");
  const owner=await actor("owner"),foreign=await actor("foreign");
  pass("ORIGINAL_AUTHENTICATED_TWO_USER_JWT_WORK");
  stage="AUTH_AND_VALIDATION";
  const guest=await avatar(undefined,"image/png","guest.png");check(guest.status===401,"GUEST_AVATAR_401");
  const invalid=await avatar(owner.token,"image/svg+xml","wrong.svg");check(invalid.status===400,"INVALID_MIME_400");
  const emptyForm=new FormData();const missing=await raw("/user/avatar","POST",owner.token,emptyForm);
  check(missing.status===400,"MISSING_FILE_400");
  const oversized=await avatar(owner.token,"image/png","oversize.png",Buffer.alloc(5*1024*1024+1,1));
  check(oversized.status===400,"OVERSIZED_400");
  check(await sql(owner.id)===null&&await sql(foreign.id)===null,"INVALID_INPUT_NO_PROFILE_WRITE");
  pass("GUEST401_INVALID_MIME_MISSING_OVERSIZE_400_SQL_UNTOUCHED");
  stage="FIRST_UPLOAD_OWNER_PUBLIC";
  const initial=await avatar(owner.token,"image/png","avatar.PNG");
  check(initial.status===200&&initial.data.success===true&&initial.cache==="private, no-store","MULTIPART_POST200_PRIVATE_WIRE");
  const key=devLocation(await sql(owner.id),owner.id);
  await head(key,true);
  await assertSigned(o(initial.data.data).avatarUrl,key);
  await assertSigned(await getProfile(owner.token),key);
  await assertSigned(await publicProfile(owner.username),key);
  const anonymous=await fetch(cfg.endpoint+"/"+cfg.bucket+"/"+key,{signal:AbortSignal.timeout(5000)});
  check(anonymous.status===403,"ANONYMOUS_BUCKET_OBJECT_DENIED");
  pass("ORIGINAL_MULTIPART_SQL_OPAQUE_SIGNED_OWNER_PUBLIC_PNG_AND_PRIVATE_BUCKET");
  stage="FOREIGN_OWNER_INJECTION";
  const injection=await avatar(foreign.token,"image/png","foreign.png",png,owner.id);
  check(injection.status===200,"FOREIGN_REQUEST_OWN_ACCOUNT_ONLY");
  const foreignKey=devLocation(await sql(foreign.id),foreign.id);
  check(await sql(owner.id)==="isodev-avatar:"+key,"FOREIGN_FORM_OWNER_FIELD_NO_OWNER_MUTATION");
  await assertSigned(await getProfile(foreign.token),foreignKey);
  check(await getProfile(owner.token)!==await getProfile(foreign.token),"OWN_PROFILES_NOT_SHARED");
  pass("FOREIGN_JWT_CANNOT_TARGET_OTHER_OWNER_FORM_FIELD_IGNORED");
  stage="REPLACEMENT_AND_PHYSICAL_DELETE";
  const replace=await avatar(owner.token,"image/png","updated.png");
  check(replace.status===200&&replace.data.success===true,"OWNER_REPLACEMENT200");
  const newKey=devLocation(await sql(owner.id),owner.id);
  check(newKey!==key,"UUID_KEY_ROTATION");
  await head(key,false);await head(newKey,true);
  await assertSigned(o(replace.data.data).avatarUrl,newKey);
  await assertSigned(await publicProfile(owner.username),newKey);
  check(await sql(foreign.id)==="isodev-avatar:"+foreignKey,"FOREIGN_SQL_IMMUTABLE_ON_REPLACE");
  pass("REPLACE_SQL_NEW_KEY_OLD_S3_HEAD404_SIGNED_GET_AND_FOREIGN_UNCHANGED");
  stage="EXACT_FIXTURE_CLEANUP";
  await cleanup(s3,cfg.bucket);
  check((await prisma.user.count({where:{username:{startsWith:NAME}}}))===0,"OWN_USERS_ZERO");
  pass("OWN_TWO_USERS_PROFILES_S3_OBJECTS_ZERO");
  pass("REGISTERED_ORIGINAL_PACKAGED_HONO_MULTIPART_WORK_S3_ACCEPTED");
 }finally{s3.destroy();}
}
async function cleanup(s3:S3Client,bucket:string){
 for(const actor of actors){
  const prefix="documents/uploads/users/"+actor.id+"/avatar/";
  const listing=await s3.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix}));
  for(const item of listing.Contents??[]){
   const key=item.Key;
   if(!key||!new RegExp("^"+prefix+"[a-f0-9-]{36}\\.(?:jpg|jpeg|png|webp|gif)$").test(key))throw Error("AVATAR_PACKAGED_REFUSE_UNEXPECTED_OBJECT");
   await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
   try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));throw Error("AVATAR_PACKAGED_REMAINS_AFTER_DELETE");}
   catch(e){if((e as{$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw e;}
  }
  const original=await prisma.user.findUnique({where:{id:actor.id},select:{username:true}});
  if(original?.username===actor.username&&original.username.startsWith(NAME))await prisma.user.delete({where:{id:actor.id}});
 }
 actors.length=0;
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_AVATAR_PACKAGED_FAIL_STAGE="+stage+";CODE="+(e instanceof Error&&e.message.startsWith("AVATAR_PACKAGED_")?e.message:(e instanceof Error?e.name:"UNKNOWN")));}).finally(async()=>{
 try {const cfg=isolatedNonprodS3Config("documents");if(cfg&&actors.length){const s3=new S3Client({endpoint:cfg.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1});try{await cleanup(s3,cfg.bucket);}finally{s3.destroy();}}}catch{console.error("AG1_AVATAR_PACKAGED_OWN_FIXTURE_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}
 await prisma.$disconnect();
});
