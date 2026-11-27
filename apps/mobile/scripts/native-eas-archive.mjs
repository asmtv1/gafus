import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:20000}).trim();
/** EAS .easignore overrides *all* nested .gitignore files in the monorepo. */
export function expectedEasIgnore(){
  let expected='# EAS local Store IPA: mirror root and every nested .gitignore; include only public OTA trust files.\n'+
    fs.readFileSync(path.join(root,'.gitignore'),'utf8')+'\n';
  const files=git(['ls-files','--','**/.gitignore']).split('\n').filter(Boolean).sort();
  for(const filename of files){
    const dir=path.posix.dirname(filename);
    expected+=`\n# From ${filename} (scoped to its directory)\n`;
    for(const line of fs.readFileSync(path.join(root,filename),'utf8').split(/\r?\n/)){
      if(!line||line.startsWith('#')){if(line.startsWith('#'))expected+=line+'\n';continue;}
      const neg=line.startsWith('!')?'!':'';
      const pat=neg?line.slice(1):line;
      const scoped=pat.startsWith('/')?dir+pat:pat.includes('/')?`${dir}/${pat}`:`${dir}/**/${pat}`;
      expected+=neg+scoped+'\n';
    }
  }
  expected+='\n# Only public certificate and admin-issued metadata, not signing credentials.\n'+
    '!apps/mobile/.ota-certs/\napps/mobile/.ota-certs/*\n'+
    '!apps/mobile/.ota-certs/native.pem\n!apps/mobile/.ota-certs/ios-store-native.json\n!apps/mobile/.ota-certs/android-store-native.json\n';
  return expected;
}
export function assertEasArchiveRules(){
  if(fs.readFileSync(path.join(root,'.easignore'),'utf8')!==expectedEasIgnore()) throw Error('EASIGNORE_OUT_OF_SYNC');
}
