/** Isolated PostgreSQL: register native ID first, bind physical binary proof later. */
import {randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe,it,expect,afterAll} from 'vitest';
import {prisma} from '@gafus/prisma';
import {nativeReleaseInput,registerNativeCandidate,verifyNativeCandidate} from '../src/native-release-admin';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-native-prebuild-'));
const keyFile=path.join(temp,'test.key');
const certFile=path.join(temp,'test.crt');
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
fs.writeFileSync(keyFile,pair.privateKey.export({type:'pkcs1',format:'pem'}),{mode:0o600});
execFileSync('openssl',['req','-new','-x509','-key',keyFile,'-out',certFile,
  '-days','2','-subj','/CN=gafus-native-prebuild-isolated-test'],{stdio:'ignore'});
const certificatePem=fs.readFileSync(certFile,'utf8');
const actualArtifactSha=createHash('sha256').update('verified QA native binary').digest('hex');
const candidate=nativeReleaseInput.parse({
  operationId:`qa-native-prebuild-${randomUUID()}`,
  platform:'ios', environment:'preview',distribution:'internal',bundleId:'ru.gafus.app',
  appVersion:'1.8.0',buildNumber:`${Date.now()}`,runtimeVersion:'1.8.0',channel:'preview',
  updateUrl:'https://preview.gafus.test/ota/manifest',signingKeyId:'qa-prebuild',
  certificatePem,nativeFingerprint:'b'.repeat(64),sourceSha:'a'.repeat(40),
  provenance:{ciRunId:'qa-preview-build-planned-001',buildLogRef:'qa-preview-build-planned'},
});
let nativeId:string|undefined;
afterAll(async()=>{
  try {
    if(nativeId){
      await prisma.$executeRaw`DELETE FROM "MobileNativeReleaseAuditEvent" WHERE "nativeReleaseId"=${nativeId}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid`;
    }
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

describe('two-phase OTA native build lifecycle',()=>{
  it('allows candidate registration before binary SHA is known, but never verifies automatically',async()=>{
    const registered=await registerNativeCandidate(candidate,'qa-preview-admin');
    nativeId=registered.nativeReleaseId;
    expect(registered.replayed).toBe(false);
    const rows=await prisma.$queryRaw<{verified:boolean;attestation:{nativeArtifactSha256?:string}}[]>`
      SELECT verified,attestation FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].verified).toBe(false);
    expect(rows[0].attestation.nativeArtifactSha256).toBeUndefined();
  });
  it('rejects a fabricated device attestation without marking the candidate verified',async()=>{
    expect(nativeId).toBeDefined();
    await expect(verifyNativeCandidate(nativeId!,{
      operationId:`qa-prebuild-invalid-${randomUUID()}`,action:'VERIFY',
      reason:'This candidate has not been physically tested on a device',
      evidence:{nativeArtifactSha256:actualArtifactSha,physicalDeviceVerified:false,
        distributionVerified:true,reference:'missing-device-qa'},
    },'qa-preview-admin')).rejects.toMatchObject({code:'NATIVE_DEVICE_AND_DISTRIBUTION_PROOF_REQUIRED'});
  });
  it('binds final artifact SHA atomically at verified native release attestation',async()=>{
    const result=await verifyNativeCandidate(nativeId!,{
      operationId:`qa-prebuild-verified-${randomUUID()}`,action:'VERIFY',
      reason:'Isolated test simulates actual binary distribution and device proof',
      evidence:{nativeArtifactSha256:actualArtifactSha,physicalDeviceVerified:true,
        distributionVerified:true,reference:'local-isolated-qa-run'},
    },'qa-preview-admin');
    expect(result.verified).toBe(true);
    const rows=await prisma.$queryRaw<{verified:boolean;attestation:{nativeArtifactSha256?:string}}[]>`
      SELECT verified,attestation FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].verified).toBe(true);
    expect(rows[0].attestation.nativeArtifactSha256).toBe(actualArtifactSha);
  });
});
