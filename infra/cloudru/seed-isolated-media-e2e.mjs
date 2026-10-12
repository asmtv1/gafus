/** Seed one synthetic photo + one video into isolated staging Core and private Cloud.ru S3. */
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const e=process.env;
if(e.GAFUS_STAGE_SEED_CONFIRM!=='synthetic-only-isolated-core' ||
   e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru' || !e.CLOUDRU_S3_ACCESS_KEY_ID)throw Error('ISOLATED_SEED_NOT_APPROVED');
const x=Object.fromEntries((await readFile(join(homedir(),'.codex/cloudru/gafus-media-core-staging/core.env'),'utf8')).split('\n').filter(s=>s.includes('=')).map(s=>s.split('=',2)));
const dbUrl=`postgresql://gafus_media_stage:${x.PG_APP_PASSWORD}@127.0.0.1:55448/gafus_media_stage?schema=public`;
const req=createRequire(new URL('../../packages/prisma/package.json', import.meta.url));
const { PrismaClient } = req('@prisma/client');
const sharp=createRequire(new URL('../../apps/gallery-cloud/package.json', import.meta.url))('sharp');
const prisma=new PrismaClient({datasources:{db:{url:dbUrl}}});
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,
 credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY},maxAttempts:1});
const root=await mkdtemp(join(tmpdir(),'gafus-isolated-e2e-'));
const nonce=randomUUID().replaceAll('-','');
const owner='stage_'+nonce.slice(0,22);
const states=[];
try {
 const count=await prisma.user.count();if(count!==0)throw Error('STAGING_DB_MUST_START_EMPTY');
 await prisma.user.create({data:{id:owner,username:owner,password:'isolated-unusable-staging-password'}});
 const jpeg=await sharp({create:{width:400,height:260,channels:3,background:{r:35,g:126,b:83}}}).jpeg({quality:85}).toBuffer();
 const videoFile=join(root,'video.mp4');
 execFileSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=24',
   '-t','4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart','-an',videoFile],{timeout:45000});
 const video=await readFile(videoFile);
 for(const [kind,bytes,mime,ext] of [['photo',jpeg,'image/jpeg','jpg'],['video',video,'video/mp4','mp4']]){
  const post='stagepost_'+randomUUID().replaceAll('-','').slice(0,22);
  const media='stagemedia_'+randomUUID().replaceAll('-','').slice(0,22);
  const upload='stageupload_'+randomUUID().replaceAll('-','').slice(0,22);
  const revision='stagerev_'+randomUUID().replaceAll('-','').slice(0,22);
  const source=`posts/${owner}/${post}/incoming/${upload}/source.${ext}`;
  const put=await s3.send(new PutObjectCommand({Bucket:'gafus-feed-private',Key:source,Body:bytes,ContentType:mime,IfNoneMatch:'*'}));
  const head=await s3.send(new HeadObjectCommand({Bucket:'gafus-feed-private',Key:source}));
  if(!head.ETag||head.ContentLength!==bytes.length||head.ContentType!==mime)throw Error('STAGE_S3_SOURCE_MISMATCH');
  await prisma.$transaction(async tx=>{
   await tx.feedPost.create({data:{id:post,authorId:owner,status:'pending',version:1,clientRequestId:'synthetic-'+randomUUID()}});
   await tx.feedPostRevision.create({data:{id:revision,postId:post,revisionNumber:1,status:'pending',text:'Isolated synthetic '+kind,clientRequestId:'synthetic-'+randomUUID()}});
   await tx.feedMediaAsset.create({data:{id:media,postId:post,ownerId:owner,kind,status:'uploaded'}});
   await tx.feedRevisionAttachment.create({data:{revisionId:revision,mediaId:media,position:0}});
   await tx.feedUpload.create({data:{id:upload,ownerId:owner,postId:post,mediaId:media,clientRequestId:'synthetic-'+randomUUID(),
    requestFingerprint:'staging-e2e-'+nonce,filename:'synthetic.'+ext,declaredMime:mime,declaredBytes:bytes.length,
    sourceKey:source,sourceETag:head.ETag,status:'uploaded',reservationExpiresAt:new Date(Date.now()+3_600_000),postExpiresAt:new Date(Date.now()+3_600_000)}});
   await tx.feedStorageJob.create({data:{dedupeKey:'feed-process:'+upload,ownerId:owner,postId:post,uploadId:upload,mediaId:media,
    sourceKeys:[source],kind:kind==='photo'?'publish_photo':'publish_video'}});
  });
  states.push({kind,owner,post,media,upload,revision,source,mime,sourceBytes:bytes.length,sourceSha256:createHash('sha256').update(bytes).digest('hex')});
  console.log(JSON.stringify({kind,seeded:true,sourceBytes:bytes.length,db:'isolated-postgres',s3:'private-cloudru'}));
 }
 const reportFile=join(homedir(),'.codex/cloudru/gafus-media-core-staging/e2e-state.json');
 await writeFile(reportFile,JSON.stringify({owner,createdAt:new Date().toISOString(),states},null,2),{mode:0o600});
 console.log('ISOLATED_STAGE_SEED_READY=photo+video');
}finally{await prisma.$disconnect();s3.destroy();await rm(root,{recursive:true,force:true});}
