/** Operator-only image pin update, never invoked from normal CI/CD. */
import { execFileSync } from 'node:child_process';
import { workerSourceFingerprint, pinnedWorkerImage, workerSources } from './worker-image-pins.mjs';

const [media, image, source, mode] = process.argv.slice(2);
if (!workerSources[media] || !image || !source || !['--check', '--apply'].includes(mode)) {
  console.error('Usage: node infra/cloudru/set-worker-pin.mjs <gallery|feed|questions> <verified_image@sha256:digest> <source_fingerprint> --check|--apply');
  process.exit(2);
}
const prefix=`CLOUDRU_${media.toUpperCase()}_WORKER`;
const env={[`${prefix}_IMAGE`]:image,[`${prefix}_SOURCE`]:source};
const pinned=pinnedWorkerImage(media,env);
if(source !== workerSourceFingerprint(media)) throw Error('CLOUDRU_WORKER_PIN_NOT_CURRENT_'+media);
console.log('WORKER_PIN_REVIEWED',media,pinned,'source',source);
if(mode==='--apply') {
  // User-authorized release operator action. No GH token, credentials, or
  // environment contents are printed to logs. No repo commits or pushes.
  for(const [name,value] of Object.entries(env))
    execFileSync('gh',['variable','set',name,'--env','production','--repo','asmtv1/gafus','--body',value],
      {timeout:30000,stdio:['ignore','pipe','pipe']});
  const entries=JSON.parse(execFileSync('gh',[
    'variable','list','--env','production','--repo','asmtv1/gafus','--json','name,value'],
    {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
  for(const [name,value] of Object.entries(env))
    if(entries.find(x=>x.name===name)?.value!==value)
      throw Error('WORKER_GITHUB_PIN_WRITE_UNCONFIRMED_'+name);
  console.log('WORKER_PIN_GITHUB_PRODUCTION_CONFIRMED',media);
}
