#!/usr/bin/env node
/** Run this on the NEW 1.7.3 production AAB before submitting to Google Play. */
import { resolve } from 'node:path';
import { inspectAabNativeLibraries } from './android-aab-16k.mjs';
try {
  if(process.argv.length!==3) throw Error('USAGE: node scripts/verify-android-aab-16k.mjs path/to/NEW.aab');
  const result=inspectAabNativeLibraries(resolve(process.argv[2]));
  if(result.failed.length) {
    console.error(`ANDROID_16KB_NATIVE_ELF_FAILED ${result.failed.length}/${result.checked}`);
    for(const name of result.failed.slice(0,35)) console.error(name);
    process.exitCode=1;
  } else console.log(`ANDROID_16KB_NATIVE_ELF_PASS libs=${result.checked}`);
  console.log('NOTE: also verify AAB ZIP alignment in bundletool/Play Console and on a 16-KiB Android device.');
} catch(error) {
  console.error(`ANDROID_AAB_PREFLIGHT_FAILED:${error.message}`);
  process.exitCode=1;
}
