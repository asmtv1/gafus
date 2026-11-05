/** Read-only Android AAB native ELF PT_LOAD check for 16 KiB memory pages.
 * Actual Google Play validation ALSO checks ZIP alignment and runtime/device.
 * No build/Gradle/SDK dependencies and no files extracted on disk.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PT_LOAD = 1;
export function elfLoadAlignments(buffer) {
  if(buffer.length<64 || buffer.toString('ascii',0,4)!=='\x7fELF') throw Error('NOT_ELF');
  const cls=buffer[4],data=buffer[5];
  if((cls!==1 && cls!==2)||(data!==1&&data!==2)) throw Error('ELF_CLASS_OR_ENDIAN_UNSUPPORTED');
  const little=data===1;
  const read16=o=>buffer.readUInt16LE(o); // native Android ELF is little endian
  const read32=o=>buffer.readUInt32LE(o);
  const read64=o=>Number(buffer.readBigUInt64LE(o));
  if(!little) throw Error('ELF_BIG_ENDIAN_UNSUPPORTED');
  const is64=cls===2;
  const phoff=is64?read64(32):read32(28);
  const entrySize=read16(is64?54:42);
  const count=read16(is64?56:44);
  if(count===0||count>200||entrySize<(is64?56:32) ||
     phoff<0 || phoff+entrySize*count>buffer.length) throw Error('ELF_PROGRAM_HEADERS_INVALID');
  const aligns=[];
  for(let i=0;i<count;i++) {
    const o=phoff+i*entrySize;
    if(read32(o)!==PT_LOAD) continue;
    const align=is64?read64(o+48):read32(o+28);
    const offset=is64?read64(o+8):read32(o+4);
    const addr=is64?read64(o+16):read32(o+8);
    aligns.push({alignment:align,modMatch:offset%16384===addr%16384});
  }
  if(!aligns.length) throw Error('ELF_NO_LOAD_SEGMENTS');
  return aligns;
}

export function check16kNativeElf(buffer) {
  return elfLoadAlignments(buffer).every(item=>
    item.alignment>=16384 && Number.isSafeInteger(item.alignment) &&
    (item.alignment&(item.alignment-1))===0 && item.modMatch);
}

export function inspectAabNativeLibraries(path) {
  if(!existsSync(path) || !/\.aab$/i.test(path)) throw Error('ANDROID_AAB_PATH_REQUIRED');
  const files=execFileSync('unzip',['-Z1',path],{encoding:'utf8',timeout:20000,
    maxBuffer:5*1024*1024}).split('\n').filter(name=>
    /^base\/lib\/(arm64-v8a|x86_64)\/[A-Za-z0-9_.+-]+\.so$/.test(name));
  if(files.length===0) throw Error('ANDROID_AAB_64BIT_LIBRARIES_MISSING');
  const failures=[];
  for(const name of files) {
    try {
      const buf=execFileSync('unzip',['-p',path,name],{maxBuffer:128*1024*1024,timeout:20000});
      if(!check16kNativeElf(buf)) failures.push(name);
    } catch(error) {
      failures.push(`${name} (${error?.code||'INVALID_ELF'})`);
    }
  }
  return { checked:files.length, failed:failures };
}
