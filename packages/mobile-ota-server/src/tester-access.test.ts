import { describe, expect, it } from 'vitest';
import { isOtaTesterAccount, issueOtaTesterGrant, verifyOtaTesterGrant, parseOtaTesterGrant } from './tester-access';
import { otaRolloutIncludesInstallation } from './rollout-policy';
const secret='real-production-secret-must-be-at-least-32-chars-for-HMAC-test';
const install='7ba9c3db-d4b1-4cff-8d60-ce424d1706d5';
const other='3d69e5ce-7efb-42e1-b012-6ce03368cbf6';
const now=1_800_000_000;
const native={platform:'ios' as const,runtimeVersion:'1.7.5',nativeFingerprint:'b'.repeat(64)};
describe('personal GAFUS OTA tester grants',()=>{
  it('grants only the two exact verified account names; no prefix, role or client spoofing',()=>{
    expect(isOtaTesterAccount('admin')).toBe(true);
    expect(isOtaTesterAccount('asmtv1')).toBe(true);
    for(const name of ['administrator','Admin','asmtv1-2','regular','']) {
      expect(isOtaTesterAccount(name)).toBe(false);
      expect(issueOtaTesterGrant({userId:'u1',username:name,installationId:install,...native},secret,now)).toBeNull();
    }
    expect(issueOtaTesterGrant({userId:'u1',username:'admin',installationId:install,...native},'short',now)).toBeNull();
    expect(issueOtaTesterGrant({userId:'u1',username:'admin',installationId:'spoofed',...native},secret,now)).toBeNull();
  });
  it('signs a short-lived, installation-bound token without leaking username',()=>{
    const token=issueOtaTesterGrant({userId:'u1',username:'asmtv1',installationId:install,...native},secret,now)!;
    expect(token).toMatch(/^v1\.[\w-]+\.[\w-]{43}$/);
    expect(token).not.toContain('asmtv1');
    expect(verifyOtaTesterGrant(token,install,secret,native,now)).toBe(true);
    expect(verifyOtaTesterGrant(token,install,secret,{...native,platform:'android'},now)).toBe(false);
    expect(verifyOtaTesterGrant(token,install,secret,{...native,nativeFingerprint:'f'.repeat(64)},now)).toBe(false);
    expect(verifyOtaTesterGrant(token,other,secret,native,now)).toBe(false);
    expect(verifyOtaTesterGrant(token,install,secret+'altered',native,now)).toBe(false);
    expect(verifyOtaTesterGrant(token,install,secret,native,now+901)).toBe(false);
    expect(verifyOtaTesterGrant(token,install,secret,native,now-901)).toBe(false);
    expect(verifyOtaTesterGrant(token.slice(0,-4)+'ABCD',install,secret,native,now)).toBe(false);
    expect(verifyOtaTesterGrant(null,install,secret,native,now)).toBe(false);
  });
  it('accepts only a single well-formed Expo SFV token parameter',()=>{
    const token=issueOtaTesterGrant({userId:'u1',username:'admin',installationId:install,...native},secret,now)!;
    const valid=`gafus-installation-id="${install}", gafus-tester-grant="${token}"`;
    expect(parseOtaTesterGrant(valid)).toBe(token);
    for(const invalid of [
      `gafus-tester-grant="${token}", gafus-tester-grant="${token}"`,
      `gafus-tester-grant="${token}", gafus-tester-grant = "${token}"`,
      `gafus-tester-grant=${token}`,
      `gafus-tester-grant="${token}\r\n"`,
      `gafus-tester-grant="${token}";foo=bar`,
      'gafus-tester-grant="tampered"',
      '',
    ]){
      const parsed=parseOtaTesterGrant(invalid);
      if(parsed!==null)expect(verifyOtaTesterGrant(parsed,install,secret,native,now)).toBe(false);
    }
  });
});

describe('OTA tester-only and promotion cohorts',()=>{
  const deployment='7ba9c3db-d4b1-4cff-8d60-ce424d1706d5';
  it('never serves active tester-only revision without a valid grant',()=>{
    expect(otaRolloutIncludesInstallation(deployment,install,0,true)).toBe(true);
    expect(otaRolloutIncludesInstallation(deployment,install,0,false)).toBe(false);
    expect(otaRolloutIncludesInstallation(deployment,null,0,false)).toBe(false);
  });
  it('preserves tester access after promoting to 1%, 10%, 50%, 100%',()=>{
    for (const percent of [1,10,50,100])
      expect(otaRolloutIncludesInstallation(deployment,install,percent,true)).toBe(true);
    expect(otaRolloutIncludesInstallation(deployment,null,100,false)).toBe(true);
    expect(otaRolloutIncludesInstallation(deployment,null,1,false)).toBe(false);
    expect(otaRolloutIncludesInstallation(deployment,install,101,false)).toBe(false);
  });
});
