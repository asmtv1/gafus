/** Read-only check that a NEW store AAB includes the native module required by
 * prepareUploadVideo720. A JS-only bundle is not sufficient for this feature.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
export function dexHasNativeCompressor(buffers, mapping='') {
  // The canonical native package used by react-native-compressor 1.16.0.
  const present=buffers.some(b=>b.includes(Buffer.from('Lcom/reactnativecompressor/CompressorModule;')) ||
    b.includes(Buffer.from('Lcom/reactnativecompressor/CompressorPackage;')) ||
    b.includes(Buffer.from('com/reactnativecompressor/CompressorModule')));
  // With R8, the class name may be obfuscated; mapping is emitted by AGP.
  return present || /^com\.reactnativecompressor\.(CompressorModule|CompressorPackage)\s+->/m.test(mapping);
}
export function inspectAabNativeCompressor(path) {
  if(!existsSync(path)|| !/\.aab$/i.test(path)) throw Error('ANDROID_AAB_PATH_REQUIRED');
  const entries=execFileSync('unzip',['-Z1',path],{encoding:'utf8',timeout:20000,
    maxBuffer:5*1024*1024}).trim().split('\n');
  const dex=entries.filter(e=>/^base\/dex\/classes[0-9]*\.dex$/.test(e));
  if(!dex.length) throw Error('ANDROID_AAB_DEX_MISSING');
  const buffers=dex.map(e=>execFileSync('unzip',['-p',path,e],{
    timeout:20000,maxBuffer:120*1024*1024}));
  const map=entries.find(e=>/^(base\/)?BUNDLE-METADATA\/com\.android\.tools\.build\.obfuscation\/proguard\.map$/.test(e));
  const mapping=map?execFileSync('unzip',['-p',path,map],{
    encoding:'utf8',timeout:20000,maxBuffer:40*1024*1024}):'';
  return { passed:dexHasNativeCompressor(buffers,mapping), scanned:dex.length };
}
