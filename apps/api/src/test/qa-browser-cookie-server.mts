/** Real mounted Hono + 3 cookie-isolated origins inside the existing personal Chrome.
 * Child-only ephemeral TCP listener. Fresh disposable PG18+Redis, never shared users.
 * Synthetic provider-free QA; browser steps MUST arrive through Chrome Extension.
 */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const source=fileURLToPath(import.meta.url),sourceDir=dirname(source);
const root=resolve(sourceDir,'../../../..');
const taskDir=dirname(process.env.GAFUS_TEST_REPORT_PATH??'');
const report=resolve(taskDir,'tests.json');
const pg=new URL(process.env.DATABASE_URL??'http://invalid');
const redis=new URL(process.env.REDIS_URL??'http://invalid');
const run=process.env.GAFUS_QA_COOKIE_RUN??'';
assert.equal(process.env.GAFUS_QA_COOKIE_BROWSER_ACCEPTANCE,'1');
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,'1');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(process.env.API_HOST,'127.0.0.1');
assert.match(run,/^[a-f0-9]{12}$/);
assert.equal(pg.protocol,'postgresql:');assert.equal(pg.hostname,'127.0.0.1');
assert.equal(pg.username,'qahttp');assert.match(pg.pathname,/^\/archqa_cookie_[a-f0-9]{12}$/);
assert.equal(redis.protocol,'redis:');assert.equal(redis.hostname,'127.0.0.1');
assert.equal(redis.pathname,'/0');
assert.equal(process.env.FEED_ENABLED,'false');assert.equal(process.env.GALLERY_ENABLED,'false');
assert.ok((process.env.JWT_SECRET??'').length>=32);
assert.ok((process.env.JWT_REFRESH_SECRET??'').length>=32);
assert.equal(process.env.GAFUS_TEST_REPORT_PATH,report);
assert.ok(report.startsWith(root+'/.qa/testing/qa-'));
assert.match(report,/\/tasks\/[a-f0-9]{20}\/attempt-[1-9][0-9]*\/tests\.json$/);
assert.ok(existsSync(taskDir));
const expectations=JSON.parse(readFileSync(resolve(root,'tests/catalog/browser-cookie-cases.json'),'utf8'));
assert.equal(expectations.schema,1);assert.equal(expectations.cases.length,13);
const plan=expectations.cases;
const users:Record<'a'|'b',{id:string,username:string,password:string}>={} as any;
const logs:Record<'a'|'b'|'c',any[]>={a:[],b:[],c:[]};
const steps:any[]=[];
const lastIndex:Record<'a'|'b'|'c',number>={a:0,b:0,c:0};
let port=0,server:ReturnType<typeof import('@hono/node-server').serve>|undefined;
let shuttingDown=false;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const fingerprint=(value:string)=>hash(value).slice(0,16);
const shaSource=(path:string)=>hash(readFileSync(resolve(root,path),'utf8'));
const sourceHashes={
  app:shaSource('apps/api/src/app.ts'),
  cors:shaSource('apps/api/src/middleware/cors.ts'),
  cookieAuth:shaSource('apps/api/src/lib/browser-auth.ts'),
  driver:shaSource('apps/api/src/test/qa-browser-cookie-driver.js'),
  runner:shaSource('apps/api/src/test/qa-browser-cookie-server.mts'),
  cases:shaSource('tests/catalog/browser-cookie-cases.json'),
};
function hostRole(req:Request):'a'|'b'|'c'|null{
  const url=new URL(req.url);
  const match=new RegExp(`^qa-([abc])-${run}\\.localhost$`).exec(url.hostname);
  return match&&url.port===String(port)?match[1] as 'a'|'b'|'c':null;
}
function getCookie(header:string|null,name:string):string|null{
  const match=(header??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return match?match.slice(name.length+1):null;
}
function cookieProbe(req:Request){
  const a=getCookie(req.headers.get('cookie'),'gafus_access');
  const r=getCookie(req.headers.get('cookie'),'gafus_refresh');
  return {access:Boolean(a),refresh:Boolean(r),
    accessFingerprint:a?fingerprint(a):null,refreshFingerprint:r?fingerprint(r):null};
}
const json=(body:unknown,status=200):Response=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
async function sqlSnapshot(){
  const [rows,a,b]=await Promise.all([
    prisma.refreshToken.findMany({where:{userId:{in:[users.a.id,users.b.id]}},
      select:{userId:true,revokedAt:true,tokenHash:true},orderBy:{createdAt:'asc'}}),
    prisma.user.findUniqueOrThrow({where:{id:users.a.id},select:{sessionsRevokedAt:true}}),
    prisma.user.findUniqueOrThrow({where:{id:users.b.id},select:{sessionsRevokedAt:true}}),
  ]);
  return {aTotal:rows.filter(x=>x.userId===users.a.id).length,
    aActive:rows.filter(x=>x.userId===users.a.id&&!x.revokedAt).length,
    bTotal:rows.filter(x=>x.userId===users.b.id).length,
    bActive:rows.filter(x=>x.userId===users.b.id&&!x.revokedAt).length,
    aRevocation:Boolean(a.sessionsRevokedAt),bRevocation:Boolean(b.sessionsRevokedAt)};
}
async function boundCookie(req:Request){
  const token=getCookie(req.headers.get('cookie'),'gafus_refresh');
  if(!token)return {owner:null,revoked:null};
  const row=await prisma.refreshToken.findUnique({where:{tokenHash:hash(token)},select:{userId:true,revokedAt:true}});
  return {owner:row?.userId===users.a.id?'a':row?.userId===users.b.id?'b':null,
    revoked:row?Boolean(row.revokedAt):null};
}
function summarizeSetCookies(response:Response){
  const headers=response.headers.getSetCookie?.()??[];
  return headers.map(c=>{
    const attrs=c.split(';').map(x=>x.trim().toLowerCase());
    return {
      name:c.startsWith('gafus_access=')?'gafus_access':c.startsWith('gafus_refresh=')?'gafus_refresh':'other',
      httpOnly:attrs.includes('httponly'),sameSiteLax:attrs.includes('samesite=lax'),
      path:attrs.includes('path=/api/v1'),secure:attrs.includes('secure'),
      deleting:attrs.includes('max-age=0'),
    };
  });
}

async function storeReport(){
  const artifact={schema:1,run,port,db:pg.pathname.slice(1),
    originHosts:['a','b','c'].map(role=>`qa-${role}-${run}.localhost`),
    browser:'existing-chrome-playwright-extension-default-context',
    connection:'loopback-original-mounted-hono-postgresql18-redis',
    sourceHashes,steps,received:steps.length,finished:true,
    notes:'No actual passwords, JWT or HttpOnly cookie values persisted. Browser only sees synthetic users.'};
  writeFileSync(resolve(taskDir,'browser-cookie.json'),JSON.stringify(artifact,null,2)+'\n',{mode:0o600});
  writeFileSync(report,JSON.stringify({numPassedTests:steps.length,numFailedTests:0,numPendingTests:0,
    testResults:[{name:source,assertionResults:steps.map(s=>({fullName:s.step,title:s.step,status:'passed'}))}]},null,2)+'\n',{mode:0o600});
}
async function stop(success:boolean){
  if(shuttingDown)return;shuttingDown=true;
  if(success)await storeReport();
  if(server)await Promise.race([new Promise<void>(resolve=>server!.close(()=>resolve())),new Promise<void>(resolve=>setTimeout(resolve,1500))]);
  await Promise.allSettled([prisma.$disconnect(),import('@gafus/queues').then(x=>x.connection.quit())]);
  process.exit(success?0:2);
}

async function main(){
  const db=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
  assert.equal(db[0]?.db,pg.pathname.slice(1),'QA_BROWSER_WRONG_DISPOSABLE_DATABASE');
  const tag=randomBytes(5).toString('hex');
  for(const key of ['a','b'] as const){
    const username=`qa_browser_${run}_${key}_${tag}`;
    const password=randomBytes(24).toString('base64url');
    const row=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
      passwordSetAt:new Date(),registrationPending:false,role:'USER'}});
    users[key]={id:row.id,username,password};
  }
  const [{app},{serve}]=await Promise.all([import('../app.js'),import('@hono/node-server')]);
  const probes:Record<'a'|'b'|'c',any[]>={a:[],b:[],c:[]};
  const lastProbeIndex:Record<'a'|'b'|'c',number>={a:0,b:0,c:0};
  const handle=async(req:Request):Promise<Response>=>{
    const role=hostRole(req);
    if(!role)return json({success:false,error:'FOREIGN_QA_BROWSER_HOST_DENIED'},403);
    const path=new URL(req.url).pathname;
    const actor=role==='b'?users.b:users.a;
    const expectedOrigin=`http://qa-${role}-${run}.localhost:${port}`;
    if(path==='/api/v1/__qa-browser'&&req.method==='GET'){
      const html='<!doctype html><html><head><meta charset="utf-8"><title>GAFUS isolated cookie QA '+role+'</title></head>'+
      '<body><h1>GAFUS QA browser-cookie acceptance</h1><p>Disposable synthetic account, unique local Chrome cookie host.</p>'+
      '<script src="/api/v1/__qa-driver.js"></script></body></html>';
      return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/v1/__qa-driver.js'&&req.method==='GET'){
      return new Response(readFileSync(resolve(sourceDir,'qa-browser-cookie-driver.js')),{headers:{
        'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
    }
    if(path==='/api/v1/__qa-fixture'&&req.method==='GET'){
      return json({id:actor.id,username:actor.username,password:actor.password});
    }
    if(path==='/api/v1/__qa-cookie-probe'&&req.method==='GET'){
      const probe=cookieProbe(req);
      probes[role].push(probe);
      return json(probe);
    }
    if(path==='/api/v1/__qa-record'&&req.method==='POST'){
      if(req.headers.get('origin')!==expectedOrigin||
         !req.headers.get('user-agent')?.includes('Chrome')||
         req.headers.get('sec-fetch-site')!=='same-origin')
        return json({error:'NOT_A_REAL_SAME_ORIGIN_CHROME_REQUEST'},403);
      let body:any;
      try{body=await req.json()}catch{return json({error:'BAD_JSON'},400)}
      const expected=plan[steps.length];
      if(!expected||body?.step!==expected.step||expected.host!==role)
        return json({error:'OUT_OF_ORDER_OR_FOREIGN_STEP'},409);
      const actual=logs[role].slice(lastIndex[role]);
      const observedProbes=probes[role].slice(lastProbeIndex[role]);
      const b=body.browser;
      if(!b||b.origin!==expectedOrigin||b.host!==`qa-${role}-${run}.localhost`||
         b.chrome!==true||b.documentCookieHasAuth!==false||
         typeof b.userAgent!=='string'||!b.userAgent.includes('Chrome')||
         observedProbes.length!==2||!Array.isArray(b.requests))
        return json({error:'BROWSER_STATE_OR_COOKIE_PROBE_INCOMPLETE'},409);
      if(JSON.stringify([b.before,b.after])!==JSON.stringify(observedProbes))
        return json({error:'BROWSER_COOKIE_PROBE_NOT_SERVER_VERIFIED'},409);
      if(actual.length!==expected.http.length||b.requests.length!==expected.http.length)
        return json({error:'CHROME_HTTP_REQUEST_COUNT_MISMATCH'},409);
      for(let i=0;i<expected.http.length;i++){
        const [method,route,status]=expected.http[i];
        const wire=actual[i],browserRequest=b.requests[i];
        if(wire.method!==method||wire.path!==route||wire.status!==status||
           wire.origin!==expectedOrigin||wire.chrome!==true||wire.secFetchSite!=='same-origin'||
           browserRequest.method!==method||browserRequest.path!==route||browserRequest.status!==status||
           browserRequest.code!==wire.code||browserRequest.success!==wire.success||
           browserRequest.actorId!==wire.actorId)
          return json({error:'REAL_CHROME_HTTP_STATUS_OR_IDENTITY_MISMATCH',i},409);
        if(status===200&&(route==='/auth/me'||route==='/auth/login')&&wire.actorId!==actor.id)
          return json({error:'CROSS_ACTOR_HTTP_IDENTITY'},409);
        if(['/auth/login','/auth/refresh','/auth/logout','/auth/logout-all'].includes(route)&&status===200){
          if(wire.setCookies.length!==2||new Set(wire.setCookies.map((x:any)=>x.name)).size!==2||
             wire.setCookies.some((x:any)=>!x.httpOnly||!x.sameSiteLax||!x.path||x.secure||
               x.deleting!==['/auth/logout','/auth/logout-all'].includes(route)))
            return json({error:'CHROME_COOKIE_SECURITY_ATTRIBUTES_INVALID'},409);
        }
      }
      const sql=await sqlSnapshot();
      const selected={aTotal:sql.aTotal,aActive:sql.aActive,bTotal:sql.bTotal,
        bActive:sql.bActive,aRevocation:sql.aRevocation};
      if(JSON.stringify(selected)!==JSON.stringify(expected.sql)||sql.bRevocation)
        return json({error:'SQL_AUTH_SESSION_COUNTS_OR_REVOKE_STATE_MISMATCH',sql:selected},409);
      const after=cookieProbe(req);
      if(JSON.stringify(after)!==JSON.stringify(b.after)||
        b.before.access!==b.before.refresh||b.after.access!==b.after.refresh||
        (expected.cookie==='none')!==(!after.access))
        return json({error:'CHROME_COOKIE_STATE_INCONSISTENT'},409);
      const binding=await boundCookie(req);
      if(binding.owner!==expected.bound||binding.revoked!==(expected.cookie==='none'?null:expected.cookie==='revoked'))
        return json({error:'BROWSER_COOKIE_SQL_OWNER_OR_REVOCATION_MISMATCH'},409);
      if(['a_refresh','b_unaffected'].includes(expected.step)&&
         b.before.refreshFingerprint===b.after.refreshFingerprint)
        return json({error:'BROWSER_REFRESH_COOKIE_DID_NOT_ROTATE'},409);
      const evidence={step:expected.step,host:role,origin:expectedOrigin,
        browser:{chrome:true,userAgentVerified:true,secFetchSite:'same-origin',
          documentCookieHasAuth:false,requests:b.requests.map((x:any)=>({
            method:x.method,path:x.path,status:x.status,code:x.code,success:x.success,
            identityCorrect:x.actorId===actor.id||x.actorId===null})),
          before:b.before,after:b.after},
        http:actual.map(x=>({method:x.method,path:x.path,status:x.status,
          code:x.code,success:x.success,actorMatches:x.actorId===actor.id||x.actorId===null,
          hadAccess:x.hadAccess,hadRefresh:x.hadRefresh,setCookies:x.setCookies})),
        sql:selected,sqlBrowserRefreshBinding:binding};
      steps.push(evidence);lastIndex[role]=logs[role].length;lastProbeIndex[role]=probes[role].length;
      writeFileSync(resolve(taskDir,'browser-progress.json'),JSON.stringify({run,completed:steps.map(s=>s.step),
        expected:plan.length},null,2)+'\n',{mode:0o600});
      if(steps.length===plan.length) setTimeout(()=>void stop(true),650).unref();
      return json({recorded:expected.step,sql:selected});
    }
    if(path.startsWith('/api/v1/__qa-'))return json({error:'UNKNOWN_QA_BROWSER_ENDPOINT'},404);
    // IMPORTANT: every auth / private call below uses the ORIGINAL mounted Hono
    // middleware and route implementations.  No mocked HTTP paths or JWTs.
    const response=await app.fetch(req);
    if(path.startsWith('/api/v1/auth/')||path==='/api/v1/user/profile'){
      const outcome=await response.clone().json().catch(()=>null) as any;
      const authName=path.replace(/^\/api\/v1/,'');
      logs[role].push({method:req.method,path:authName,status:response.status,
        code:typeof outcome?.code==='string'?outcome.code:null,
        success:outcome?.success===true,
        actorId:outcome?.data?.user?.id??outcome?.data?.id??null,
        origin:req.headers.get('origin')??(req.method==='GET'?expectedOrigin:null),
        chrome:req.headers.get('user-agent')?.includes('Chrome')===true,
        secFetchSite:req.headers.get('sec-fetch-site'),
        hadAccess:cookieProbe(req).access,hadRefresh:cookieProbe(req).refresh,
        setCookies:summarizeSetCookies(response)});
    }
    return response;
  };
  server=serve({fetch:handle,hostname:'127.0.0.1',port:0});
  if(!server.listening)await once(server,'listening');
  const addr=server.address();assert.ok(addr&&typeof addr!=='string');port=addr.port;
  process.env.GAFUS_QA_COOKIE_PORT=String(port);
  const origins=(['a','b','c'] as const).map(x=>`http://qa-${x}-${run}.localhost:${port}`);
  writeFileSync(resolve(taskDir,'browser-ready.json'),JSON.stringify({run,port,origins,db:pg.pathname.slice(1),
    profile:'browser-cookie',resources:'owned-private-PG18-Redis-Hono-3-Chrome-tabs'},null,2)+'\n',{mode:0o600});
  const poll=setInterval(()=>{if(existsSync(resolve(taskDir,'qa.abort'))){clearInterval(poll);void stop(false)}},300);
  poll.unref();
  process.on('SIGTERM',()=>{void stop(false)});
  process.on('SIGINT',()=>{void stop(false)});
  console.log('QA_CHROME_COOKIE_READY',JSON.stringify({run,port,origins}));
}
void main().catch(error=>{console.error('QA_BROWSER_COOKIE_START_ERROR',error instanceof Error?error.message:String(error));
  void stop(false)});
