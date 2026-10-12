/** Live staging-only core playback authorization + signed Cloud S3 photo and HLS tests. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createFeedService } from '../../packages/core/src/services/feed/service';
import { createFeedStorage } from '../../packages/feed-storage/src/storage';
import { createFeedPlayback } from '../../packages/feed-server/src/playback';
const e=process.env;
if(e.GAFUS_STAGE_VERIFY_CONFIRM!=='real-synthetic-feed-only' || e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')
  throw Error('STAGE_VERIFY_UNAUTHORIZED');
const root=join(homedir(),'.codex/cloudru/gafus-media-core-staging');
const env=Object.fromEntries((await readFile(join(root,'core.env'),'utf8')).split('\n').filter(s=>s.includes('=')).map(s=>s.split('=',2)));
const state=JSON.parse(await readFile(join(root,'e2e-state.json'),'utf8')) as { owner: string; states: Array<{kind:string;owner:string;post:string;media:string;upload:string;source:string}> };
const require=createRequire(new URL('../../packages/prisma/package.json',import.meta.url));
const { PrismaClient }=require('@prisma/client');
const db=new PrismaClient({datasources:{db:{url:`postgresql://gafus_media_stage:${env.PG_APP_PASSWORD}@127.0.0.1:55448/gafus_media_stage?schema=public`}}});
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,
 credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const bucket='gafus-feed-private';
const storage=createFeedStorage({enabled:true,bucket,endpoint:'https://s3.cloud.ru',
 accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY,
 cdnBaseUrl:'https://gallery-dev.gafus.ru',cdnSecret:'s'.repeat(32)});
const posts=createFeedService({db,storage,enabled:()=>true});
const playback=createFeedPlayback({posts,storage,key:Buffer.from(env.FEED_INTERNAL_HMAC_SECRET),
 cdnHost:'gallery-dev.gafus.ru',fallbackSign:(key,ttl)=>getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:ttl})});
const requireObject=async(key:string,type:string)=>{
 const metadata=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
 if(metadata.ContentType!==type||!metadata.ContentLength)throw Error('STAGE_OUTPUT_OBJECT_INVALID');
 const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:90});
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 const bytes=Buffer.from(await response.arrayBuffer());
 if(response.status!==200||bytes.length!==metadata.ContentLength)throw Error('STAGE_SIGNED_OBJECT_DOWNLOAD_FAILED');
 return bytes;
};
try{
 for(const st of state.states){
  const job=await db.feedStorageJob.findUnique({where:{dedupeKey:'feed-process:'+st.upload}});
  const media=await db.feedMediaAsset.findUnique({where:{id:st.media}});
  const post=await db.feedPost.findUnique({where:{id:st.post}});
  const revision=await db.feedPostRevision.findFirst({where:{postId:st.post,revisionNumber:1}});
  if(job?.status!=='completed'||job.attempts!==1||media?.status!=='ready'||post?.status!=='published'||revision?.status!=='ready')
    throw Error('STAGE_CORE_DURABLE_JOB_PUBLICATION_FAILED');
  if(st.kind==='photo'){
   if(!media.fullKey||!media.thumbKey)throw Error('STAGE_PHOTO_KEYS_MISSING');
   const full=await requireObject(media.fullKey,'image/webp');
   const thumb=await requireObject(media.thumbKey,'image/webp');
   const source=await posts.fallbackSource(st.owner,st.media,'full');
   if(source.key!==media.fullKey)throw Error('STAGE_PHOTO_CORE_FALLBACK_KEY_DENIED');
   console.log(JSON.stringify({kind:'photo',processing:'completed',publication:'published',fullBytes:full.length,thumbBytes:thumb.length,authorizedFallback:true,signedGet:true}));
  }else{
   if(!media.posterKey||!media.playlistKey||!media.videoSegmentKeys.length)throw Error('STAGE_VIDEO_KEYS_MISSING');
   const poster=await requireObject(media.posterKey,'image/webp');
   const unsignedPlaylist=(await requireObject(media.playlistKey,'application/vnd.apple.mpegurl')).toString('utf8');
   if(!unsignedPlaylist.startsWith('#EXTM3U')||!unsignedPlaylist.includes('#EXT-X-ENDLIST'))
    throw Error('STAGE_HLS_BAD_PLAYLIST');
   const ticket=await playback.ticket(st.owner,st.media);
   const signed=await playback.manifest(st.media,ticket.ticket,st.owner,'cloudru');
   const playlistLinks=signed.playlist.split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
   if(playlistLinks.length!==media.videoSegmentKeys.length)throw Error('STAGE_SIGNED_HLS_SEGMENTS_INCOMPLETE');
   for(let i=0;i<playlistLinks.length;i++){
     const url=new URL(playlistLinks[i]!);
     if(url.host!=='s3.cloud.ru'||!url.searchParams.has('X-Amz-Signature')||
       !url.pathname.endsWith('/'+media.videoSegmentKeys[i]))throw Error('STAGE_HLS_URL_UNSAFE');
     const r=await fetch(url,{signal:AbortSignal.timeout(18000)});
     const data=Buffer.from(await r.arrayBuffer());
     if(r.status!==200||data.length%188!==0||data[0]!==0x47)throw Error('STAGE_HLS_SEGMENT_INVALID');
   }
   let actorDenied=false;
   try{await playback.manifest(st.media,ticket.ticket,'different_user','cloudru');}catch{actorDenied=true;}
   if(!actorDenied)throw Error('STAGE_HLS_OTHER_ACTOR_ALLOWED');
   let tamperDenied=false;
   try{await playback.manifest(st.media,ticket.ticket.slice(0,-2)+'XX',st.owner,'cloudru');}catch{tamperDenied=true;}
   if(!tamperDenied)throw Error('STAGE_HLS_TAMPER_ACCEPTED');
   await db.feedPost.update({where:{id:st.post},data:{deletedAt:new Date()}});
   let revoked=false;
   try{await playback.manifest(st.media,ticket.ticket,st.owner,'cloudru');}catch{revoked=true;}
   await db.feedPost.update({where:{id:st.post},data:{deletedAt:null}});
   if(!revoked)throw Error('STAGE_HLS_REVOKED_POST_ALLOWED');
   const fallback=await posts.fallbackSource(st.owner,st.media,'poster');
   if(fallback.key!==media.posterKey)throw Error('STAGE_POSTER_FALLBACK_DENIED');
   console.log(JSON.stringify({kind:'video',processing:'completed',publication:'published',posterBytes:poster.length,
     hlsSegments:playlistLinks.length,allSegmentsSigned:true,allSegmentsDownloaded:true,otherActorDenied:actorDenied,tamperDenied,deletedPostRevoked:revoked,posterFallback:true}));
  }
 }
 console.log('STAGING_CORE_REAL_MEDIA_HLS_FALLBACK_ACCEPTANCE=PASS');
}finally{await db.$disconnect();s3.destroy();}
