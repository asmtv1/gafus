#!/usr/bin/env node
import { resolve } from 'node:path';
import { inspectAabNativeCompressor } from './android-aab-compressor.mjs';
try {
  if(process.argv.length!==3) throw Error('USAGE: node scripts/verify-android-aab-compressor.mjs path/to/NEW.aab');
  const result=inspectAabNativeCompressor(resolve(process.argv[2]));
  if(!result.passed) throw Error('NATIVE_VIDEO_COMPRESSOR_NOT_LINKED: a NEW store build is REQUIRED');
  console.log(`ANDROID_NATIVE_COMPRESSOR_LINKED_PASS dex=${result.scanned}`);
} catch(error) {
  console.error(`ANDROID_AAB_COMPRESSOR_CHECK_FAILED:${error.message}`);
  process.exitCode=1;
}
