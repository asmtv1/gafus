import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dexHasNativeCompressor } from './android-aab-compressor.mjs';
test('requires the actual native compressor module, not a JS-only import',()=>{
  assert.equal(dexHasNativeCompressor([Buffer.from('expo-video\nreact-native-compressor.js')]),false);
  assert.equal(dexHasNativeCompressor([Buffer.from('Lcom/reactnativecompressor/CompressorPackage;')]),true);
  assert.equal(dexHasNativeCompressor([Buffer.from('Lcom/reactnativecompressor/CompressorModule;')]),true);
});
test('supports an obfuscated release AAB only when Gradle provides exact R8 mapping',()=>{
  const b=[Buffer.from('Lx/y/A;')];
  assert.equal(dexHasNativeCompressor(b,'com.reactnativecompressor.CompressorModule -> x.y.A:\n'),true);
  assert.equal(dexHasNativeCompressor(b,'com.other.FakeCompressorModule -> x.y.A:\n'),false);
});
