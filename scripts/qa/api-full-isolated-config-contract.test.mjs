import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=readFileSync('apps/api/vitest.config.ts','utf8');
const cdn='src/test/agent2-cdn-full-isolated.actor-access.test.ts';
const chat='src/modules/chat2/chat2.full-isolated.http.test.ts';

test('default API Vitest excludes local real-provider integration without disabling their guarded dedicated configurations',()=>{
 for(const s of [cdn,chat])assert(config.includes('"'+s+'"'));
 const checks=[
  ['apps/api/vitest.cdn-full-isolated.config.ts',cdn],
  ['apps/api/vitest.chat2-full-isolated.config.ts',chat],
 ];
 for(const [f,entry] of checks){
  const x=readFileSync(f,'utf8');
  assert(x.includes(entry));
  assert(x.includes('exclude: []'));
  assert(x.includes('setupFiles: []'));
 }
 assert(readFileSync('apps/api/src/test/agent2-cdn-full-isolated.actor-access.test.ts','utf8').includes('CDN_QA_UNSAFE_ENVIRONMENT'));
 assert(readFileSync('apps/api/src/modules/chat2/chat2.full-isolated.http.test.ts','utf8').includes('CHAT2_FULL_ISOLATION_DENIED'));
});
