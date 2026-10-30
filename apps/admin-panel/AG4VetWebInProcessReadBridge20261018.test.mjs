import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginVetRuntimeEnvironment, createScopedVetWebReadTransport, createVetWebReadTransport, vettedTsxLoaderUrl, projectPrivatePetForWeb } from './AG4VetWebInProcessReadBridge20261018.mjs';
import { exerciseVetWebConsumer, loadActualVetWebAdapter } from '../web-vite/scripts/vet-web-consumer-runner.mjs';

const f = Object.freeze({ownerA:'ag2vet_owner_a_20261018',ownerB:'ag2vet_owner_b_20261018',
  petA:'ag2vet_pet_a_20261018',petB:'ag2vet_pet_b_20261018',emptyA:'ag2vet_pet_empty_a_20261018',
  visitA:'ag2vet_visit_a_20261018',visitB:'ag2vet_visit_b_20261018',
  missingVisit:'ag2vet_visit_missing_20261018',syntheticMedicalOnly:true,disposeAfterRun:true});
const path = pet => `/api/v1/pets/${pet}`;
const noStore = {'Cache-Control':'private, no-store, max-age=0','Content-Type':'application/json'};
const replied=(data,status=200,headers=noStore)=>new Response(JSON.stringify(data),{status,headers});
function createFake({signed=false,setCookie=false,force500=false}={}){
  const log=[];
  const app={request:async(url,opts)=>{
    log.push({url,method:opts?.method,cookiePresent:Boolean(opts?.headers?.Cookie),
      bearerPresent:Boolean(opts?.headers?.Authorization)});
    assert.equal(opts?.method,'GET');
    assert.equal(opts?.headers?.['X-Gafus-Auth-Transport'],'cookie');
    const actor=opts.headers.Cookie.includes('synthetic-token-a')?'A':
      opts.headers.Cookie.includes('synthetic-token-b')?'B':'none';
    const p=new URL(url).pathname;
    const parts=p.split('/');const pet=parts[4];
    const vet=p.includes('/vet-visits');
    const visit=vet?parts[6]:undefined;
    if(force500) return replied({error:'FAIL'},500);
    if(setCookie) return replied({success:true},200,{...noStore,'Set-Cookie':'auth=secret'});
    if((actor==='A'&&pet===f.petB)||(actor==='B'&&pet!==f.petB)||
      (actor==='A'&&!([f.petA,f.emptyA].includes(pet)))||
      (vet&&visit&&((actor==='A'&&visit!==f.visitA)||(actor==='B'&&visit!==f.visitB))))
      return replied({success:false,code:'VET_VISIT_NOT_FOUND'},404);
    if(!vet) return replied({success:true,data:{id:pet,ownerId:actor==='A'?f.ownerA:f.ownerB,awards:[],name:'Synthetic Pet',type:'DOG',breed:null,showInProfile:true,notes:null,birthDate:null,weightKg:null,heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null}});
    const dto=(id)=>({id,petId:pet,visitedOn:'2026-10-18',specialty:'SYNTHETIC',doctorName:'SYNTHETIC',clinic:'SYNTHETIC',diagnosis:'SYNTHETIC_DIAGNOSIS',conclusion:'SYNTHETIC',notes:'SYNTHETIC',attachments:[]});
    if(!visit){
      const list=pet===f.emptyA?[]:[dto(actor==='A'?f.visitA:f.visitB)];
      return replied({success:true,data:list});
    }
    return replied({success:true,data:{...dto(visit),
      attachments:signed?[{signedUrl:'https://bad.invalid/?signature=sensitive'}]:[]}});
  }};
  return {app,log};
}
const ready=(pet,vet=true)=>({method:'GET',cache:'no-store',credentials:'include',
  headers:{Accept:'application/json',...(vet?{'X-Gafus-Auth-Transport':'cookie'}:{})}});
function setup(fake=createFake(),active=()=>true){
  let checks=0,closed=0;
  const bridge=createScopedVetWebReadTransport({fixture:f,current:active,honoApp:fake.app,
    tokens:{A:'synthetic-token-a',B:'synthetic-token-b'},
    beforeAfter:async()=>{checks++;},disconnect:async()=>{closed++;}});
  return {...fake,...bridge,counts:()=>({checks,closed})};
}

test('no grant: real bridge always fails closed before DB or JWT import', async()=>{
  await assert.rejects(createVetWebReadTransport({scope:'AG2-WEB-VET-029-001',fixture:f,leaseCheck:()=>true}),
    /AG4_VET_FAIL_CLOSED/);
});
test('same-process synthetic cookie is sealed from Web caller, 200 private no-store',async()=>{
  const b=setup();const r=await b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)});
  assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-store/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.has('set-cookie'),false);
  assert.equal(r.headers.has('location'),false);
  assert.equal(b.log[0].bearerPresent,false);
  assert.equal(b.log[0].cookiePresent,true);
  assert.equal(JSON.stringify(await r.json()).includes('synthetic-token'),false);
  await b.finalize({accepted:true}); assert.deepEqual(b.counts(),{checks:1,closed:1});
});
test('owner B foreign vet URL yields 404 with same private headers',async()=>{
  const b=setup();const r=await b.webFetch({actor:'B',path:path(f.petA)+'/vet-visits',init:ready(f.petA)});
  assert.equal(r.status,404);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('cache-control'),/no-store/);
  await b.finalize({accepted:true});
});
test('no session is 401 without calling backend; no JWT crosses to Web',async()=>{
  const b=setup();const r=await b.webFetch({actor:'none',path:path(f.petA)+'/vet-visits',init:ready(f.petA)});
  assert.equal(r.status,401);assert.equal(b.log.length,0);assert.equal(r.headers.has('location'),false);
  await b.finalize({accepted:true});
});
test('synthetic in-memory 429 never touches Redis or Hono',async()=>{
  const b=setup();const r=await b.webFetch({actor:'rateLimited',path:path(f.petA)+'/vet-visits',init:ready(f.petA)});
  assert.equal(r.status,429);assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(b.log.length,0);await b.finalize({accepted:true});
});
test('body, POST, bearer, query, percent encoded and nonallowlisted paths all rejected before Hono',async()=>{
  const b=setup();const paths=[path(f.petA)+'/vet-visits?ownerId=evil',path(f.petA)+'/vet-visits/extra/edit',
    path(f.petA)+'/docs',path(f.petA)+'/vet-visits/%2Fsecret'];
  const attempts=paths.map(p=>({actor:'A',path:p,init:ready(f.petA)}));
  attempts.push({actor:'A',path:path(f.petA),init:{...ready(f.petA,false),method:'POST'}});
  attempts.push({actor:'A',path:path(f.petA),init:{...ready(f.petA,false),body:'{}'}});
  attempts.push({actor:'A',path:path(f.petA),init:{...ready(f.petA,false),headers:{Accept:'application/json',Authorization:'Bearer leak'}}});
  for(const x of attempts) await assert.rejects(b.webFetch(x),/AG4_VET_FAIL_CLOSED/);
  assert.equal(b.log.length,0);await b.finalize({accepted:true});
});
test('signed medical URL is rejected instead of leaking through synthetic DTO',async()=>{
  const b=setup(createFake({signed:true}));
  await assert.rejects(b.webFetch({actor:'A',path:path(f.petA)+'/vet-visits/'+f.visitA,
    init:ready(f.petA)}),/AG4_VET_FAIL_CLOSED/);
  await b.finalize({accepted:false});
});
test('unexpected 500 and Set-Cookie response are fail-closed',async()=>{
  for(const failure of [{force500:true},{setCookie:true}]){
    const b=setup(createFake(failure));
    await assert.rejects(b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)}),
      /AG4_VET_FAIL_CLOSED/);
    await b.finalize({accepted:false});
  }
});
test('lease invalidated after bootstrap: no more requests',async()=>{
  let on=true;const b=setup(createFake(),()=>on);on=false;
  await assert.rejects(b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)}),
    /AG4_VET_FAIL_CLOSED/);
  assert.equal(b.log.length,0); await b.finalize({accepted:false});
});
test('finalize checks snapshot once, disconnects once and cannot run twice',async()=>{
  const b=setup();await b.finalize({accepted:false});
  assert.deepEqual(b.counts(),{checks:1,closed:1});
  await assert.rejects(b.finalize({accepted:true}),/AG4_VET_FAIL_CLOSED/);
  await assert.rejects(b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)}),
    /AG4_VET_FAIL_CLOSED/);
});
test('snapshot failure still disconnects and cannot claim accepted',async()=>{
  let closed=0;const b=createScopedVetWebReadTransport({fixture:f,current:()=>true,
    honoApp:createFake().app,tokens:{A:'synthetic-token-a',B:'synthetic-token-b'},
    beforeAfter:async()=>{throw Error('HASH_DRIFT');},disconnect:async()=>{closed++;}});
  await assert.rejects(b.finalize({accepted:true}),/HASH_DRIFT/);
  assert.equal(closed,1);
});
test('AG2 existing exerciseVetWebConsumer uses same symbolic actor bridge in synthetic mode',async()=>{
  const b=setup();
  const fetchJson=async(p,vet=true)=>{
    const r=await fetch(p,ready(undefined,vet));const data=await r.json();
    if(r.status!==200)throw Object.assign(new Error('HTTP'),{status:r.status,code:data.code});
    return data.data;
  };
  const adapter={
    pet:{getMyPet:id=>fetchJson(path(id),false)},
    vet:{
      sourceOnlyHonoVetListRead:id=>fetchJson(path(id)+'/vet-visits'),
      sourceOnlyHonoVetDetailRead:(id,visit)=>
        /%/.test(visit)?Promise.reject(Object.assign(new Error('bad id'),{status:404,code:'VET_VISIT_NOT_FOUND'})):
        fetchJson(path(id)+'/vet-visits/'+visit),
    },
  };
  const result=await exerciseVetWebConsumer({fixture:f,webFetch:b.webFetch,adapter,leaseCheck:()=>true});
  assert.equal(result.pass,true);assert.equal(result.checksCount,12);
  assert.equal(result.adapterGetCount,11);assert.equal(result.writes,0);
  await b.finalize({accepted:true});assert.deepEqual(b.counts(),{checks:1,closed:1});
});


test('JWT_SECRET and DATABASE_URL lifecycle: isolated runtime private, restore on finalize',async()=>{
  // Synthetic env only: never read, overwrite or reveal the host JWT_SECRET.
  const env={};
  const databaseUrl='postgresql://ag2_vet_ro_20261018_inprocess@127.0.0.1:55460/gafus_ag2_vet_20261018_inprocess?options=readonly';
  const runtime=beginVetRuntimeEnvironment({env,databaseUrl});
  assert.equal(typeof env.JWT_SECRET,'string');
  assert.ok(env.JWT_SECRET.length>=64);
  assert.equal(env.DATABASE_URL,databaseUrl);
  assert.equal('secret' in runtime,false);
  const b=createScopedVetWebReadTransport({fixture:f,current:()=>true,
    honoApp:createFake().app,tokens:{A:'synthetic-token-a',B:'synthetic-token-b'},
    beforeAfter:async()=>assert.ok(env.JWT_SECRET?.length>=64),
    disconnect:async()=>runtime.release()});
  await b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)});
  await b.finalize({accepted:true});
  assert.deepEqual(env,{});
  assert.throws(()=>runtime.release(),/AG4_VET_FAIL_CLOSED/);
});
test('JWT lifecycle rejects preexisting credentials and restores prior empty keys',()=>{
  const databaseUrl='postgresql://ag2_vet_ro_20261018_inprocess@127.0.0.1:55460/gafus_ag2_vet_20261018_inprocess?options=readonly';
  const env={JWT_SECRET:'existing-sensitive-placeholder',DATABASE_URL:'should-not-overwrite'};
  assert.throws(()=>beginVetRuntimeEnvironment({env,databaseUrl}),/AG4_VET_FAIL_CLOSED/);
  assert.equal(env.JWT_SECRET,'existing-sensitive-placeholder');
  const empty={JWT_SECRET:'',DATABASE_URL:''};
  const session=beginVetRuntimeEnvironment({env:empty,databaseUrl});
  session.release();
  assert.deepEqual(empty,{JWT_SECRET:'',DATABASE_URL:''});
});


test('actual AG2 Vite typed Web adapter consumes synthetic bridge in-process (no SQL/TCP)',async()=>{
  const b=setup();
  const actual=await loadActualVetWebAdapter();
  try{
    const result=await exerciseVetWebConsumer({fixture:f,webFetch:b.webFetch,
      adapter:actual,leaseCheck:()=>true});
    assert.equal(result.pass,true);
    assert.equal(result.checksCount,12);
    assert.equal(result.adapterGetCount,11);
    assert.equal(result.externalCredentialTransfer,false);
    assert.equal(result.writes,0);
    await b.finalize({accepted:true});
  }finally{
    await actual.close();
  }
});


test('pnpm tsx runtime symlink resolves only inside exact allowed project; loader available',async()=>{
  const url=vettedTsxLoaderUrl();
  assert.ok(url.startsWith('file:///Users/asmtv1/Desktop/gafus-refactor/'));
  assert.ok(!url.includes('gafus1'));
  const loader=await import(url);
  assert.equal(typeof loader.tsImport,'function');
});


test('private pet Core profile projection drops ownerId/awards and refuses foreign owner',()=>{
  const raw={id:f.petA,ownerId:f.ownerA,name:'SYNTHETIC',type:'DOG',breed:null,
    showInProfile:true,notes:'SYNTHETIC_ONLY',birthDate:null,weightKg:null,
    heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,
    awards:[{originalKey:'must-stay-private'}],signedUrl:'https://bad.invalid/?signature=redacted'};
  const projected=projectPrivatePetForWeb(raw,f,'A',path(f.petA));
  assert.equal(projected.id,f.petA);
  assert.equal('ownerId' in projected,false);
  assert.equal('awards' in projected,false);
  assert.equal('signedUrl' in projected,false);
  assert.throws(()=>projectPrivatePetForWeb({...raw,ownerId:f.ownerB},f,'A',path(f.petA)),
    /AG4_VET_FAIL_CLOSED/);
  assert.throws(()=>projectPrivatePetForWeb(raw,f,'B',path(f.petA)),/AG4_VET_FAIL_CLOSED/);
});


test('foreign200_same_petId_wrong_ownerId is rejected at AG4 Hono cookie bridge boundary',async()=>{
  const fake=createFake();
  const original=fake.app.request;
  fake.app.request=async(url,options)=>{
    const actual=await original(url,options);
    if(new URL(url).pathname!==path(f.petA) || actual.status!==200) return actual;
    const body=await actual.json();
    // Malicious backend returned the requested pet ID but a different owner.
    // The Web consumer must never receive this synthetic private 200.
    return replied({...body,data:{...body.data,ownerId:f.ownerB}},200);
  };
  const b=setup(fake);
  await assert.rejects(b.webFetch({actor:'A',path:path(f.petA),init:ready(f.petA,false)}),
    /AG4_VET_FAIL_CLOSED/);
  assert.equal(fake.log.length,1);
  assert.equal(fake.log[0].bearerPresent,false);
  assert.equal(fake.log[0].cookiePresent,true);
  await b.finalize({accepted:false});
  assert.deepEqual(b.counts(),{checks:1,closed:1});
});
