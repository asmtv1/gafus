import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertExpoOtaCodeSigningCertificate} from './verify-expo-ota-code-signing-cert.mjs';

const certs=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ota-public-certificates');
test('production certificate has Expo SDK57 Digital Signature and Code Signing EKU',()=>{
  const pem=fs.readFileSync(path.join(certs,'gafus-production-20261115.cert.txt'),'utf8');
  const cert=assertExpoOtaCodeSigningCertificate(pem);
  assert(cert.keyUsage.includes('1.3.6.1.5.5.7.3.3'));
  assert.equal(cert.ca,false);
});
test('rejects the old type of RSA root certificate missing both required X509 usages',()=>{
  const pem=fs.readFileSync(path.join(certs,'gafus-preview-20261114.cert.txt'),'utf8');
  assert.throws(()=>assertExpoOtaCodeSigningCertificate(pem),/OTA_CERT_NOT_EXPO_CODE_SIGNING/);
});
test('rejects arbitrary input',()=>{
  assert.throws(()=>assertExpoOtaCodeSigningCertificate('not a PEM'),/OTA_CERT_NOT_EXPO_CODE_SIGNING/);
});
