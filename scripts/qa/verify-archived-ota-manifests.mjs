/** Read-only check of archived, detached signed manifest bytes against exact native descriptors.
 * Archived asset receipts are not a fresh readback or a CI registration attestation.
 * Usage: node scripts/qa/verify-archived-ota-manifests.mjs <recovery-dir>
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PRODUCTION_CERT_PATH, verifyProductionNativeTrust} from '../../apps/mobile/scripts/verify-ota-production-native-trust.mjs';
import {assertExpoOtaCodeSigningCertificate} from '../../apps/mobile/scripts/verify-expo-ota-code-signing-cert.mjs';
const root=path.resolve(process.argv[2]??'');
assert(process.argv.length===3,'recovery-dir required');
const archive=path.join(root,'release-recovery'), evidence=path.join(root,'temp-evidence');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const cert=fs.readFileSync(PRODUCTION_CERT_PATH,'utf8');
assertExpoOtaCodeSigningCertificate(cert);
const targets={
 ios:{d:read(path.join(evidence,'smart-ota/ios101-registered.json')), artifact:'gafus-1.7.5.ipa', embedded:'Payload/Gafus.app/EXUpdates.bundle/app.manifest'},
 android:{d:read(path.join(evidence,'smart-ota/android-registered.json')),artifact:'gafus-1.7.5-17506-rustore-signed-ota.apk',embedded:'assets/app.manifest'}
};
let trustFailures=0;
for (const t of Object.values(targets)) {
 t.embeddedId=JSON.parse(execFileSync('unzip',['-p',path.join(archive,t.artifact),t.embedded],{maxBuffer:4*1024*1024})).id;
 assert.equal(t.embeddedId,t.d.embeddedUpdateId,'embedded ID differs from archived registry');
 try {
  verifyProductionNativeTrust({native:t.d,sourceSha:t.d.sourceSha,runtime:t.d.runtimeVersion,platform:t.d.platform,certificatePem:cert});
  console.log('REGISTERED_TRUST_PASS',t.artifact);
 } catch(error) {
  trustFailures++;
  console.log('REGISTERED_TRUST_BLOCKED',t.artifact,'archivedVerified='+t.d.verified,error.message);
 }
}
const unique=new Map();
let failed=0;
for (const file of ['gafus-cdn-ota-final-manifests-20261125.json','gafus-cdn-ota-verified-manifests-20261125.json']) {
 for (const row of read(path.join(evidence,file))) {
  try {
   const t=targets[row.platform]; assert(t,'unknown platform'); const d=t.d;
   // PostgreSQL encode(bytea, 'base64') wraps lines; normalize only line breaks.
   const encoded=row.body.replace(/\r?\n/g,'');
   const bytes=Buffer.from(encoded,'base64');
   assert(bytes.toString('base64')===encoded,'noncanonical base64');
   assert.equal(row.certificatePem,cert,'archived certificate differs from pinned cert');
   assert.equal(d.certificatePem,cert,'native descriptor certificate differs from pinned cert');
   assert.equal(row.certificateSha256,sha(cert)); assert.equal(d.certificateSha256,sha(cert));
   const sig=/^sig="([A-Za-z0-9+/=]+)",\s*keyid="([A-Za-z0-9_-]+)",\s*alg="rsa-v1_5-sha256"$/.exec(row.signatureHeader);
   assert(sig,'signature header format'); assert.equal(sig[2],d.signingKeyId); assert.equal(row.signingKeyId,d.signingKeyId);
   assert(crypto.verify('RSA-SHA256',bytes,{key:new crypto.X509Certificate(cert).publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(sig[1],'base64')),'invalid detached signature');
   const m=JSON.parse(bytes),pub=m.extra?.ota?.publication,extra=m.extra?.expoClient?.extra;
   assert.equal(row.state,'READY'); assert.equal(m.id,row.updateId);
   assert.equal(m.runtimeVersion,d.runtimeVersion); assert.equal(row.runtimeVersion,d.runtimeVersion);
   assert.equal(m.metadata.channel,d.channel);assert.equal(m.metadata.environment,d.environment);assert.equal(m.metadata.sourceSha,row.sourceSha);
   assert.equal(m.extra.ota.revision,row.revision); assert.equal(pub.nativeReleaseId,d.id);assert.equal(extra.otaNativeReleaseId,d.id);
   for (const fingerprint of [row.nativeFingerprint,pub.nativeFingerprint,extra.otaNativeFingerprint]) assert.equal(fingerprint,d.nativeFingerprint);
   assert.equal(row.embeddedUpdateId,t.embeddedId);
   if (row.updateUrl) assert.equal(row.updateUrl,d.updateUrl);
   if(pub.recoveryFor!==null) assert(pub.recoveryFor<row.revision && !pub.allowsCheckout,'unsafe recovery');
   const assets=[m.launchAsset,...m.assets];
   const inventory=new Map(row.artifacts.map(a=>[a.url,a]));
   assert.equal(inventory.size,row.artifacts.length);assert.equal(assets.length,inventory.size);
   for(const a of assets) {
    const r=inventory.get(a.url);assert(r,'missing receipt');const u=new URL(a.url);
    assert.equal(u.origin,'https://global.s3.cloud.ru');
    assert(u.pathname.startsWith('/gafus-ota-updates/ota/production/gafus/'+d.runtimeVersion+'/'+row.platform+'/assets/') && !u.search&&!u.hash,'wrong asset scope');
    assert(/^[a-f0-9]{64}$/.test(r.sha) && Number.isSafeInteger(r.bytes) && r.bytes>0 && r.verified===true,'invalid archived asset receipt');
    assert.equal(a.hash,Buffer.from(r.sha,'hex').toString('base64url'),'signed asset hash mismatch');
   }
   const digest=sha(bytes); const prev=unique.get(row.updateId);if(prev) assert.equal(prev,digest,'conflicting duplicate update ID');unique.set(row.updateId,digest);
   console.log(JSON.stringify({status:'PASS_ARCHIVED_SIGNATURE_AND_LINK',file,platform:row.platform,revision:row.revision,updateId:row.updateId,nativeReleaseId:d.id,embeddedUpdateId:t.embeddedId,manifestSha256:digest,assetReceipts:assets.length,recoveryFor:pub.recoveryFor}));
  } catch(error) {failed++;console.log(JSON.stringify({status:'FAIL',file,platform:row.platform,revision:row.revision,error:error.message.split('\n')[0].slice(0,200)}));}
 }
}
// Earlier diagnostic capture retains both the signed response bytes and the actual
// downloaded HBC. This is a separate receipt from the SQL archive asset inventories.
try {
 const file='gafus-ota-diagnostic-manifest.json';
 const bytes=fs.readFileSync(path.join(evidence,file));
 const m=JSON.parse(bytes),t=targets.ios,d=t.d,pub=m.extra?.ota?.publication,extra=m.extra?.expoClient?.extra;
 const headers=fs.readFileSync(path.join(evidence,'gafus-ota-diagnostic-headers'),'utf8');
 const line=headers.match(/^expo-signature:\s*([^\r\n]+)$/im)?.[1]?.trim();
 const sig=line?.match(/^sig="([A-Za-z0-9+/=]+)",\s*keyid="([A-Za-z0-9_-]+)",\s*alg="rsa-v1_5-sha256"$/);
 assert(sig && sig[2]===d.signingKeyId,'diagnostic signature header mismatch');
 assert(crypto.verify('RSA-SHA256',bytes,{key:new crypto.X509Certificate(cert).publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(sig[1],'base64')),'diagnostic signature invalid');
 assert.equal(m.runtimeVersion,d.runtimeVersion);assert.equal(m.metadata.channel,d.channel);assert.equal(m.metadata.environment,d.environment);
 assert.equal(pub.nativeReleaseId,d.id);assert.equal(extra.otaNativeReleaseId,d.id);
 assert.equal(pub.nativeFingerprint,d.nativeFingerprint);assert.equal(extra.otaNativeFingerprint,d.nativeFingerprint);
 const hbc=fs.readFileSync(path.join(evidence,'gafus-ota-ios101-public.hbc'));
 assert.equal(crypto.createHash('sha256').update(hbc).digest('base64url'),m.launchAsset.hash,'archived HBC mismatch');
 assert(!unique.has(m.id),'duplicate diagnostic update ID');unique.set(m.id,sha(bytes));
 console.log(JSON.stringify({status:'PASS_ARCHIVED_SIGNATURE_AND_LOCAL_LAUNCH_ASSET',file,platform:'ios',revision:m.extra.ota.revision,updateId:m.id,manifestSha256:sha(bytes),launchAssetSha256:sha(hbc),launchAssetBytes:hbc.length}));
} catch(error) {failed++;console.log(JSON.stringify({status:'FAIL_DIAGNOSTIC',error:error.message.split('\n')[0].slice(0,200)}));}
console.log('ARCHIVED_MANIFEST_UNIQUE',unique.size,'FAILED',failed);
process.exitCode=(failed||trustFailures)?1:0;
