/** Reproducible, 1:1 partition of the legacy `vitest run src` input set.
 * Group names follow feature folders; the five known mount-heavy files are
 * each isolated in fresh Vitest processes, just like the existing chunk runner.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
export const isolatedWebTests = new Map([
  ['src/features/articles/ArticleGuestRoutes.mounted.test.tsx', 'isolated-article-guest-routes'],
  ['src/features/consultations/ConsultationsConnectedFlow.mounted.test.tsx', 'isolated-consultations-flow'],
  ['src/features/consultations/ConsultationsLivePage.mounted.test.tsx', 'isolated-consultations-live'],
  ['src/shared/auth/PrincipalIsolation.test.tsx', 'isolated-auth-principal'],
]);
export function discoverWebTests(appDir) {
  const src = join(appDir,'src');
  const files=[];
  const walk=(dir)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=join(dir,entry.name);
    if(entry.isDirectory()) walk(file);
    else if(entry.isFile() && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(relative(appDir,file).split('\\').join('/'));
    }
  }};
  walk(src);
  return files.sort();
}
const domain=(file)=>{
  const parts=file.split('/');
  if(parts[1]==='features')return 'feature-'+parts[2];
  if(parts[1]==='shared')return 'shared';
  if(parts[1]==='brand')return 'brand';
  return 'app';
};
export function generateWebViteGroups(files, size=12) {
  if (!Number.isInteger(size)||size<1||size>40) throw Error('WEB_VITE_GROUP_SIZE_INVALID');
  if(files.length<300)throw Error('WEB_VITE_TEST_DISCOVERY_UNDERFLOW:'+files.length);
  const unique=new Set(files);
  if(unique.size!==files.length || files.some(f=>!f.startsWith('src/')))throw Error('WEB_VITE_TEST_FILES_INVALID');
  for(const file of isolatedWebTests.keys()) if(!unique.has(file))throw Error('WEB_VITE_ISOLATED_FILE_MISSING:'+file);
  const buckets=new Map();
  for(const file of [...files].sort()) {
    if(isolatedWebTests.has(file))continue;
    const key=domain(file);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(file);
  }
  const groups=[{id:'vite-config',mode:'node',files:['vite.config.test.mjs']}];
  for(const [key,list] of [...buckets].sort(([a],[b])=>a.localeCompare(b))){
    for(let i=0;i<list.length;i+=size){
      groups.push({id:key+'-'+String(1+Math.floor(i/size)).padStart(2,'0'),mode:'vitest',files:list.slice(i,i+size)});
    }
  }
  for(const [file,id] of isolatedWebTests)groups.push({id,mode:'vitest',files:[file]});
  const flatten=groups.filter(g=>g.mode==='vitest').flatMap(g=>g.files);
  if(flatten.length!==files.length || new Set(flatten).size!==files.length ||
     [...flatten].sort().some((file,i)=>file!==[...files].sort()[i]))throw Error('WEB_VITE_GROUP_PARTITION_INCOMPLETE');
  return groups;
}
export function groupFingerprint(groups){return createHash('sha256').update(JSON.stringify(groups)).digest('hex');}
