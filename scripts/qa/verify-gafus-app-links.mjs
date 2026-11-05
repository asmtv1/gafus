#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { verifyGafusAppLinkSource } from './gafus-app-links-contract.mjs';
const read=p=>readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const well='apps/web-vite/public/.well-known/';
const errors=verifyGafusAppLinkSource({
  expo:json('apps/mobile/app.json').expo,
  ios:json(well+'apple-app-site-association'),
  android:json(well+'assetlinks.json'),
  edge:read('ci-cd/nginx/conf.d/gafus.ru.conf'),
  inner:read('ci-cd/docker/nginx-vite-refactor.conf'),
});
// This compares the SIGNING CERTIFICATE from the given AAB, never the
// keystore password. Google Play App Signing may re-sign a distributed APK:
// its public Play Console SHA-256 MUST ALSO appear in assetlinks before Play.
const i=process.argv.indexOf('--aab');
if(i!==-1) {
  try {
    const file=resolve(process.argv[i+1] ?? '');
    if(!existsSync(file)||!file.endsWith('.aab'))throw Error('AAB_NOT_FOUND');
    const entries=execFileSync('unzip',['-Z1',file],{encoding:'utf8',timeout:20000})
      .split('\n').filter(e=>/^META-INF\/[^/]+\.(RSA|EC|DSA)$/.test(e));
    if(entries.length!==1)throw Error('AAB_EXPECTED_ONE_SIGNER');
    const signed=execFileSync('unzip',['-p',file,entries[0]],{timeout:15000,maxBuffer:2e6});
    const pem=execFileSync('openssl',['pkcs7','-inform','DER','-print_certs'],{
      input:signed,encoding:'utf8',timeout:15000});
    const block=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/.exec(pem)?.[0];
    if(!block)throw Error('AAB_CERTIFICATE_UNREADABLE');
    const sha=new X509Certificate(block).fingerprint256;
    const refs=json(well+'assetlinks.json')[0]?.target?.sha256_cert_fingerprints ?? [];
    if(!refs.includes(sha))errors.push('AAB_SIGNING_CERT_NOT_LISTED_IN_ANDROID_ASSETLINKS');
    else console.log('ANDROID_AAB_PUBLIC_SIGNER_MATCHES_ASSETLINKS');
  }catch(e){errors.push('AAB_SIGNING_CERT_PROBE_FAILED:'+e.message)}
}
// Only inspect an ALREADY built dist (optional). No builds or writes here.
const d=process.argv.indexOf('--dist');
if(d!==-1) {
  const dest=resolve(process.argv[d+1] ?? '');
  for(const p of ['apple-app-site-association','assetlinks.json']) {
    const file=`${dest}/.well-known/${p}`;
    if(!existsSync(file) || read(file)!==read(well+p)) errors.push(`WEB_BUILD_ASSOCIATION_FILE_MISSING_OR_STALE:${p}`);
  }
}
if(errors.length) {
  for(const error of errors)console.error('GAFUS_APP_LINKS_RELEASE_BLOCKED:'+error);
  process.exitCode=1;
}else console.log('GAFUS_APP_LINKS_SOURCE_PASS iOS+Android apex+www; production deployment unverified');
