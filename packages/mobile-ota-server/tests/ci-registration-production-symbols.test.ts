import {describe,expect,it} from 'vitest';
import {ciSignedReleaseSchema,validateSignedOtaCiResult} from '../src/ci-registration';

const id='b6b9dc0d-7e53-4da4-8f20-910fd3520be6';
const hash='a'.repeat(64);
const base={
  operationId:'production-s3-ota-test-001',nativeReleaseId:id,updateId:id,
  sourceSha:'b'.repeat(40),revision:1,buildAttempt:1,ciRunId:'prod-workflow-001',
  manifestBase64:'eyJ0ZXN0IjoxfQ==',
  signatureHeader:'sig="YWJjZA==", keyid="gafus-production-20261115", alg="rsa-v1_5-sha256"',
  artifacts:[{key:`${hash}.hbc`,immutableUrl:`https://global.s3.cloud.ru/gafus-ota-updates/ota/production/gafus/1.7.5/android/assets/${hash}.hbc`,
    sha256:hash,mimeType:'application/javascript',sizeBytes:2048,cdnVerified:true,s3Verified:true}],
  checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,iosPaymentGraph:false,privateSymbols:true},
  symbolsRef:`symbols-s3:${hash}`,
};
const native={id,appId:'gafus',platform:'android',environment:'production',channel:'production',
  runtimeVersion:'1.7.5',signingKeyId:'invalid!',nativeFingerprint:hash,
  certificatePem:'test only',certificateSha256:hash,verified:true};
describe('production CI callback private symbols proof, no AppTracer dependency',()=>{
  it('accepts production proof shape and reaches native signature gate',()=>{
    const result=ciSignedReleaseSchema.parse(base);
    expect(result.checks.privateSymbols).toBe(true);
    expect(()=>validateSignedOtaCiResult(native,result,'https://global.s3.cloud.ru/gafus-ota-updates'))
      .toThrow('INVALID_SIGNING_ID');
  });
  it('refuses an arbitrary reference, missing proof and EAS AppTracer stand-in',()=>{
    for(const symbolsRef of ['symbols-s3:unverified','apptracer:pretend']) {
      const result=ciSignedReleaseSchema.parse({...base,symbolsRef});
      expect(()=>validateSignedOtaCiResult(native,result,'https://global.s3.cloud.ru/gafus-ota-updates'))
        .toThrow('REQUIRED_CI_CHECK_MISSING');
    }
    expect(()=>ciSignedReleaseSchema.parse({...base,checks:{...base.checks,privateSymbols:undefined}}))
      .toThrow();
  });
  it('accepts an independently supplied immutable private S3 symbols digest',()=>{
    const legacy=ciSignedReleaseSchema.parse({...base,symbolsRef:`symbols-s3:${'d'.repeat(64)}`,
      checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,iosPaymentGraph:false,privateSymbols:true}});
    expect(()=>validateSignedOtaCiResult(native,legacy,'https://global.s3.cloud.ru/gafus-ota-updates'))
      .toThrow('INVALID_SIGNING_ID');
  });
});
