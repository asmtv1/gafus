/** Reject certificates that Expo Updates SDK57 rejects before it verifies a manifest.
 * The app embeds this trust anchor; accepting an RSA cert without code-signing
 * X.509 usages results in a permanently non-updatable native binary.
 */
import {X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const CODE_SIGNING_EKU='1.3.6.1.5.5.7.3.3';
const fail=()=>{throw Error('OTA_CERT_NOT_EXPO_CODE_SIGNING');};

export function assertExpoOtaCodeSigningCertificate(pem){
  let cert;
  try{cert=new X509Certificate(pem);}catch{fail();}
  if(cert.publicKey.asymmetricKeyType!=='rsa'||
     (cert.publicKey.asymmetricKeyDetails?.modulusLength??0)<3072||
     !cert.keyUsage?.includes(CODE_SIGNING_EKU)||cert.ca||
     cert.subject!==cert.issuer||!cert.verify(cert.publicKey)) fail();
  // Node exposes X509 ExtendedKeyUsage but not the separate DigitalSignature
  // KeyUsage bit. Inspect the same certificate with OpenSSL, never with a shell.
  const result=spawnSync('openssl',['x509','-noout','-text'],{
    input:pem,encoding:'utf8',timeout:10_000,maxBuffer:1024*1024,
  });
  if(result.error||result.status!==0) fail();
  const keyUsage=/X509v3 Key Usage:[^\r\n]*\r?\n\s*([^\r\n]+)/.exec(result.stdout)?.[1]??'';
  if(!/\bDigital Signature\b/.test(keyUsage))fail();
  return cert;
}
