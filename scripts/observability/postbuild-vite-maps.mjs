#!/usr/bin/env node
/** Optional release gate only: when GAFUS_PRIVATE_MAPS_ENABLED=true, require
 * a private, existing 0700 directory and exact immutable revision/build.
 * Leave default development/production image workflow behavior unchanged.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sealViteMaps } from './seal-vite-sourcemaps.mjs';
const known={
  'gafus-web':'dist',
  'gafus-admin-panel':'dist',
  'gafus-trainer-panel':'src/trainer-vite/live/dist',
};
export async function postbuildMaps(service,cwd=process.cwd(),env=process.env) {
  if(env.GAFUS_PRIVATE_MAPS_ENABLED!=='true')return {enabled:false};
  if(!Object.hasOwn(known,service))throw Error('UNKNOWN_VITE_SERVICE');
  if(!env.GAFUS_PRIVATE_MAPS_DIR||!env.VITE_GAFUS_BUILD_ID ||
     !(env.GAFUS_RELEASE_SHA||env.GITHUB_SHA))
    throw Error('MAP_RELEASE_METADATA_REQUIRED');
  return sealViteMaps({
    service,dist:resolve(cwd,known[service]),privateDir:env.GAFUS_PRIVATE_MAPS_DIR,
    releaseSha:env.GAFUS_RELEASE_SHA||env.GITHUB_SHA,build:env.VITE_GAFUS_BUILD_ID,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  postbuildMaps(process.argv[2]).then(result=>{
    if(result.enabled!==false)console.log(JSON.stringify(result));
  }).catch(()=>{console.error('MAP_RELEASE_BLOCKED');process.exitCode=4;});
}
