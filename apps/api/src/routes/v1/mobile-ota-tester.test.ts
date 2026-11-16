import { Hono } from 'hono';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { verifyOtaTesterGrant } from '@gafus/mobile-ota-server/tester-access';
const mocked=vi.hoisted(()=>({user:vi.fn()}));
vi.mock('@gafus/prisma',()=>({prisma:{user:{findUnique:mocked.user}}}));
import {mobileOtaTesterRoutes} from './mobile-ota-tester';
const secret='test-key-with-at-least-thirty-two-characters-safe';
const installationId='7ba9c3db-d4b1-4cff-8d60-ce424d1706d5';
const native={platform:'ios' as const,runtimeVersion:'1.7.5',nativeFingerprint:'b'.repeat(64)};
const endpoint='/api/v1/mobile-ota-tester';
function request(body:unknown,authenticated=true){
  const app=new Hono();
  app.use(`${endpoint}/*`,async(c,next)=>{
    if(!authenticated)return c.json({success:false},401);
    c.set('user',{id:'server-verified-user-id',username:'spoofable-client-value',role:'USER'} as never);
    await next();
  });
  app.route(endpoint,mobileOtaTesterRoutes);
  return app.request(`http://localhost${endpoint}/grant`,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
beforeEach(()=>{
  vi.stubEnv('MOBILE_OTA_DELIVERY_ENV','production');
  vi.stubEnv('MOBILE_OTA_INSTALLATION_HASH_KEY',secret);
  vi.clearAllMocks();
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
