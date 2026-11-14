/** Real API application composition, not an isolated OTA Hono router.
 * No writes, credentials, or network calls: delivery must be off by default.
 */
import {describe,it,expect,vi} from 'vitest';
import type {Context,Next} from 'hono';
// Isolate Hono route composition from Redis rate-limit availability;
// the middleware itself has separate integration tests. No production calls.
vi.mock('../../middleware/rate-limit.js',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../../middleware/rate-limit')>();
  const allow=async (_c:Context,next:Next)=>next();
  return {...actual,apiRateLimiter:allow};
});
import {app} from '../../app';

describe('signed OTA is mounted in real Hono app but fail-closed by default',()=>{
  it('mounts /ota/manifest and refuses delivery without explicit env activation',async()=>{
    if(process.env.MOBILE_OTA_DELIVERY_ENV) return;
    const response=await app.request('http://localhost/ota/manifest',{
      headers:{'expo-protocol-version':'1','expo-platform':'ios',
        'expo-runtime-version':'1.8.0','expo-channel-name':'preview',
        'expo-expect-signature':'sig, keyid="gafus-preview-20261114", alg="rsa-v1_5-sha256"',
        'x-gafus-native-fingerprint':'a'.repeat(64),
        accept:'application/expo+json, multipart/mixed'},
    });
    expect(response.status).toBe(404);
  });
  it('mounts protected CI native registration endpoint, but refuses when callback is disabled',async()=>{
    if(process.env.MOBILE_OTA_CI_CALLBACK_TOKEN) return;
    const response=await app.request('http://localhost/api/v1/internal/mobile-ota/native-releases/00000000-0000-4000-8000-000000000001');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({code:'OTA_CI_CALLBACK_DISABLED'});
  });
  it('does not expose administrator OTA release registry to unauthenticated caller',async()=>{
    const response=await app.request('http://localhost/api/v1/admin/mobile-ota/deployments');
    expect([401,403]).toContain(response.status);
  });
});
