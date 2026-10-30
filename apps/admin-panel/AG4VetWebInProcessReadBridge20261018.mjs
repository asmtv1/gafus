/**
 * AG4-owned, fail-closed synthetic Vet GET bridge for AG2-WEB-VET-029-001.
 * No server listener; credentials exist only in the executing Node process.
 * THIS MODULE DOES NOT OPEN A DB OR GENERATE A TOKEN WHEN IMPORTED.
 * Real mode requires a fresh AG4 source-pinned AG2 read-only consumer lease.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/asmtv1/Desktop/gafus-refactor';
const GRANT = 'apps/admin-panel/AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json';
const BOOTSTRAP = 'apps/admin-panel/AG4_AG2_VET029_INPROCESS_BRIDGE_SOURCE_AND_CONSUMER_PENDING_TOOL_ACCESS_20261018.v1.json';
const CASE_PATH = /^\/api\/v1\/pets\/([A-Za-z0-9_-]{1,128})(?:\/vet-visits(?:\/([A-Za-z0-9_-]{1,128}))?)?$/;
const TABLES = Object.freeze(['User','Pet','PetVetVisit','PetVetAttachment','GalleryStorageJob','_prisma_migrations']);
const COUNTS = Object.freeze({User:2,Pet:3,PetVetVisit:2,PetVetAttachment:0,GalleryStorageJob:0,_prisma_migrations:140});
// These transitive JWT/browser-cookie/pet dependencies were absent from AG2's 16 Web pins.
const BRIDGE_RUNTIME_SOURCE_FILES = Object.freeze([
  'apps/api/src/lib/browser-auth.ts',
  'apps/api/src/routes/v1/pets.ts',
  'packages/auth/src/jwt.ts',
  'packages/core/src/services/auth/identityReadService.ts',
]);
const NO_LOG = 'AG4_VET_FAIL_CLOSED';
const assert = (condition) => { if (!condition) throw Error(NO_LOG); };
const SHA = (source) => createHash('sha256').update(source).digest('hex');

function localFile(relative) {
  assert(typeof relative === 'string' && /^(apps|packages|node_modules)\//.test(relative));
  assert(!relative.includes('\\') && relative.split('/').every(p => p && p !== '.' && p !== '..'));
  const path = resolve(ROOT, relative);
  assert(path.startsWith(ROOT + sep));
  const dependency = relative.startsWith('node_modules/');
  let cursor = ROOT;
  for (const component of relative.split('/')) {
    cursor = resolve(cursor, component);
    if (lstatSync(cursor).isSymbolicLink()) assert(dependency);
    const actual = realpathSync(cursor);
    assert(actual.startsWith(ROOT + sep)); // pnpm symlink allowed ONLY inside project.
  }
  const physical=realpathSync(path);
  assert(physical.startsWith(ROOT + sep) && lstatSync(physical).isFile());
  return physical;
}
export const vettedTsxLoaderUrl = () => pathToFileURL(localFile('node_modules/tsx/dist/esm/api/index.mjs')).href;
const jsonFile = file => JSON.parse(readFileSync(localFile(file), 'utf8'));
const shaFile = file => SHA(readFileSync(localFile(file)));
const sourceMatch = map => map && Object.entries(map).every(([f, digest]) => shaFile(f) === digest);
const exactCookieHeader = token => `gafus_access=${encodeURIComponent(token)}`;
const FIXTURE_IDS = ['ownerA','ownerB','petA','petB','emptyA','visitA','visitB','missingVisit'];
const safeFixture = f => f && typeof f === 'object' && !Array.isArray(f) &&
  f.syntheticMedicalOnly === true && f.disposeAfterRun === true &&
  FIXTURE_IDS.every(k => typeof f[k] === 'string' && /^ag2vet_[a-z0-9_]{1,128}$/.test(f[k])) &&
  new Set(FIXTURE_IDS.map(k => f[k])).size === FIXTURE_IDS.length;

function checkActiveGrant({ scope, fixture, leaseCheck }) {
  assert(scope === 'AG2-WEB-VET-029-001' && typeof leaseCheck === 'function' && leaseCheck());
  assert(realpathSync(ROOT) === ROOT);
  assert(execFileSync('git', ['-C', ROOT, 'rev-parse','--show-toplevel'], {encoding:'utf8'}).trim() === ROOT);
  assert(execFileSync('git', ['-C', ROOT, 'branch','--show-current'], {encoding:'utf8'}).trim() === 'vite');
  assert(existsSync(resolve(ROOT, GRANT)));
  const g = jsonFile(GRANT);
  assert(g.kind === 'AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_V1' && g.state === 'ACTIVE_AG2_EXCLUSIVE');
  assert(g.issuer === 'AG4' && g.owner === 'AG2' && g.repo === ROOT && g.branch === 'vite' && g.batch === scope);
  assert(g.bridgeModule === 'apps/admin-panel/AG4VetWebInProcessReadBridge20261018.mjs');
  assert(g.bridgeSHA256 === shaFile(g.bridgeModule));
  const ms = Date.parse(g.expiresUTC) - Date.now();
  assert(Number.isFinite(ms) && ms > 1000 && ms <= 900_000);
  assert(g.databaseName === 'gafus_ag2_vet_20261018_inprocess' && g.readOnlyPgRole === 'ag2_vet_ro_20261018_inprocess');
  assert(safeFixture(fixture) && safeFixture(g.fixture) &&
    FIXTURE_IDS.every(k => fixture[k] === g.fixture[k]) &&
    fixture.syntheticMedicalOnly === g.fixture.syntheticMedicalOnly &&
    fixture.disposeAfterRun === g.fixture.disposeAfterRun);
  assert(g.exclusiveLeaseConfirmed && g.readOnlyPgRoleConfirmed && g.webCookieToHonoAuthVerifiedByAG4 &&
    g.noTcpListener && g.noProviderCalls && g.noExternalCredentialTransfer);
  const bootstrap = jsonFile(BOOTSTRAP);
  assert(bootstrap.existingResource?.db === g.databaseName && bootstrap.existingResource?.readOnlyRole === g.readOnlyPgRole &&
    bootstrap.existingResource?.bootstrapLeaseExpired === true);
  assert(bootstrap.sourcePins16Current && Object.keys(bootstrap.sourcePins16Current).length === 16 &&
    sourceMatch(bootstrap.sourcePins16Current));
  assert(g.pins && Object.keys(g.pins).length === 16 && sourceMatch(g.pins));
  assert(g.bridgeRuntimeSourceSHA256 &&
    Object.keys(g.bridgeRuntimeSourceSHA256).length === BRIDGE_RUNTIME_SOURCE_FILES.length &&
    BRIDGE_RUNTIME_SOURCE_FILES.every(f=>g.bridgeRuntimeSourceSHA256[f]===shaFile(f)));
  return {grant:g, current: () => leaseCheck() && Date.now() < Date.parse(g.expiresUTC)};
}

function expectedRequest(actor, path, init, current) {
  assert(current() && ['A','B','none','rateLimited'].includes(actor));
  assert(typeof path === 'string' && CASE_PATH.test(path) && !path.includes('%') && !path.includes('?'));
  assert(init && init.method === 'GET' && init.cache === 'no-store' && init.credentials === 'include' &&
    !init.body && init.headers && init.headers.Accept === 'application/json');
  assert(Object.keys(init.headers).every(k => !['cookie','authorization','proxy-authorization'].includes(k.toLowerCase())));
  const vet = path.includes('/vet-visits');
  assert(vet ? init.headers['X-Gafus-Auth-Transport'] === 'cookie' :
    init.headers['X-Gafus-Auth-Transport'] === undefined);
}
const response = (body, code) => new Response(JSON.stringify(body), {status:code,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
}});
const denied = () => response({success:false,code:'UNAUTHORIZED'},401);
const limited = () => response({success:false,code:'RATE_LIMITED'},429);
function forbiddenPrivateMaterial(node, depth=0) {
  assert(depth < 28);
  if (Array.isArray(node)) return node.some(x => forbiddenPrivateMaterial(x, depth+1));
  if (node && typeof node === 'object') return Object.entries(node).some(([key,value]) =>
    /^(signedUrl|originalKey|previewKey|storageKey|accessToken|refreshToken|jwt|cookie)$/i.test(key) ||
    (depth > 0 && /^(url|ownerId)$/i.test(key)) ||
    forbiddenPrivateMaterial(value,depth+1));
  return typeof node === 'string' && /(?:X-Amz-(?:Signature|Credential)|[?&]signature=|Bearer\s+[A-Za-z0-9._-]+)/i.test(node);
}

/** The Core Pet GET returns full DB fields (including ownerId and awards).
 * The AG2 Web getMyPet adapter consumes only this explicit owner-bound DTO.
 * Do not let raw server fields cross the in-process synthetic cookie boundary.
 */
export function projectPrivatePetForWeb(raw, fixture, actor, path) {
  assert(raw && typeof raw==='object' && !Array.isArray(raw) &&
    safeFixture(fixture) && (actor==='A'||actor==='B'));
  const id=path.match(/^\/api\/v1\/pets\/([A-Za-z0-9_-]{1,128})$/)?.[1];
  const owner=actor==='A'?fixture.ownerA:fixture.ownerB;
  assert(id && raw.id===id && raw.ownerId===owner);
  assert(typeof raw.name==='string' && raw.name.length>0 && raw.name.length<=200 &&
    (raw.type==='DOG'||raw.type==='CAT') &&
    (raw.breed===null||typeof raw.breed==='string') &&
    typeof raw.showInProfile==='boolean');
  const fields=['notes','birthDate'];
  for(const field of fields) assert(raw[field]===null || raw[field]===undefined ||
    typeof raw[field]==='string');
  const measures=['weightKg','heightCm','neckGirthCm','muzzleGirthCm','bellyGirthCm'];
  for(const field of measures) assert(raw[field]===null || raw[field]===undefined ||
    (typeof raw[field]==='number' && Number.isFinite(raw[field])));
  return {
    id:raw.id,name:raw.name,type:raw.type,breed:raw.breed,
    showInProfile:raw.showInProfile,
    notes:raw.notes??null,birthDate:raw.birthDate??null,
    ...Object.fromEntries(measures.map(key=>[key,raw[key]??null])),
  };
}

/** Pure in-process request plumbing, used by AG4-only source tests with synthetic opaque credentials. */
export function createScopedVetWebReadTransport({fixture, current, honoApp, tokens, beforeAfter, disconnect}) {
  assert(safeFixture(fixture) && typeof current === 'function' && honoApp &&
    typeof honoApp.request === 'function' && tokens && typeof tokens.A === 'string' &&
    typeof tokens.B === 'string' && tokens.A !== tokens.B && typeof beforeAfter === 'function' &&
    typeof disconnect === 'function');
  let done=false, count=0;
  const webFetch = async ({actor,path,init}) => {
    assert(!done);
    expectedRequest(actor,path,init,current);
    assert(++count <= 16);
    if (actor === 'rateLimited') return limited();
    if (actor === 'none') return denied();
    const url = 'http://127.0.0.1:4142' + path;
    const raw = await honoApp.request(url, {method:'GET',headers:{
      'Cookie':exactCookieHeader(tokens[actor]),
      'X-Gafus-Auth-Transport':'cookie',
      'Accept':'application/json',
    }});
    assert(raw && [200,401,404,429].includes(raw.status) &&
      !raw.headers.has('set-cookie') && !raw.headers.has('location') &&
      raw.headers.get('cache-control')?.includes('no-store'));
    const parsed=await raw.json();
    assert(parsed && typeof parsed==='object' && !Array.isArray(parsed));
    const isPet= !path.includes('/vet-visits');
    const safeBody=raw.status===200 && isPet ?
      {...parsed,data:projectPrivatePetForWeb(parsed.data,fixture,actor,path)} : parsed;
    assert(!forbiddenPrivateMaterial(safeBody));
    return response(safeBody,raw.status);
  };
  const finalize=async ({accepted}) => {
    assert(!done);
    done=true;
    try { assert(accepted === true || accepted === false); await beforeAfter(); }
    finally { await disconnect(); }
  };
  return Object.freeze({webFetch,finalize});
}

/** Ephemeral environment is exclusive to this Node process and lives until finalize.
 * AG1 @gafus/auth/jwt caches its signing KeyObject for the lifetime of the
 * module. Never open a second bridge in the same process after it has signed;
 * AG2's standalone CLI must exit after the batch. No secret value is returned.
 * The function also accepts an isolated plain environment for source tests.
 */
let realBridgeRuntimeEverOpened = false;
export function beginVetRuntimeEnvironment({env=process.env,databaseUrl}) {
  assert(env && typeof env === 'object' && typeof databaseUrl === 'string' &&
    /^postgresql:\/\/ag2_vet_ro_[a-z0-9_]+@127\.0\.0\.1:55460\/gafus_ag2_vet_[a-z0-9_]+\?options=/.test(databaseUrl));
  // No mixing with inherited production/env credentials or another bridge.
  assert(!env.JWT_SECRET && !env.DATABASE_URL);
  if (env === process.env) assert(!realBridgeRuntimeEverOpened);
  const ownedJWT = Object.prototype.hasOwnProperty.call(env,'JWT_SECRET');
  const ownedDB = Object.prototype.hasOwnProperty.call(env,'DATABASE_URL');
  const originalJWT=env.JWT_SECRET,originalDB=env.DATABASE_URL;
  const secret=randomBytes(48).toString('hex');
  if(env===process.env) realBridgeRuntimeEverOpened = true;
  env.JWT_SECRET=secret;
  env.DATABASE_URL=databaseUrl;
  let released=false;
  return Object.freeze({
    release(){
      assert(!released);
      released=true;
      const untampered = env.JWT_SECRET === secret && env.DATABASE_URL === databaseUrl;
      if(ownedJWT) env.JWT_SECRET=originalJWT; else delete env.JWT_SECRET;
      if(ownedDB) env.DATABASE_URL=originalDB; else delete env.DATABASE_URL;
      assert(untampered);
    },
  });
}

/** AG2's unmodified runner calls this ONLY after its own independently signed preflight. */
export async function createVetWebReadTransport({scope,fixture,leaseCheck}) {
  const {grant,current}=checkActiveGrant({scope,fixture,leaseCheck});
  // Deliberately configure the existing synthetic loopback SELECT-only role before any Core import.
  const runtime=beginVetRuntimeEnvironment({databaseUrl:'postgresql://'+grant.readOnlyPgRole+
    '@127.0.0.1:55460/'+grant.databaseName+'?options='+
    encodeURIComponent('-c default_transaction_read_only=on -c statement_timeout=5000')});
  let db;
  try {
    // tsImport transforms AG1 TypeScript in this same process; never executes a .bin launcher.
    const {tsImport}=await import(vettedTsxLoaderUrl());
    const src=async p=>tsImport(pathToFileURL(localFile(p)).href,import.meta.url);
    const [{prisma},{Hono},{generateAccessToken},{authMiddleware},{petsRoutes},{petVetVisitRoutes}]=await Promise.all([
      import('@gafus/prisma'),import('hono'),import('@gafus/auth/jwt'),
      src('apps/api/src/middleware/auth.ts'),src('apps/api/src/routes/v1/pets.ts'),
      src('apps/api/src/routes/v1/pet-vet-visits.ts'),
    ]);
    db=prisma;
    const role=async()=>{
      const [r]=await db.$queryRawUnsafe(`SELECT current_database() db,current_user role,
        current_setting('default_transaction_read_only') ro,current_setting('statement_timeout') timeout,
        has_schema_privilege(current_user,'public','CREATE') sc,
        has_database_privilege(current_user,current_database(),'TEMPORARY') tmp,
        has_table_privilege(current_user,'public."PetVetVisit"','INSERT') ins,
        has_table_privilege(current_user,'public."PetVetVisit"','UPDATE') upd,
        has_table_privilege(current_user,'public."PetVetVisit"','DELETE') del`);
      assert(r && r.db===grant.databaseName && r.role===grant.readOnlyPgRole && r.ro==='on' &&
        ['5s','5000ms'].includes(r.timeout) && !r.sc && !r.tmp && !r.ins && !r.upd && !r.del);
    };
    const fingerprint=async()=>{
      await role();const rows={};
      for(const t of TABLES){
        const [r]=await db.$queryRawUnsafe(`SELECT count(*)::int c,
          md5(coalesce(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY t.id),'')) h
          FROM "${t}" t`);
        assert(r?.c===COUNTS[t] && typeof r.h==='string');
        rows[t]={count:r.c,hash:r.h};
      }
      return JSON.stringify(rows);
    };
    assert(current());
    const before=await fingerprint();
    // Signing happens only here. Neither raw JWT nor Cookie is returned/logged to the Web adapter.
    const tokens={
      A:await generateAccessToken({id:fixture.ownerA,username:'ag4VetSyntheticA',role:'USER'}),
      B:await generateAccessToken({id:fixture.ownerB,username:'ag4VetSyntheticB',role:'USER'}),
    };
    const app=new Hono();
    app.use('/api/v1/pets/*', async(c,next)=>{
      c.header('Cache-Control','private, no-store, max-age=0');
      c.header('X-Content-Type-Options','nosniff');
      if(c.req.method!=='GET') return c.json({success:false,code:'METHOD_NOT_ALLOWED'},405);
      await next();
      c.header('Cache-Control','private, no-store, max-age=0');
    });
    app.use('/api/v1/pets/*',authMiddleware);
    app.route('/api/v1/pets',petsRoutes);
    app.route('/api/v1/pets',petVetVisitRoutes);
    return createScopedVetWebReadTransport({fixture,current,honoApp:app,tokens,
      beforeAfter:async()=>{ assert(current() && before === await fingerprint()); },
      disconnect:async()=>{
        try { await db.$disconnect(); }
        finally { runtime.release(); }
      },
    });
  } catch {
    try { if(db) await db.$disconnect(); }
    finally { runtime.release(); }
    throw Error(NO_LOG);
  }
}
