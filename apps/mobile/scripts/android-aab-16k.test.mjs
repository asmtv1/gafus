import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check16kNativeElf, elfLoadAlignments } from './android-aab-16k.mjs';
function fakeELF(alignment=16384, offset=0, address=0) {
  const b=Buffer.alloc(160);b.write('\x7fELF',0,'binary');b[4]=2;b[5]=1;
  b.writeBigUInt64LE(BigInt(64),32);
  b.writeUInt16LE(56,54);b.writeUInt16LE(1,56);
  b.writeUInt32LE(1,64);b.writeBigUInt64LE(BigInt(offset),72);
  b.writeBigUInt64LE(BigInt(address),80);b.writeBigUInt64LE(BigInt(alignment),112);
  return b;
}
test('accepts ELF64 AArch64-style aligned 16KiB/64KiB LOAD segments',()=>{
  for(const n of [16384,65536])assert.equal(check16kNativeElf(fakeELF(n)),true);
});
test('rejects 4K PT_LOAD alignment even when offset and vaddr match',()=>{
  assert.equal(check16kNativeElf(fakeELF(4096)),false);
});
test('rejects otherwise 16KB aligned ELF with incompatible mmap offsets',()=>{
  assert.equal(check16kNativeElf(fakeELF(16384,0,4096)),false);
});
test('rejects malformed and non-ELF inputs rather than marking PASS',()=>{
  assert.throws(()=>elfLoadAlignments(Buffer.from('none')),/NOT_ELF/);
  assert.throws(()=>elfLoadAlignments(Buffer.alloc(64)),/NOT_ELF/);
});
