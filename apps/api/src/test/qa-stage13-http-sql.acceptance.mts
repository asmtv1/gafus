/** Real mounted Hono over TCP + disposable PG18/Redis; no API mocks. */
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {once} from 'node:events';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const report=process.env.GAFUS_TEST_REPORT_PATH??'';
const sourceFile=fileURLToPath(import.meta.url);
const sourceDir=dirname(sourceFile);
const root=resolve(sourceDir,'../../../..');
const db=new URL(process.env.DATABASE_URL??'http://invalid');
const redis=new URL(process.env.REDIS_URL??'http://invalid');
assert.equal(process.env.GAFUS_QA_AUTH_API_HTTP,'1');
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,'1');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(db.protocol,'postgresql:');assert.equal(db.hostname,'127.0.0.1');
assert.equal(db.username,'qahttp');assert.match(db.pathname,/^\/archqa_http_[a-f0-9]{12}$/);
assert.match(db.port,/^\d{4,5}$/);assert.equal(redis.protocol,'redis:');
assert.equal(redis.hostname,'127.0.0.1');assert.match(redis.port,/^\d{4,5}$/);
assert.equal(redis.pathname,'/0');
assert.ok(report.startsWith(root+'/.qa/testing/'));
assert.match(report,/\/qa-[a-z0-9-]+\/tasks\/[a-f0-9]{20}\/attempt-[1-9][0-9]*\/tests\.json$/);
assert.ok((process.env.JWT_SECRET??'').length>=32);
assert.ok((process.env.JWT_REFRESH_SECRET??'').length>=32);
for(const flag of ['FEED_ENABLED','GALLERY_ENABLED','CDN_HEALTH_MONITOR_ENABLED'])assert.equal(process.env[flag],'false');
const prefix='qahttp'+randomBytes(5).toString('hex');
const names:string[]=[];
const observations:{name:string,http:{path:string,method:string,status:number,code:string|null}[],sql:Record<string,string|number|boolean|null>}[]=[];
const http:{path:string,method:string,status:number,code:string|null}[]=[];
const actors:Record<string,{id:string,username:string,password:string,role:'USER'|'TRAINER'|'ADMIN',token?:string,refresh?:string}>={};
let base='',server:ReturnType<typeof import('@hono/node-server').serve>|undefined,phase='preflight',error:Error|undefined,dbName='';
const obj=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
async function request(path:string,method='GET',token?:string,payload?:any){
  assert.ok(base.startsWith('http://127.0.0.1:'));
  const response=await fetch(base+'/api/v1'+path,{method,headers:{Accept:'application/json',
    ...(token?{Authorization:'Bearer '+token}:{}),...(payload===undefined?{}:{'Content-Type':'application/json'})},
    body:payload===undefined?undefined:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(30000)});
  const json=obj(await response.json().catch(()=>null));
  http.push({path,method,status:response.status,code:typeof json.code==='string'?json.code:null});
  return {status:response.status,json,response};
}
async function caseRun(name:string,fn:()=>Promise<Record<string,string|number|boolean|null>>){
  phase=name;const offset=http.length;const sql=await fn();
  names.push(name);observations.push({name,http:http.slice(offset),sql});console.log('QA_API_HTTP_SQL_PASS',name);
}
const session=(id:string)=>prisma.refreshToken.findMany({where:{userId:id},select:{tokenHash:true,revokedAt:true}});
async function actor(key:string,role:'USER'|'TRAINER'|'ADMIN'){
  const username=prefix+'_'+key,password=randomBytes(24).toString('base64url');
  const row=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    passwordSetAt:new Date(),registrationPending:false,role}});
  actors[key]={id:row.id,username,password,role};return actors[key];
}
try{
  const rows=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
  dbName=rows[0]?.db??'';assert.equal(dbName,db.pathname.slice(1));
  const [{app},{serve}]=await Promise.all([import('../app.js'),import('@hono/node-server')]);
  const running=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});
  server=running;
  if(!running.listening)await once(running,'listening');
  const address=running.address();assert.ok(address && typeof address!=='string' && address.port>1024);
  base=`http://127.0.0.1:${address.port}`;
  const trainer=await actor('trainer','TRAINER');const learner=await actor('learner','USER');
  const outsider=await actor('outsider','USER');const admin=await actor('admin','ADMIN');
  for(const a of [trainer,learner,outsider,admin]){
    const r=await request('/auth/login','POST',undefined,{username:a.username,password:a.password});
    assert.equal(r.status,200,JSON.stringify({role:a.role,status:r.status,code:r.json.code}));
    a.token=r.json.data.accessToken; assert.equal(typeof a.token,'string');
  }
  await prisma.appFeatureFlag.upsert({where:{key:'app_subscription_gating_enabled'},create:{key:'app_subscription_gating_enabled',enabled:true},update:{enabled:true}});
  await caseRun('article paid detail, grant, expiry, foreign and cache ACL',async()=>{
    const media='https://qa.invalid/paid-video', image='https://qa.invalid/paid-image', marker='SYNTHETIC_PROTECTED_BODY';
    const article=await prisma.article.create({data:{authorId:trainer.id,title:'QA article',slug:prefix+'-article',visibility:'PAID',contentType:'HTML',content:'<p>'+marker+'</p>',videoUrl:media,imageUrls:[image]}});
    const path='/articles/'+article.slug;
    const denied=await request(path);assert.equal(denied.status,401);assert.match(denied.response.headers.get('cache-control')??'',/no-store/);
    const locked=async(a:typeof learner)=>{
      const r=await request(path,'GET',a.token);assert.equal(r.status,200);assert.equal(r.json.data.hasAccess,false);
      assert.equal(r.json.data.content,null);assert.equal(r.json.data.videoUrl,null);assert.deepEqual(r.json.data.imageUrls,[]);
      assert.match(r.response.headers.get('cache-control')??'',/private.*no-store/);
      assert.ok(!JSON.stringify(r.json).includes(marker));return r.status;
    };
    await locked(learner);await locked(outsider);
    const like=await request('/articles/'+article.id+'/like','POST',outsider.token,{});assert.equal(like.status,402);assert.equal(await prisma.articleLike.count({where:{articleId:article.id}}),0);
    const tr=await prisma.gafusTransaction.create({data:{userId:learner.id,kind:'SPEND',delta:-1,balanceBefore:1,balanceAfter:0,idempotencyKey:prefix+'-article-grant',targetType:'ARTICLE',targetKey:'article:'+article.id,settingsRevision:1}});
    const grant=await prisma.gafusTargetAccess.create({data:{userId:learner.id,targetType:'ARTICLE',targetKey:'article:'+article.id,transactionId:tr.id,settingsRevision:1,expiresAt:new Date(Date.now()+3600000)}});
    const allowed=await request(path,'GET',learner.token);assert.equal(allowed.status,200);assert.equal(allowed.json.data.hasAccess,true);assert.match(allowed.json.data.content,new RegExp(marker));assert.equal(allowed.json.data.videoUrl,media);assert.deepEqual(allowed.json.data.imageUrls,[image]);assert.match(allowed.response.headers.get('cache-control')??'',/private.*no-store/);
    await locked(outsider);
    await prisma.gafusTargetAccess.update({where:{id:grant.id},data:{expiresAt:new Date(Date.now()-1000)}});
    await locked(learner);
    return {anonymous:denied.status,foreignLike:like.status,grant:allowed.status,expiryDenied:true,protectedMediaRedacted:true};
  });
  await caseRun('Q&A mounted owner ACL, hidden question and hidden answer',async()=>{
    const q=await prisma.question.create({data:{authorId:learner.id,clientRequestId:randomUUID(),title:'Synthetic question',body:'Synthetic body',category:'training'}});
    const a=await prisma.questionAnswer.create({data:{questionId:q.id,authorId:trainer.id,clientRequestId:randomUUID(),body:'Synthetic answer'}});
    const b=await prisma.questionAnswer.create({data:{questionId:q.id,authorId:outsider.id,clientRequestId:randomUUID(),body:'SYNTHETIC_HIDDEN_ANSWER',hiddenAt:new Date()}});
    const path='/questions/'+q.id;
    assert.equal((await request(path)).status,401);
    const foreign=await request(path+'/best','POST',outsider.token,{answerId:a.id});assert.equal(foreign.status,403);
    assert.equal((await prisma.question.findUniqueOrThrow({where:{id:q.id}})).bestAnswerId,null);
    const hidden=await request(path+'/best','POST',learner.token,{answerId:b.id});assert.equal(hidden.status,400);
    const own=await request(path+'/best','POST',learner.token,{answerId:a.id});assert.equal(own.status,200);
    assert.equal((await prisma.question.findUniqueOrThrow({where:{id:q.id}})).bestAnswerId,a.id);
    const detail=await request(path,'GET',outsider.token);assert.equal(detail.status,200);assert.ok(!JSON.stringify(detail.json).includes('SYNTHETIC_HIDDEN_ANSWER'));
    await prisma.question.update({where:{id:q.id},data:{hiddenAt:new Date()}});
    const inaccessible=await request(path,'GET',outsider.token);assert.equal(inaccessible.status,404);
    return {foreign:foreign.status,hiddenAnswer:hidden.status,owner:own.status,hiddenQuestion:inaccessible.status};
  });
  await caseRun('consultation mounted owner lookup/list and foreign cancel/confirm',async()=>{
    const cyn=await prisma.consultationCynologist.create({data:{userId:trainer.id,isListed:true}});
    const start=new Date(Date.now()+3*86400000);
    const slot=await prisma.consultationSlot.create({data:{cynologistId:cyn.id,startAt:start,endAt:new Date(+start+1800000),status:'BOOKED'}});
    const booking=await prisma.consultationBooking.create({data:{clientId:learner.id,cynologistId:cyn.id,slotId:slot.id,clientProblem:'SYNTHETIC_BOOKING_PRIVATE',confirmationDeadlineAt:new Date(Date.now()+3600000)}});
    const key=randomUUID();
    await prisma.consultationBookingIdempotency.create({data:{clientId:learner.id,key,bookingId:booking.id,responseJson:{state:'BOOKING_CREATED'},expiresAt:new Date(Date.now()+3600000)}});
    const lookup=(a:typeof learner,k:string)=>request('/consultations/book/lookup','POST',a.token,{idempotencyKey:k});
    const own=await lookup(learner,key);assert.equal(own.status,200);assert.equal(own.json.data.state,'FOUND');assert.equal(own.json.data.booking.id,booking.id);assert.match(own.response.headers.get('cache-control')??'',/private.*no-store/);
    const foreign=await lookup(outsider,key), missing=await lookup(outsider,randomUUID());assert.equal(foreign.status,200);assert.deepEqual(foreign.json,missing.json);assert.deepEqual(foreign.json.data,{state:'UNKNOWN'});
    const ownList=await request('/consultations/my','GET',learner.token), foreignList=await request('/consultations/my','GET',outsider.token);
    assert.equal(ownList.status,200);assert.equal(foreignList.status,200);assert.equal(ownList.json.data.items[0].id,booking.id);assert.deepEqual(foreignList.json.data.items,[]);
    const cancel=await request('/consultations/bookings/'+booking.id+'/cancel','POST',outsider.token,{});assert.equal(cancel.status,403);
    const confirm=await request('/consultations/trainer/bookings/'+booking.id+'/confirm','POST',outsider.token,{});assert.equal(confirm.status,403);
    assert.equal((await prisma.consultationBooking.findUniqueOrThrow({where:{id:booking.id}})).status,'PENDING_TRAINER_CONFIRMATION');
    return {ownerLookup:own.status,foreignUnknown:true,foreignCancel:cancel.status,nonStaffConfirm:confirm.status,unchanged:true};
  });
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
  await prisma.article.createMany({data:Array.from({length:200},(_,i)=>({authorId:trainer.id,title:'Synthetic article '+i,slug:prefix+'-bench-'+i,content:'x'.repeat(8192),description:'teaser',visibility:'PAID' as const,createdAt:new Date(Date.now()-i*1000)}))});
  await prisma.question.createMany({data:Array.from({length:200},(_,i)=>({authorId:learner.id,clientRequestId:randomUUID(),title:'Synthetic question '+i,body:'x'.repeat(1024),category:'training',createdAt:new Date(Date.now()-i*1000),hiddenAt:i%5===0?new Date():null}))});
  await prisma.$executeRawUnsafe('ANALYZE');
  const metrics:any[]=[];
  for(const [name,path] of [['articles','/articles'],['questions','/questions']]){
    await caseRun(name+' list SQL reader size',async()=>{
      const warm=await request(path,'GET',outsider.token);assert.equal(warm.status,200);
      await prisma.$queryRawUnsafe('SELECT pg_stat_statements_reset()');
      const start=performance.now();const result=await request(path,'GET',outsider.token);const ms=performance.now()-start;assert.equal(result.status,200);
      const items=name==='articles'?result.json.data:result.json.data.items;assert.ok(Array.isArray(items));assert.ok(items.length>0);
      const rows=await prisma.$queryRawUnsafe<{query:string,calls:string,rows:string,shared_blks_hit:string,shared_blks_read:string,total_exec_time:number}[]>(`SELECT query,calls::text,rows::text,shared_blks_hit::text,shared_blks_read::text,total_exec_time FROM pg_stat_statements WHERE query ~* '^\\s*select' AND query NOT ILIKE '%pg_stat_statements%' ORDER BY calls DESC,query`);
      assert.ok(rows.length>0);
      const m={name,seedCount:200,returnedItems:items.length,responseJsonBytes:Buffer.byteLength(JSON.stringify(result.json)),httpMs:ms,selectCalls:rows.reduce((a,r)=>a+Number(r.calls),0),sqlReturnedRows:rows.reduce((a,r)=>a+Number(r.rows),0),statements:rows};
      metrics.push(m);console.log('STAGE13_LIST_SQL',JSON.stringify(m));return {items:m.returnedItems,selectCalls:m.selectCalls,sqlReturnedRows:m.sqlReturnedRows,responseJsonBytes:m.responseJsonBytes,httpMs:m.httpMs};
    });
  }
  writeFileSync(dirname(report)+'/list-sql.json',JSON.stringify(metrics,null,2)+'\n',{mode:0o600});
}catch(e){error=e instanceof Error?e:new Error(String(e));console.error('QA_HTTP_SQL_FAIL',phase,error.stack)}
finally{
  if(server)await new Promise<void>(done=>server!.close(()=>done()));
  try{await prisma.$disconnect()}catch{}
  try{const {connection}=await import('@gafus/queues');await Promise.race([connection.quit(),new Promise(done=>setTimeout(done,1800))])}catch{}
}
const pass=!error&&names.length===5;
writeFileSync(dirname(report)+'/stage13-http-sql.json',JSON.stringify({sourceSha256:createHash('sha256').update(readFileSync(sourceFile)).digest('hex'),database:dbName,loopback:base,passed:names,failedPhase:error?phase:null,observations},null,2)+'\n',{mode:0o600});
writeFileSync(report,JSON.stringify({numPassedTests:names.length,numFailedTests:error?1:0,numPendingTests:0,testResults:[{name:sourceFile,assertionResults:names.map(name=>({fullName:name,title:name,status:'passed'}))}]},null,2)+'\n',{mode:0o600});
console.log('STAGE13_HTTP_RESULT',JSON.stringify({passing:names.length,failed:!!error}));
process.exit(pass?0:2);
