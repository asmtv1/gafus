/**
 * Offline, read-only, ephemeral containers confirming packaged entrypoint files.
 * No application servers started. No host ports, volumes, user data, registry,
 * credentials, push, deploy, cache cleanup or existing container modifications.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const version=execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8'}).trim();
const expected=new Map([
  ['web','/usr/share/nginx/html/index.html'],
  ['trainer-panel','/usr/share/nginx/html/index.html'],
  ['admin-panel','/usr/share/nginx/html/index.html'],
  ['api','/app/dist/index.js'],
  ['worker','/app/dist/worker/src/index.js'],
  ['bull-board','/app/dist/bull-board.js'],
  ['prisma','/app/node_modules/.prisma/client/default.js'],
]);
for (const [name, path] of expected) {
  const image=`gafus-archqa-local:${name}-${version}`;
  // test -s checks actual bytes, not labels or a mocked image list; --rm removes
  // ONLY the new container created by this command, never any existing asset.
  const result=execFileSync('docker',['run','--rm','--pull=never','--platform=linux/amd64',
    '--network=none','--read-only','--memory=128m','--cpus=1',
    '--entrypoint','/bin/sh',image,'-ec',`test -s '${path}'`],
    {encoding:'utf8',timeout:35000,maxBuffer:512*1024});
  assert.equal(result.trim(),'');
  console.log(`PASS OFFLINE_READONLY_IMAGE_ENTRYPOINT ${name}: ${path}`);
}
console.log('PASS SEVEN_OFFLINE_CONTAINER_SMOKES_7_7 no network no server no push no deploy');
