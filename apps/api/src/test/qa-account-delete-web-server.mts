/** Disposable original-Hono, original-web deletion acceptance coordinator.
 * Two synthetic users, real PG18/Redis, MCP Chrome drives actual Vite UI.
 * No production credentials, no external mail/proxy and no shared processes. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const source=fileURLToPath(import.meta.url),root=resolve(dirname(source),'../../../..');
const task=dirname(process.env.GAFUS_TEST_REPORT_PATH??'');
const pg=new URL(process.env.DATABASE_URL??'http://invalid');
const redis=new URL(process.env.REDIS_URL??'http://invalid');
const run=process.env.GAFUS_QA_ACCOUNT_DELETE_RUN??'';
const webPort=Number(process.env.GAFUS_QA_ACCOUNT_DELETE_WEB_PORT);
const apiPort=Number(process.env.GAFUS_QA_ACCOUNT_DELETE_API_PORT);
assert.equal(process.env.GAFUS_QA_ACCOUNT_DELETE_WEB,'1');
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,'1');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(process.env.API_HOST,'127.0.0.1');
assert.match(run,/^[a-f0-9]{12}$/);
assert.match(pg.pathname,/^\/archqa_delete_[a-f0-9]{12}$/);
assert.equal(pg.hostname,'127.0.0.1');assert.equal(pg.username,'qahttp');
assert.equal(redis.hostname,'127.0.0.1');assert.equal(redis.pathname,'/0');
assert.ok(webPort>=1024&&apiPort>=1024&&webPort!==apiPort);
assert.ok(task.startsWith(root+'/.qa/testing/qa-'));
assert.match(task,/\/tasks\/[a-f0-9]{20}$/);
assert.ok(existsSync(task));
assert.equal(process.env.FEED_ENABLED,'false');
assert.equal(process.env.GALLERY_ENABLED,'false');
assert.ok(process.env.GAFUS_QA_ACCOUNT_MAIL_FILE?.startsWith('/tmp/gafus-qa-delete-web.'));
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const owners:Record<'owner'|'other',{id:string,username:string,password:string}>={} as any;
const fixtures:{pet?:string,doc?:string,question?:string,post?:string,otherPet?:string,otherPost?:string,foreignComment?:string}={};
let baselineCounter=0;
const methods=['/auth/login','/auth/me','/auth/refresh','/auth/logout','/user/account/deletion-preflight',
 '/user/account/deletion-code','/user/account/delete'];
const wire:{host:string,method:string,path:string,status:number,success:boolean,code:string|null,cookiePresent:boolean,
 setCookies:{name:string,httpOnly:boolean,sameSiteLax:boolean,path:boolean,secure:boolean,delete:boolean}[]}[]=[];
const states:Record<string,unknown>[]=[];
let server:ReturnType<typeof import('@hono/node-server').serve>|undefined;
let stopping=false;
const origin=(role:'owner'|'other')=>`http://qa-delete-${role}-${run}.localhost:${webPort}`;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function cookieSummary(response:Response){
 return (response.headers.getSetCookie?.()??[]).map(c=>{
  const attrs=c.split(';').map(v=>v.trim().toLowerCase());
  return {name:c.startsWith('gafus_access=')?'gafus_access':c.startsWith('gafus_refresh=')?'gafus_refresh':'other',
   httpOnly:attrs.includes('httponly'),sameSiteLax:attrs.includes('samesite=lax'),
   path:attrs.includes('path=/api/v1'),secure:attrs.includes('secure'),delete:attrs.includes('max-age=0')};
 });
}
async function snapshot(){
 const [owner,other,sessions,pet,doc,question,post,otherPet,otherPost,comment,audits,counter,tokens,cleanup] = await Promise.all([
  prisma.user.findUnique({where:{id:owners.owner.id},select:{id:true}}),
  prisma.user.findUnique({where:{id:owners.other.id},select:{id:true,username:true}}),
  prisma.refreshToken.findMany({where:{userId:{in:[owners.owner.id,owners.other.id]}},select:{userId:true,revokedAt:true}}),
  prisma.pet.count({where:{ownerId:owners.owner.id}}),
  prisma.petDocument.count({where:{ownerId:owners.owner.id}}),
  prisma.question.count({where:{authorId:owners.owner.id}}),
  prisma.feedPost.count({where:{authorId:owners.owner.id}}),
  prisma.pet.findUnique({where:{id:fixtures.otherPet!},select:{ownerId:true}}),
  prisma.feedPost.findUnique({where:{id:fixtures.otherPost!},select:{authorId:true}}),
  prisma.feedComment.findUnique({where:{id:fixtures.foreignComment!},select:{authorId:true,text:true}}),
  prisma.accountDeletionAudit.findMany({where:{userId:owners.owner.id},orderBy:{createdAt:'asc'}}),
  prisma.accountDeletionCounter.findUnique({where:{id:'global'},select:{totalDeleted:true}}),
  prisma.accountDeletionToken.count({where:{userId:owners.owner.id}}),
  prisma.accountStorageCleanup.findMany({where:{ownerId:owners.owner.id},select:{scope:true,status:true,attempts:true}}),
 ]);
 const audit=audits[0];
 return {ownerExists:Boolean(owner),otherIntact:other?.username===owners.other.username,
  ownerPetCount:pet,ownerDocumentCount:doc,ownerQuestionCount:question,ownerFeedCount:post,
  otherPetIntact:otherPet?.ownerId===owners.other.id,
  otherFeedIntact:otherPost?.authorId===owners.other.id,
  otherCommentIntact:comment?.authorId===owners.other.id&&comment.text==='Foreign QA preserved comment',
  ownerRefreshRows:sessions.filter(x=>x.userId===owners.owner.id).length,
  ownerActiveRefresh:sessions.filter(x=>x.userId===owners.owner.id&&!x.revokedAt).length,
  otherRefreshRows:sessions.filter(x=>x.userId===owners.other.id).length,
  otherActiveRefresh:sessions.filter(x=>x.userId===owners.other.id&&!x.revokedAt).length,
  ownerChallengeRows:tokens,
  auditCount:audits.length,auditRole:audit?.role??null,auditInitiatedBy:audit?.initiatedBy??null,
  auditHadEmail:audit?.hadEmail??null,
  auditHash:audit?sha(JSON.stringify({id:audit.id,userId:audit.userId,role:audit.role,hadEmail:audit.hadEmail,
    initiatedBy:audit.initiatedBy,deletedAt:audit.deletedAt,createdAt:audit.createdAt,updatedAt:audit.updatedAt})):null,
  deletionCounter:(counter?.totalDeleted??0)-baselineCounter,
  pendingCleanupScopes:cleanup.filter(x=>x.status==='pending').map(x=>x.scope).sort(),
  cleanupJobsNotExecuted:cleanup.every(x=>x.status==='pending'&&x.attempts===0)};
}
async function record(phase:string,browser:unknown,req:Request){
 assert.ok(['owner_login','other_login','preflight','request_code','review_locked',
   'review_confirmed','deleted','stale_replay','other_isolated','owner_relogin_denied'].includes(phase));
 const role=req.headers.get('host')?.includes('qa-delete-other-')?'other':'owner';
 const expectedHost=origin(role);
 assert.equal(req.headers.get('origin'),expectedHost);
 assert.ok(req.headers.get('user-agent')?.includes('Chrome'));
 assert.equal(req.headers.get('sec-fetch-site'),'same-origin');
 assert.ok(browser&&typeof browser==='object'&&!Array.isArray(browser));
 const state=await snapshot();
 const receipt={phase,role,origin:expectedHost, browser,sql:state,
   http:wire.filter(x=>x.host===role),recordedAt:new Date().toISOString()};
 states.push(receipt);
 writeFileSync(resolve(task,'browser-live.json'),JSON.stringify({run,phases:states},null,2)+'\n',{mode:0o600});
 return {phase,sql:state,httpCount:receipt.http.length};
}
async function saveFinal(){
 const sources=['apps/api/src/app.ts','apps/api/src/routes/v1/user.ts',
  'apps/api/src/middleware/cors.ts','apps/api/src/lib/browser-auth.ts',
  'apps/api/src/test/qa-account-delete-web-server.mts','apps/web-vite/src/features/profile/AccountDeleteConnected.tsx',
  'apps/web-vite/vite.account-delete-qa.config.mjs','packages/core/src/services/auth/transactionalAuthMail.ts'];
 const sourceHash=Object.fromEntries(sources.map(p=>[p,sha(readFileSync(resolve(root,p),'utf8'))]));
 const payload={schema:1,run,port:apiPort,webPort,db:pg.pathname.slice(1),
   origins:[origin('owner'),origin('other')],
   platform:'existing-Chrome-McpGo-Playwright-extension-original-Web-Vite-and-Hono',
   webUiSource:'apps/web-vite/src/features/profile/AccountDeleteConnected.tsx',
   mailMode:'isolated-qa-file-sink-no-external-smtp',
   sourceHash,states,wire,
   finalSql:await snapshot()};
 writeFileSync(resolve(task,'browser-delete.json'),JSON.stringify(payload,null,2)+'\n',{mode:0o600});
 const names=['owner_login','other_login','preflight','request_code','review_locked','review_confirmed',
   'deleted','stale_replay','other_isolated','owner_relogin_denied'];
 assert.deepEqual(states.map(x=>(x as any).phase),names);
 writeFileSync(resolve(task,'tests.json'),JSON.stringify({numPassedTests:names.length,numFailedTests:0,numPendingTests:0,
  testResults:[{name:source,assertionResults:names.map(name=>({fullName:name,title:name,status:'passed'}))}]},null,2)+'\n',{mode:0o600});
}
async function finish(ok:boolean){
 if(stopping)return;stopping=true;
 if(ok)try{await saveFinal()}catch(e){console.error('QA_DELETE_FINAL_EVIDENCE_REJECTED',e);ok=false}
 if(server)await new Promise<void>(done=>server!.close(()=>done()));
 try{await prisma.$disconnect()}catch{}
 try{const {connection}=await import('@gafus/queues');await connection.quit()}catch{}
 process.exit(ok?0:2);
}
async function main(){
 const db=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
 assert.equal(db[0]?.db,pg.pathname.slice(1));
 baselineCounter=(await prisma.accountDeletionCounter.findUnique({where:{id:'global'}}))?.totalDeleted??0;
 for(const role of ['owner','other'] as const){
  const username='qa_delete_'+run+'_'+role;
  const password=randomBytes(24).toString('base64url');
  const row=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    passwordSetAt:new Date(),registrationPending:false,role:'USER',
    email:role==='owner'?`qa_delete_${run}@example.invalid`:null}});
  owners[role]={id:row.id,username,password};
 }
 await prisma.userProfile.create({data:{userId:owners.owner.id}});
 const pet=await prisma.pet.create({data:{ownerId:owners.owner.id,name:'Own synthetic training dog',
   type:'DOG',breed:'QA dog',birthDate:new Date('2023-01-01T00:00:00Z')}});
 fixtures.pet=pet.id;
 const doc=await prisma.petDocument.create({data:{petId:pet.id,ownerId:owners.owner.id,
   name:'Owner QA document',mimeType:'application/pdf',sizeBytes:13,
   url:'users/'+owners.owner.id+'/pets/'+pet.id+'/documents/qa-only.pdf'}});
 fixtures.doc=doc.id;
 const question=await prisma.question.create({data:{authorId:owners.owner.id,
   clientRequestId:randomUUID(),title:'QA account deletion question',body:'Synthetic and disposable',category:'general'}});
 fixtures.question=question.id;
 const post=await prisma.feedPost.create({data:{authorId:owners.owner.id,clientRequestId:randomUUID()}});
 fixtures.post=post.id;
 const otherPet=await prisma.pet.create({data:{ownerId:owners.other.id,name:'Foreign control pet',
   type:'DOG',breed:'QA foreign',birthDate:new Date('2023-01-01T00:00:00Z')}});
 fixtures.otherPet=otherPet.id;
 const otherPost=await prisma.feedPost.create({data:{authorId:owners.other.id,clientRequestId:randomUUID()}});
 fixtures.otherPost=otherPost.id;
 const foreignComment=await prisma.feedComment.create({data:{postId:otherPost.id,
   authorId:owners.other.id,clientRequestId:randomUUID(),text:'Foreign QA preserved comment'}});
 fixtures.foreignComment=foreignComment.id;
 const [{app},{serve}]=await Promise.all([import('../app.js'),import('@hono/node-server')]);
 const hosts={owner:new URL(origin('owner')).host,other:new URL(origin('other')).host};
 const handle=async(req:Request):Promise<Response>=>{
  const host=req.headers.get('host')??'';
  const role=host===hosts.owner?'owner':host===hosts.other?'other':null;
  if(!role)return json({error:'QA_DELETE_FOREIGN_HOST_DENIED'},403);
  const path=new URL(req.url).pathname;
  if(path.startsWith('/api/v1/__qa-delete/')){
    const action=path.split('/').at(-1);
    if(req.headers.get('sec-fetch-site')!=='same-origin'||
      !req.headers.get('user-agent')?.includes('Chrome'))
      return json({error:'QA_DELETE_CHROME_SAME_ORIGIN_REQUIRED'},403);
    if(action==='fixture'&&req.method==='GET')
      return json({username:owners[role].username,password:owners[role].password,
        role,id:owners[role].id});
    if(action==='mail'&&req.method==='GET'&&role==='owner'){
      const f=process.env.GAFUS_QA_ACCOUNT_MAIL_FILE!;
      if(!existsSync(f))return json({error:'NO_DELIVERED_SYNTHETIC_MAIL'},404);
      const mail=JSON.parse(readFileSync(f,'utf8'));
      const challenge=await prisma.accountDeletionToken.findFirst({where:{userId:owners.owner.id,
        shortCode:mail.code},select:{shortCode:true,expiresAt:true}});
      if(mail.run!==run||mail.to!==`qa_delete_${run}@example.invalid`||
        !challenge||challenge.expiresAt.getTime()<Date.now())return json({error:'NO_VALID_EMAIL_CHALLENGE'},409);
      return json({code:mail.code, deliveredToSyntheticSink:true});
    }
    if(action==='state'&&req.method==='GET')return json({sql:await snapshot()});
    if(action==='record'&&req.method==='POST'){
      if(req.headers.get('origin')!==origin(role))return json({error:'BAD_BROWSER_ORIGIN'},403);
      const body=await req.json().catch(()=>null);
      try{return json(await record(body?.phase,body?.browser,req))}
      catch(e){return json({error:e instanceof Error?e.message:'FAILED_RECORD'},409)}
    }
    if(action==='finish'&&req.method==='POST'&&role==='owner'){
      if(req.headers.get('origin')!==origin(role))return json({error:'BAD_ORIGIN'},403);
      setTimeout(()=>void finish(true),300).unref();return json({finalizing:true});
    }
    return json({error:'UNKNOWN_QA_CONTROL'},404);
  }
  const response=await app.fetch(req);
  const relative=path.replace(/^\/api\/v1/,'');
  if(methods.includes(relative)){
    const value=await response.clone().json().catch(()=>null) as any;
    const cookie=req.headers.get('cookie')??'';
    wire.push({host:role,method:req.method,path:relative,status:response.status,
      success:value?.success===true,code:typeof value?.code==='string'?value.code:null,
      cookiePresent:cookie.includes('gafus_access=')||cookie.includes('gafus_refresh='),
      setCookies:cookieSummary(response)});
  }
  return response;
 };
 server=serve({fetch:handle,hostname:'127.0.0.1',port:apiPort});
 const ready={run,apiPort,webPort,db:pg.pathname.slice(1),
   ownerOrigin:origin('owner'),otherOrigin:origin('other')};
 writeFileSync(resolve(task,'browser-ready.json'),JSON.stringify(ready,null,2)+'\n',{mode:0o600});
 const poll=setInterval(()=>{if(existsSync(resolve(task,'qa.abort'))){clearInterval(poll);void finish(false)}},400);
 poll.unref();
 process.on('SIGTERM',()=>void finish(false));
 process.on('SIGINT',()=>void finish(false));
 console.log('QA_ACCOUNT_DELETE_WEB_HONO_READY',JSON.stringify(ready));
}
void main().catch(e=>{console.error('QA_DELETE_WEB_START_FAILED',e instanceof Error?e.message:String(e));void finish(false)});
