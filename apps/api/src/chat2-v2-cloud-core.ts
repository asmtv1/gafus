/** Dedicated Refactor-only Cloud.ru Container Service ingress for media Jobs.
 * No public GAFUS routes, no production database and no authorization bypass.
 * Imports providers only AFTER the strict environment preflight succeeds.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Hono } from 'hono';

const refactorProject='6777bd18-4ee9-4d15-bb1b-134f7a18ed3a';
export function assertChat2CloudCoreEnv(env:NodeJS.ProcessEnv):void{
 const fail=():never=>{throw Error('CHAT2_CLOUD_CORE_ISOLATION_DENIED');};
 if(env.CHAT2_CLOUD_CORE_MODE!=='refactor-nonproduction' ||
    env.CHAT2_CORE_NONPROD_VERIFIED!=='true' ||
    env.CHAT2_CLOUDRU_PROJECT_ID!==refactorProject ||
    env.CHAT2_V2_CORE_ENABLED!=='true' ||
    env.CHAT2_PROCESSOR_READY==='true' ||
    env.CHAT2_V2_MEDIA_ENABLED==='true' ||
    !env.CHAT2_INTERNAL_HMAC_SECRET ||
    Buffer.byteLength(env.CHAT2_INTERNAL_HMAC_SECRET)<32 ||
    env.CHAT2_CORE_BIND_ADDRESS!=='0.0.0.0' ||
    env.PORT!=='8080')fail();
 let db:URL,redis:URL;
 try{db=new URL(env.DATABASE_URL??'');redis=new URL(env.REDIS_URL??'');}
 catch{return fail();}
 // A dedicated empty/refactor-only remote DB and cache MUST be provisioned.
 // Never use localhost, existing production host, or general GAFUS database.
 if(db.protocol!=='postgresql:'||db.port!=='5432'||
    db.pathname!=='/refactor_chat2_v2_cloud'||
    db.username!=='gafus_refactor_chat2_cloud'||!db.password||
    db.searchParams.get('schema')!=='public'||db.searchParams.size!==1||db.hash||
    !/^([a-z0-9-]*refactor[a-z0-9-]*\.)+[a-z0-9.-]+$/i.test(db.hostname)||
    !db.hostname.includes('chat2'))fail();
 if(!['redis:','rediss:'].includes(redis.protocol)||
    !/^([a-z0-9-]*refactor[a-z0-9-]*\.)+[a-z0-9.-]+$/i.test(redis.hostname)||
    !redis.hostname.includes('chat2')||
    !/^[0-9]{2,5}$/.test(redis.port)||redis.pathname!=='/2'||redis.username||redis.hash)fail();
 // Protect isolated Core from outbound general application credentials.
 if(Object.keys(env).some(k=>/^(?:YOOKASSA_|PAYMENT_|SMTP_|SENDGRID_|VK_|APNS_|FCM_|FIREBASE_|TELEGRAM_|BEGET_)/.test(k)&&Boolean(env[k])))fail();
}

export function createChat2CloudCoreApp(
 routes:Hono,
 ready:()=>Promise<void>,
){
 const app=new Hono();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');
  c.header('X-Robots-Tag','noindex, nofollow');await next();});
 app.get('/healthz',async c=>{
  try{await ready();return c.json({ok:true});}
  catch{return c.json({ok:false},503);}
 });
 app.route('/internal/chat2/media/jobs',routes);
 app.notFound(c=>c.json({error:'NOT_FOUND'},404));
 return app;
}

export async function startChat2CloudCore(env:NodeJS.ProcessEnv=process.env){
 assertChat2CloudCoreEnv(env);
 const [{serve},{internalChat2MediaJobRoutes},{connection},{prisma}]=await Promise.all([
  import('@hono/node-server'),import('./routes/internal/chat2-media-jobs.js'),
  import('@gafus/queues'),import('@gafus/prisma'),
 ]);
 const ready=async()=>{await Promise.all([connection.ping(),prisma.$queryRaw`SELECT 1`]);};
 await ready();
 const app=createChat2CloudCoreApp(internalChat2MediaJobRoutes,ready);
 const server=serve({fetch:app.fetch,hostname:'0.0.0.0',port:8080});
 const shutdown=()=>{server.close();void Promise.allSettled([connection.quit(),prisma.$disconnect()]);};
 process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
 console.log('CHAT2_NONPROD_CORE_STARTED_ON_8080');
 return {server,app};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 void startChat2CloudCore().catch(()=>{console.error('CHAT2_NONPROD_CORE_START_REFUSED');process.exitCode=1;});
}
