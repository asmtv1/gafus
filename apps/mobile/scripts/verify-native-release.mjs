#!/usr/bin/env node
/** Read-only preflight. Never modifies native directories, EAS or stores. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { validateNativeReleaseContract, validateOtaPublishAttestation,
  parseOtaChannel } from './native-release-contract.mjs';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(resolve(mobileRoot,file),'utf8'));
const expo=read('app.json').expo;
const errors=validateNativeReleaseContract({expo,mobilePackage:read('package.json'),
  eas:read('eas.json'),env:process.env});
if(process.argv.includes('--ota')) {
  const channel=parseOtaChannel(process.argv.slice(process.argv.indexOf('--ota')+1));
  if(!['production','preview'].includes(channel)) errors.push('MOBILE_OTA_EXPLICIT_CHANNEL_REQUIRED');
  else errors.push(...validateOtaPublishAttestation({channel,expoVersion:expo.version,env:process.env}));
}
if(errors.length) {
  for(const error of errors) console.error(`MOBILE_NATIVE_RELEASE_BLOCKED:${error}`);
  process.exitCode=1;
} else {
  console.log(`MOBILE_NATIVE_RELEASE_CONTRACT_PASS version=${expo.version} runtime=appVersion`);
}
