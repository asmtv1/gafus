import { Hono } from 'hono';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { verifyOtaTesterGrant } from '@gafus/mobile-ota-server/tester-access';
vi.mock('@gafus/mobile-ota-server/version-selection',()=>({selectVersionUpdate:vi.fn().mockResolvedValue(undefined)}));
const mocked=vi.hoisted(()=>({user:vi.fn(),selected:vi.fn(),control:vi.fn(),nativeKeyId:vi.fn()}));
vi.mock('@gafus/prisma',()=>({prisma:{user:{findUnique:mocked.user}}}));
vi.mock('@gafus/mobile-ota-server/repository',()=>({
  resolvePublishedOtaSelection:mocked.selected,
  getVerifiedNativeOtaSigningKeyId:mocked.nativeKeyId,
}));
vi.mock('@gafus/mobile-ota-server/mandatory-control',async(importOriginal)=>({
  ...await importOriginal<typeof import('@gafus/mobile-ota-server/mandatory-control')>(),
  getMandatoryOtaControl:mocked.control,
}));
import {mobileOtaTesterRoutes} from './mobile-ota-tester';
const secret='test-key-with-at-least-thirty-two-characters-safe';
const installationId='7ba9c3db-d4b1-4cff-8d60-ce424d1706d5';
const native={platform:'ios' as const,runtimeVersion:'1.7.5',nativeFingerprint:'b'.repeat(64)};
const endpoint='/api/v1/mobile-ota-tester';
function request(body:unknown,authenticated=true,route='grant'){
  const app=new Hono();
  app.use(`${endpoint}/*`,async(c,next)=>{
    if(!authenticated)return c.json({success:false},401);
    c.set('user',{id:'server-verified-user-id',username:'spoofable-client-value',role:'USER'} as never);
    await next();
  });
  app.route(endpoint,mobileOtaTesterRoutes);
  return app.request(`http://localhost${endpoint}/${route}`,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
beforeEach(()=>{
  vi.stubEnv('MOBILE_OTA_DELIVERY_ENV','production');
  vi.stubEnv('MOBILE_OTA_INSTALLATION_HASH_KEY',secret);
  vi.clearAllMocks();
  mocked.control.mockImplementation(async(platform:string)=>platform==='android'
    ? {required:true,version:'1.7.5-ota.6',platform:'android',channel:'production'} : null);
  mocked.selected.mockResolvedValue({revision:6});
  mocked.nativeKeyId.mockResolvedValue('gafus-production-20261115');
});
afterEach(()=>vi.unstubAllEnvs());
describe('authenticated GAFUS OTA tester issuance',()=>{
  it.each(['admin','asmtv1'])('issues short-lived installation-bound grant for DB account %s',async(username)=>{
    mocked.user.mockResolvedValue({username});
    const response=await request({installationId,...native});
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const result=await response.json() as {data:{token:string;expiresInSeconds:number}};
    expect(result.data.expiresInSeconds).toBe(900);
    expect(verifyOtaTesterGrant(result.data.token,installationId,secret,native)).toBe(true);
    expect(mocked.user).toHaveBeenCalledWith({where:{id:'server-verified-user-id'},select:{username:true}});
  });
  it('rejects ordinary users even if client submits a fake username or role',async()=>{
    mocked.user.mockResolvedValue({username:'ordinary'});
    const response=await request({installationId,...native,username:'admin'});
    expect(response.status).toBe(400);
    expect(mocked.user).not.toHaveBeenCalled();
    const denied=await request({installationId,...native});
    expect(denied.status).toBe(403);
  });
  it('requires a valid login, production environment, and configured signing secret',async()=>{
    mocked.user.mockResolvedValue({username:'admin'});
    expect((await request({installationId,...native},false)).status).toBe(401);
    vi.stubEnv('MOBILE_OTA_DELIVERY_ENV','preview');
    expect((await request({installationId,...native})).status).toBe(404);
    vi.stubEnv('MOBILE_OTA_DELIVERY_ENV','production');
    vi.stubEnv('MOBILE_OTA_INSTALLATION_HASH_KEY','short');
    expect((await request({installationId,...native})).status).toBe(503);
  });
});

const policyBody={installationId,platform:'android',runtimeVersion:'1.7.5',
  nativeFingerprint:'b'.repeat(64)};
describe('mandatory OTA authorization follows signed manifest cohorts',()=>{
  it('requires an authenticated actor and valid native-signed context',async()=>{
    expect((await request(policyBody,false,'mandatory-policy')).status).toBe(401);
    expect((await request({...policyBody,username:'admin'},true,'mandatory-policy')).status).toBe(400);
    expect(mocked.control).not.toHaveBeenCalled();
  });
  it('keeps ordinary users outside rollout unblocked, even with a globally required OTA',async()=>{
    mocked.user.mockResolvedValue({username:'ordinary'});
    mocked.selected.mockResolvedValue(null); // real SQL selector yields no release at 0% if no previous
    const r=await request(policyBody,true,'mandatory-policy');
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({required:false,version:null,selectedRevision:null});
    expect(mocked.selected).toHaveBeenCalledWith(expect.objectContaining({
      platform:'android',runtimeVersion:'1.7.5',installationId,
      nativeFingerprint:'b'.repeat(64),keyId:'gafus-production-20261115',testerAllowed:false,
    }));
  });
  it('only mandates the selected release revision for an entitled tester or rollout cohort',async()=>{
    mocked.user.mockResolvedValue({username:'admin'});
    const r=await request(policyBody,true,'mandatory-policy');
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({required:true,version:'1.7.5-ota.6',selectedRevision:6});
    expect(mocked.selected).toHaveBeenCalledWith(expect.objectContaining({testerAllowed:true}));
  });
  it('never requires revision 6 from users selected for previous revision 5',async()=>{
    mocked.user.mockResolvedValue({username:'ordinary'});
    mocked.selected.mockResolvedValue({revision:5});
    const r=await request(policyBody,true,'mandatory-policy');
    expect((await r.json()).data).toEqual({required:false,version:null,selectedRevision:5});
  });
  it('does not query rollout if OTA flag is optional',async()=>{
    mocked.control.mockResolvedValue(null);
    const r=await request(policyBody,true,'mandatory-policy');
    expect((await r.json()).data).toEqual({required:false,version:null,selectedRevision:null});
    expect(mocked.selected).not.toHaveBeenCalled();
    expect(mocked.user).not.toHaveBeenCalled();
  });
  it('resolves iOS independently of Android for the same 1.7.5 runtime',async()=>{
    mocked.user.mockResolvedValue({username:'admin'});
    mocked.control.mockImplementation(async(platform:string)=>platform==='ios'
      ? {required:true,version:'1.7.5-ota.2',platform:'ios',channel:'production'}
      : {required:true,version:'1.7.5-ota.6',platform:'android',channel:'production'});
    const ios=await request({...policyBody,platform:'ios'},true,'mandatory-policy');
    expect((await ios.json()).data).toEqual({required:true,version:'1.7.5-ota.2',selectedRevision:6});
    const android=await request(policyBody,true,'mandatory-policy');
    expect((await android.json()).data).toEqual({required:true,version:'1.7.5-ota.6',selectedRevision:6});
    expect(mocked.control).toHaveBeenCalledWith('ios','1.7.5');
    expect(mocked.control).toHaveBeenCalledWith('android','1.7.5');
  });
  it('never requires mandatory OTA for native runtimes before 1.7.5',async()=>{
    const legacy=await request({...policyBody,runtimeVersion:'1.7.4'},true,'mandatory-policy');
    expect((await legacy.json()).data).toEqual({required:false,version:null,selectedRevision:null});
    expect(mocked.control).not.toHaveBeenCalled();
    expect(mocked.selected).not.toHaveBeenCalled();
  });
  it('fails closed on registry failure instead of claiming an eligible update',async()=>{
    mocked.user.mockResolvedValue({username:'admin'});
    mocked.selected.mockRejectedValue(new Error('database unavailable'));
    const r=await request(policyBody,true,'mandatory-policy');
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe('OTA_POLICY_UNAVAILABLE');
  });
});
