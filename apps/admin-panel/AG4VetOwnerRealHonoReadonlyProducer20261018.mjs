/** AG4 exclusive owner only; separate synthetic Vet DB, SELECT-only, in-process Hono.
 * Not the AG2 consumer. Never listen on TCP, never log raw cookie/JWT/clinical IDs.
 * Fail closed if the exact short lease is absent or stale. No DB operation before gate.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  vettedTsxLoaderUrl,beginVetRuntimeEnvironment,createScopedVetWebReadTransport,
} from './AG4VetWebInProcessReadBridge20261018.mjs';

const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const GRANT='apps/admin-panel/AG4_VET_PG14_55460_OWNED_CLUSTER_STARTUP_SELECTONLY_20261018T215714Z.v1.json';
const FIXTURE_KEYS=['ownerA','ownerB','petA','petB','emptyA','visitA','visitB','missingVisit'];
const TABLES=Object.freeze({User:2,Pet:3,PetVetVisit:2,PetVetAttachment:0,GalleryStorageJob:0,_prisma_migrations:140});
const FAIL='AG4_VET_PRODUCER_FAIL_CLOSED';
const gate=x=>{if(!x) throw Error(FAIL);};
function owned(rel){
  gate(typeof rel==='string' && /^(apps|packages)\//.test(rel) &&
    !rel.includes('\\') && rel.split('/').every(x=>x&&x!=='.'&&x!=='..'));
  let path=ROOT;
  for (const part of rel.split('/')){
    path=resolve(path,part);
    gate(!lstatSync(path).isSymbolicLink() && realpathSync(path).startsWith(ROOT+sep));
  }
  gate(path.startsWith(ROOT+sep) && realpathSync(path)===path && lstatSync(path).isFile());
  return path;
}
const hash=rel=>createHash('sha256').update(readFileSync(owned(rel))).digest('hex');
const grant=JSON.parse(readFileSync(owned(GRANT),'utf8'));
const now=Date.now(),expires=Date.parse(grant.expiresUTC);
gate(process.cwd()===ROOT && realpathSync(ROOT)===ROOT);
gate(execFileSync('git',['-C',ROOT,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()===ROOT &&
  execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8'}).trim()==='vite');
gate(grant.kind==='AG4_VET_PROJECT_LOCAL_PG14_EXACT_CLUSTER_STARTUP_HONO_OWNER_ONLY_V1' &&
  grant.state==='ACTIVE_AG4_EXCLUSIVE_CLUSTER_START_AND_READONLY_PRODUCER' && grant.owner==='AG4' && grant.issuer==='AG4' &&
  grant.repo===ROOT && grant.branch==='vite' && grant.db==='gafus_ag2_vet_20261018_inprocess' &&
  grant.role==='ag2_vet_ro_20261018_inprocess' && grant.port===55460 &&
  grant.host==='127.0.0.1' && grant.noDmlNoDdlNoProviderNoTcp===true &&
  Number.isFinite(expires)&&expires>now+5000&&expires-now<=900000);
gate(grant.isolatedPgdata===ROOT+'/apps/admin-panel/.ag4-panel14-realjwt-pg-20261017/pgdata' &&
  readFileSync(owned('apps/admin-panel/.ag4-panel14-realjwt-pg-20261017/pgdata/postmaster.pid'),'utf8')
    .split('\n').slice(0,6).join('|')===
    [String(grant.startedPid),grant.isolatedPgdata,grant.startedEpoch,55460,'','127.0.0.1'].join('|'));
gate(grant.thisHarnessSHA256===hash('apps/admin-panel/AG4VetOwnerRealHonoReadonlyProducer20261018.mjs') &&
  grant.sourcePins && Object.keys(grant.sourcePins).length===22 &&
  Object.entries(grant.sourcePins).every(([file,sha])=>hash(file)===sha));
gate(grant.fixture?.syntheticMedicalOnly===true && grant.fixture?.disposeAfterRun===true &&
  FIXTURE_KEYS.every(k=>typeof grant.fixture[k]==='string' && /^ag2vet_[a-z0-9_]+$/.test(grant.fixture[k])) &&
  new Set(FIXTURE_KEYS.map(k=>grant.fixture[k])).size===FIXTURE_KEYS.length);
const current=()=>Date.now()+1000<expires;
gate(current());
if (process.argv.length!==3||process.argv[2]!=='--owned-producer-read')throw Error(FAIL);
const databaseUrl='postgresql://'+grant.role+'@'+grant.host+':'+grant.port+'/'+grant.db+
  '?options='+encodeURIComponent('-c default_transaction_read_only=on -c statement_timeout=5000');
let runtime,prisma,transport,finalized=false;
const outcomes=[];let phase="PREIMPORT";
try {
  phase="RUNTIME_ENV";
  runtime=beginVetRuntimeEnvironment({databaseUrl});
  phase="TS_IMPORT";
  const {tsImport}=await import(vettedTsxLoaderUrl());
  const ts=rel=>tsImport(pathToFileURL(owned(rel)).href,import.meta.url);
  const [{prisma:db},{Hono},{generateAccessToken},{authMiddleware},{petsRoutes},{petVetVisitRoutes}]=await Promise.all([
    import('@gafus/prisma'),import('hono'),import('@gafus/auth/jwt'),
    ts('apps/api/src/middleware/auth.ts'),ts('apps/api/src/routes/v1/pets.ts'),
    ts('apps/api/src/routes/v1/pet-vet-visits.ts'),
  ]);
  prisma=db;phase="ROLE_VERIFY";
  const role=async()=>{
    const [r]=await prisma.$queryRawUnsafe(`SELECT current_database() AS db,current_user AS role,
      current_setting('default_transaction_read_only') AS ro,
      current_setting('statement_timeout') AS timeout,
      has_schema_privilege(current_user,'public','CREATE') AS sc,
      has_database_privilege(current_user,current_database(),'TEMPORARY') AS tmp,
      has_table_privilege(current_user,'public."PetVetVisit"','INSERT') AS ins,
      has_table_privilege(current_user,'public."PetVetVisit"','UPDATE') AS upd,
      has_table_privilege(current_user,'public."PetVetVisit"','DELETE') AS del`);
    gate(r?.db===grant.db&&r.role===grant.role&&r.ro==='on'&&
      ['5s','5000ms'].includes(r.timeout)&&!r.sc&&!r.tmp&&!r.ins&&!r.upd&&!r.del);
  };
  const fingerprint=async()=>{
    await role();
    const values={};
    for (const [name,expect] of Object.entries(TABLES)) {
      const [row]=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY t.id),'')) AS h
        FROM "${name}" t`);
      gate(row && row.c===expect && typeof row.h==='string' && row.h.length===32);
      values[name]=[row.c,row.h];
    }
    return JSON.stringify(values);
  };
  gate(current());
  phase="BEFORE_FINGERPRINT";const before=await fingerprint();
  // Ephemeral process-local credentials; never returned to AG2 or logged.
  phase="JWT_SIGN";const tokens={A:await generateAccessToken({id:grant.fixture.ownerA,username:'AG4VetSyntheticOwnerA',role:'USER'}),
                B:await generateAccessToken({id:grant.fixture.ownerB,username:'AG4VetSyntheticOwnerB',role:'USER'})};
  phase="HONO_SETUP";const app=new Hono();
  app.use('/api/v1/pets/*',async(c,next)=>{
    c.header('Cache-Control','private, no-store, max-age=0');
    c.header('X-Content-Type-Options','nosniff');
    if (!current() || c.req.method!=='GET')return c.json({success:false,code:'METHOD_OR_LEASE_DENIED'},405);
    await next();
    c.header('Cache-Control','private, no-store, max-age=0');
  });
  app.use('/api/v1/pets/*',authMiddleware);
  app.route('/api/v1/pets',petsRoutes);
  app.route('/api/v1/pets',petVetVisitRoutes);
  transport=createScopedVetWebReadTransport({fixture:grant.fixture,current,honoApp:app,tokens,
    beforeAfter:async()=>gate(before===await fingerprint()),
    disconnect:async()=>{
      try{await prisma.$disconnect();}finally{runtime.release();}
    }});
  const check=async(name,actor,path,status,isVet,expectData)=>{
    const response=await transport.webFetch({actor,path,init:{method:'GET',credentials:'include',cache:'no-store',
      headers:{Accept:'application/json',...(isVet?{'X-Gafus-Auth-Transport':'cookie'}:{})}}});
    gate(response.status===status&&response.headers.get('cache-control')?.includes('no-store')&&
      response.headers.get('x-content-type-options')==='nosniff'&&!response.headers.has('location')&&
      !response.headers.has('set-cookie'));
    const payload=await response.json();
    if(expectData)gate(payload.success===true&&expectData(payload.data));
    outcomes.push({case:name,status,pass:true});
  };
  const pet=id=>'/api/v1/pets/'+id;
  const vet=id=>pet(id)+'/vet-visits';
  const f=grant.fixture;
  phase="HONO_GET_1";await check('ownerAPet','A',pet(f.petA),200,false,p=>p?.id===f.petA);
  phase="HONO_GET_2";await check('ownerAVetList','A',vet(f.petA),200,true,p=>Array.isArray(p)&&p.length===1&&p[0]?.id===f.visitA);
  phase="HONO_GET_3";await check('ownerAVetEmpty','A',vet(f.emptyA),200,true,p=>Array.isArray(p)&&p.length===0);
  phase="HONO_GET_4";await check('ownerAVetDetail','A',vet(f.petA)+'/'+f.visitA,200,true,p=>p?.id===f.visitA&&p?.diagnosis?.startsWith('SYNTHETIC_')&&p?.attachments?.length===0);
  phase="HONO_GET_5";await check('ownerBForeignList','B',vet(f.petA),404,true);
  phase="HONO_GET_6";await check('ownerAVetForeignDetail','A',vet(f.petA)+'/'+f.visitB,404,true);
  phase="HONO_GET_7";await check('ownerBPetOwn','B',pet(f.petB),200,false,p=>p?.id===f.petB);
  phase="HONO_GET_8";await check('noSession','none',vet(f.petA),401,true);
  phase="HONO_GET_9";await check('syntheticRateLimited','rateLimited',vet(f.petA),429,true);
  phase="AFTER_FINGERPRINT_AND_RELEASE";await transport.finalize({accepted:true});finalized=true;
  console.log(JSON.stringify({result:'AG4_VET_REAL_HONO_COOKIE_SQL_READONLY_PASS',
    cases:outcomes,caseCount:outcomes.length,tableHashesEqual:true,tableCount:Object.keys(TABLES).length,
    dbRoleValidated:true,externalSecrets:0,sqlWrites:0,tcpListeners:0,providerCalls:0,
    fixtureCleanup:'UNTOUCHED_EXISTING_AG2_SYNTHETIC_FIXTURE',actualWebConsumer:false}));
} catch(e){
  // All failure logs are generic; never log tokens, clinical DTO or database URLs.
  console.error(FAIL+'_STAGE_'+phase);
  process.exitCode=78;
} finally {
  if(!finalized){
    try{
      if(transport)await transport.finalize({accepted:false});
      else{
        if(prisma)await prisma.$disconnect();
        if(runtime)runtime.release();
      }
    }catch{console.error('AG4_VET_PRODUCER_CLEANUP_UNCERTAIN');process.exitCode=78;}
  }
}
