import{readFile}from'node:fs/promises';
import{join}from'node:path';
import{homedir}from'node:os';
import{createRequire}from'node:module';
import{S3Client,ListObjectsV2Command,DeleteObjectCommand,HeadObjectCommand}from'@aws-sdk/client-s3';
if(process.env.GAFUS_STAGE_CLEAN!=='synthetic-only')throw Error('NOT_APPROVED');
const dir=join(homedir(),'.codex/cloudru/gafus-media-core-staging');
const data=JSON.parse(await readFile(join(dir,'e2e-state.json'),'utf8'));
if(!/^stage_[a-f0-9]{22}$/.test(data.owner)||data.states?.length!==2||data.states.some(x=>x.owner!==data.owner))throw Error('INVALID_SCOPE');
const pairs=Object.fromEntries((await readFile(join(dir,'core.env'),'utf8')).split('\n').filter(x=>x.includes('=')).map(x=>x.split('=',2)));
const require=createRequire(new URL('../../packages/prisma/package.json',import.meta.url));
const{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({datasources:{db:{url:`postgresql://gafus_media_stage:${pairs.PG_APP_PASSWORD}@127.0.0.1:55448/gafus_media_stage`}}});
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,credentials:{accessKeyId:process.env.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:process.env.CLOUDRU_S3_SECRET_ACCESS_KEY}});
try{
 const prefix=`posts/${data.owner}/`;
 const found=await s3.send(new ListObjectsV2Command({Bucket:'gafus-feed-private',Prefix:prefix,MaxKeys:100}));
 const keys=(found.Contents??[]).map(x=>x.Key);
 if(found.IsTruncated||keys.length>40||keys.some(x=>!x?.startsWith(prefix)||!/^posts\/stage_[a-f0-9]{22}\/stagepost_[a-f0-9]{22}\/(incoming|attachments)\//.test(x)))throw Error('UNSAFE_OBJECTS');
 for(const Key of keys){await s3.send(new DeleteObjectCommand({Bucket:'gafus-feed-private',Key}));let gone=false;try{await s3.send(new HeadObjectCommand({Bucket:'gafus-feed-private',Key}));}catch(e){gone=e?.$metadata?.httpStatusCode===404;}if(!gone)throw Error('OBJECT_NOT_GONE');}
 const statuses=await db.feedStorageJob.findMany({where:{ownerId:data.owner},select:{status:true}});
 if(statuses.some(x=>x.status==='processing'))throw Error('ACTIVE_JOB');
 const jobs=await db.feedStorageJob.deleteMany({where:{ownerId:data.owner}});
 const user=await db.user.deleteMany({where:{id:data.owner}});
 if(user.count!==1)throw Error('DB_DELETE_NOT_VERIFIED');
 console.log(JSON.stringify({syntheticObjectsRemoved:keys.length,syntheticJobRowsRemoved:jobs.count,syntheticUsersRemoved:user.count}));
}finally{await db.$disconnect();s3.destroy();}
