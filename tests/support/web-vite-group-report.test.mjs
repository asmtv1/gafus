import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { verifyWebViteGroupReport, knownGatedSkipNames } from './web-vite-group-report.mjs';
import { discoverWebTests, generateWebViteGroups, isolatedWebTests } from '../../scripts/qa/web-vite-groups.mjs';
const root=resolve(import.meta.dirname,'../..');
const expected=['src/App.test.tsx'];
const report=()=>({success:true,numFailedTests:0,numPendingTests:0,numPassedTests:1,numTotalTests:1,
 testResults:[{name:resolve(root,'apps/web-vite/src/App.test.tsx'),status:'passed',assertionResults:[{fullName:'App smoke',status:'passed'}]}]});
test('group report accepts exact file and passed named case',()=>{
 assert.equal(verifyWebViteGroupReport(report(),expected,root).caseCount,1);
});
test('group report fails closed on missing, extra, pending, skipped, empty, duplicate files',()=>{
 for(const mutate of [
   r=>r.testResults=[],r=>r.testResults[0].name=resolve(root,'apps/web-vite/src/other.test.tsx'),
   r=>r.testResults[0].name=resolve(root,'packages/core/src/hijack.test.ts'),
   r=>r.numPendingTests=1,r=>r.numFailedTests=1,r=>r.success=false,
   r=>r.testResults[0].assertionResults=[],
   r=>r.testResults[0].assertionResults[0].status='skipped',
   r=>r.testResults.push(r.testResults[0]),
   r=>r.numPassedTests=0,
 ]){const r=report();mutate(r);assert.throws(()=>verifyWebViteGroupReport(r,expected,root));}
});
test('every discovered web-vite src test appears once; heavy DOM suites remain isolated',()=>{
 const discovered=discoverWebTests(resolve(root,'apps/web-vite'));
 const groups=generateWebViteGroups(discovered);
 const selected=groups.filter(g=>g.mode==='vitest').flatMap(g=>g.files);
 assert.deepEqual([...selected].sort(),[...discovered].sort());
 assert.equal(groups[0].id,'vite-config');
 const isolated=groups.filter(g=>g.id.startsWith('isolated-'));
 assert.equal(isolated.length,isolatedWebTests.size);
 for(const [file,id] of isolatedWebTests)
   assert.deepEqual(groups.find(g=>g.id===id),{id,mode:'vitest',files:[file]});
 assert(isolated.every(g=>g.files.length===1));
});

test('only the six already gate-dependent G05 real HTTP cases can be skipped',()=>{
 const r=report(),name=[...knownGatedSkipNames][0];
 r.testResults[0].name=resolve(root,'apps/web-vite/src/features/pets/g05WebRealConsumer.real.test.ts');
 r.testResults[0].assertionResults[0]={fullName:name,status:'skipped'};
 r.numPassedTests=0;r.numPendingTests=1;
 const ok=verifyWebViteGroupReport(r,['src/features/pets/g05WebRealConsumer.real.test.ts'],root);
 assert.equal(ok.skippedCount,1);assert.deepEqual(ok.skippedNames,[name]);
 r.testResults[0].assertionResults[0].fullName='NEW UNREGISTERED SKIP';
 assert.throws(()=>verifyWebViteGroupReport(r,['src/features/pets/g05WebRealConsumer.real.test.ts'],root));
});
