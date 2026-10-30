/** True isolated local actor-access: real Hono JWT + Core ACL + signed MinIO readback.
 * Never contact Cloud.ru/Beget, never use shared PostgreSQL, Redis or S3.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { app } from '../app.js';
import { prisma } from '@gafus/prisma';
import { connection, pushQueue } from '@gafus/queues';
import { generateAccessToken } from '@gafus/auth/jwt';
import { isCdnOutage } from '@gafus/core-client/media-delivery';

const expectedDb='postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa';
const host='http://127.0.0.1:58343';
const s3host='http://127.0.0.1:58390';
const bytesA=Buffer.from('agent2-cdn-disposable-object-alpha');
const bytesB=Buffer.from('agent2-cdn-disposable-object-beta');
const buckets=['gafus-refactor-agent2-gallery-test','gafus-refactor-agent2-feed-test'] as const;
let server:Server,cdnStatusServer:Server,s3:S3Client;
const actors:{id:string;token:string}[]=[];
let album='',photoA='',photoB='',feedPost='',feedRevision='',feedMedia='';
const objects:{bucket:string,key:string}[]=[];
const validEnv=()=>process.env.DATABASE_URL===expectedDb &&
  process.env.REDIS_URL==='redis://127.0.0.1:56340' &&
  process.env.NODE_ENV==='test' && process.env.GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE==='1' &&
  process.env.GAFUS_CDN_LOCAL_S3_ENDPOINT===s3host &&
  process.env.GALLERY_MEDIA_FALLBACK_ENABLED==='true' && process.env.FEED_MEDIA_FALLBACK_ENABLED==='true';
const request=(actor:number|null,path:string,method='GET',body?:unknown)=>fetch(host+path,{
  method, headers:{...(actor!==null?{Authorization:`Bearer ${actors[actor]!.token}`}:{}) ,
    ...(body!==undefined?{'Content-Type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),
});
const data=async(actor:number|null,path:string,method='GET',body?:unknown)=>{
  const resp=await request(actor,path,method,body);
  const value=await resp.json() as { success:boolean; code?:string;data?:{url?:string;source?:string} };
  return {status:resp.status,body:value};
};
const photoPath=(id:string)=>`/api/v1/gallery/photos/${id}/fallback`;
const mediaPath=(id:string)=>`/api/v1/feed/media/${id}/fallback`;
const signed=async(index:number,path:string,variant:'full'|'thumb')=>{
  const result=await data(index,path,'POST',{variant});
  expect(result.status,`${path} as actor ${index}`).toBe(200);
  const uri=result.body.data?.url;
  expect(uri).toMatch(/^http:\/\/127\.0\.0\.1:58390\//);
  expect(new URL(uri!).searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]+$/);
  expect(result.body.data?.source).toBe('cloudru');
  return uri!;
};
const forbidden=async(index:number,path:string,variant:'full'|'thumb')=>{
  const result=await data(index,path,'POST',{variant});
  expect([401,403,404],`${path} ${result.status}`).toContain(result.status);
  expect(JSON.stringify(result.body)).not.toContain('X-Amz-Signature');
};
const put=async(bucket:string,key:string,body:Buffer)=>{
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'image/webp'}));
  objects.push({bucket,key});
};
const verifyRead=async(url:string,buffer:Buffer)=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer()).equals(buffer)).toBe(true);
};

beforeAll(async()=>{
  if(!validEnv())throw Error('CDN_QA_UNSAFE_ENVIRONMENT');
  const [{dir}]=await prisma.$queryRawUnsafe<{dir:string}[]>("SELECT current_setting('data_directory') AS dir");
  if(!dir.includes('/.local-pg-scratch/agent2-cdn-full-')||!dir.endsWith('/pg'))
    throw Error('CDN_QA_WRONG_POSTGRES_DATA_DIRECTORY');
  if(await connection.ping()!=='PONG')throw Error('CDN_QA_REDIS_UNAVAILABLE');
  const minio=await fetch(s3host+'/minio/health/live');
  if(minio.status!==200)throw Error('CDN_QA_MINIO_UNAVAILABLE');
  s3=new S3Client({endpoint:s3host,region:'us-east-1',forcePathStyle:true,maxAttempts:1,
    credentials:{accessKeyId:process.env.GAFUS_CDN_LOCAL_S3_KEY!,secretAccessKey:process.env.GAFUS_CDN_LOCAL_S3_SECRET!},
    requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  for(const Bucket of buckets)await s3.send(new CreateBucketCommand({Bucket}));
  for(const role of ['owner','member','outsider']){
    const user=await prisma.user.create({data:{username:`agent2cdn_${role}_${randomUUID().slice(0,8)}`,
      password:'qa-no-login',registrationPending:false},select:{id:true,username:true,role:true}});
    actors.push({id:user.id,token:await generateAccessToken(user)});
  }
  server=createServer(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks);
      const response=await app.request(new Request(`${host}${req.url}`,{
        method:req.method,headers:req.headers as HeadersInit,...(body.length?{body}:{})}));
      response.headers.forEach((v,k)=>res.setHeader(k,v));
      res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500);res.end();}
  });
  server.listen(58343,'127.0.0.1');await once(server,'listening');
  cdnStatusServer=createServer((req,res)=>{
    const url=new URL(req.url??'','http://127.0.0.1:58344');
    const match=/^\/(?:feed|gallery)\/(403|404|410|503|504)$/.exec(url.pathname);
    if(req.method!=='HEAD'||!match){res.writeHead(404);res.end();return;}
    res.writeHead(Number(match[1]),{'Cache-Control':'no-store'});res.end();
  });
  cdnStatusServer.listen(58344,'127.0.0.1');await once(cdnStatusServer,'listening');
},45000);
afterAll(async()=>{
  if(server)await new Promise<void>(r=>server.close(()=>r()));
  if(cdnStatusServer)await new Promise<void>(r=>cdnStatusServer.close(()=>r()));
  if(validEnv()){
    // Real actor/source cleanup; only our synthetic users and own S3 objects.
    if(actors.length)await prisma.user.deleteMany({where:{id:{in:actors.map(x=>x.id)}}});
    if(s3){
      for(const {bucket,key} of objects)await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
      for(const Bucket of buckets)await s3.send(new DeleteBucketCommand({Bucket}));
      s3.destroy();
    }
  }
  await prisma.$disconnect();await pushQueue.close();await connection.quit();
},45000);

describe('real disposable gallery/feed actor-scoped fallback',()=>{
  it('creates only our own private MinIO objects and denies anonymous API/S3',async()=>{
    const owner=actors[0]!.id;
    const albumRow=await prisma.galleryAlbum.create({data:{ownerId:owner,name:'cdn private',isVisible:false}});
    album=albumRow.id;
    for(const [index,body] of [bytesA,bytesB].entries()){
      const id=randomUUID();const key=`gallery/${owner}/media/${id}/v2/full.webp`;
      await prisma.galleryPhoto.create({data:{id,albumId:album,ownerId:owner,status:'ready',fullKey:key,
        reservationExpiresAt:new Date(Date.now()+60000)}});
      await put(buckets[0],key,body);
      if(index===0)photoA=id; else photoB=id;
    }
    expect((await request(null,photoPath(photoA),'POST',{variant:'full'})).status).toBe(401);
    expect((await fetch(`${s3host}/${buckets[0]}/${objects[0]!.key}`)).status).toBe(403);
  });
  it('private Gallery owner allowed; member/outsider denied, public member allowed then revoked',async()=>{
    const ownerSigned=await signed(0,photoPath(photoA),'full');
    await verifyRead(ownerSigned,bytesA);
    await forbidden(1,photoPath(photoA),'full');
    await forbidden(2,photoPath(photoA),'full');
    await prisma.galleryAlbum.update({where:{id:album},data:{isVisible:true}});
    const memberSigned=await signed(1,photoPath(photoA),'full');
    await verifyRead(memberSigned,bytesA);
    const secondSigned=await signed(1,photoPath(photoB),'full');
    await verifyRead(secondSigned,bytesB);
    expect(new URL(memberSigned).pathname).not.toBe(new URL(secondSigned).pathname);
    // Do not serve stale object B with object A's authorization or key.
    await prisma.galleryAlbum.update({where:{id:album},data:{isVisible:false}});
    await forbidden(1,photoPath(photoA),'full');
    await forbidden(2,photoPath(photoB),'full');
    await verifyRead(ownerSigned,bytesA);
  });
  it('deleted Gallery object refuses new fallback and local S3 deletion revokes old signed read',async()=>{
    const granted=await signed(0,photoPath(photoB),'full');
    await prisma.galleryPhoto.update({where:{id:photoB},data:{deletedAt:new Date()}});
    await forbidden(0,photoPath(photoB),'full');
    await forbidden(1,photoPath(photoB),'full');
    await s3.send(new DeleteObjectCommand({Bucket:buckets[0],Key:objects[1]!.key}));
    expect((await fetch(granted)).status).toBe(404);
  });
  it('real local CDN HEAD 403/404 fail closed, 410/5xx may request Core-authorized fallback only',async()=>{
    for(const variant of ['gallery','feed'] as const){
      const obj=variant==='gallery'?photoA:feedMedia;
      const route=variant==='gallery'?photoPath(obj):mediaPath(obj);
      // Feed fixture exists only after the next test; create no new object here.
      if(variant==='feed' && !obj)continue;
      const payload=variant==='gallery'?{variant:'full'}:{variant:'thumb'};
      for(const status of [403,404,410,503,504] as const){
        const url=`http://127.0.0.1:58344/${variant}/${status}`;
        const probe=await request(0,`/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`);
        expect(probe.status).toBe(status);
        expect(await probe.text()).toBe('');
        const shouldRecover=isCdnOutage({status:probe.status});
        expect(shouldRecover).toBe(status===410||status>=500);
        if(shouldRecover){
          expect((await data(0,route,'POST',payload)).status).toBe(200);
          if(variant==='gallery')await forbidden(1,route,'full');
        }
      }
    }
    const invalid=await request(0,`/api/v1/media-cdn-probe?url=${encodeURIComponent('http://127.0.0.1:58345/other/410')}`);
    expect(invalid.status).toBe(400);
    expect((await request(null,'/api/v1/media-cdn-probe?url=http%3A%2F%2F127.0.0.1%3A58344%2Fgallery%2F410')).status).toBe(401);
  });
  it('Feed published media grants distinct actors, moderation/delete revoke new grants',async()=>{
    const owner=actors[0]!.id;
    const post=await prisma.feedPost.create({data:{authorId:owner,clientRequestId:randomUUID(),status:'published',publishedAt:new Date()}});
    feedPost=post.id;
    const rev=await prisma.feedPostRevision.create({data:{postId:post.id,revisionNumber:1,status:'ready',clientRequestId:randomUUID(),text:'fixture'}});
    feedRevision=rev.id;
    await prisma.feedPost.update({where:{id:post.id},data:{activeRevisionId:rev.id}});
    const id=randomUUID();feedMedia=id;
    const key=`media/v2/${id}/v1/image/m.webp`;
    await prisma.feedMediaAsset.create({data:{id,postId:post.id,ownerId:owner,kind:'photo',status:'ready',thumbKey:key}});
    await prisma.feedRevisionAttachment.create({data:{mediaId:id,revisionId:rev.id,position:0}});
    await put(buckets[1],key,bytesA);
    const fallback=async(i:number)=>data(i,mediaPath(id),'POST',{variant:'thumb'});
    expect((await request(null,mediaPath(id),'POST',{variant:'thumb'})).status).toBe(401);
    const author=await fallback(0); expect(author.status).toBe(200);
    const member=await fallback(1); expect(member.status).toBe(200);
    await verifyRead(member.body.data!.url!,bytesA);
    expect((await fallback(2)).status).toBe(200); // published Moments are public to signed-in actors
    for(const status of [403,404,410,503,504] as const){
      const url=`http://127.0.0.1:58344/feed/${status}`;
      const probe=await request(1,`/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`);
      expect(probe.status).toBe(status);
      expect(await probe.text()).toBe('');
      const shouldRecover=isCdnOutage({status:probe.status});
      expect(shouldRecover).toBe(status===410||status>=500);
      if(shouldRecover)expect((await fallback(1)).status).toBe(200);
    }
    await prisma.feedPost.update({where:{id:post.id},data:{moderationState:'hidden'}});
    await forbidden(0,mediaPath(id),'thumb');
    await forbidden(1,mediaPath(id),'thumb');
    await forbidden(2,mediaPath(id),'thumb');
    await prisma.feedPost.update({where:{id:post.id},data:{moderationState:'visible',deletedAt:new Date()}});
    await forbidden(0,mediaPath(id),'thumb');
    await forbidden(2,mediaPath(id),'thumb');
    await s3.send(new DeleteObjectCommand({Bucket:buckets[1],Key:key}));
    expect((await fetch(author.body.data!.url!)).status).toBe(404);
  });
});
