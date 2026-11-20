/** Validate an actual Vitest/Node JSON artifact against every planned file.
 * A successful process code without all source files and named cases is NOT PASS.
 */
import { isAbsolute, relative, resolve } from 'node:path';
// Legacy explicit, grant-gated real-HTTP G05 tests are expected to remain
// skipped on an ordinary unit checkout. All other skips are incomplete.
const gatedFile='apps/web-vite/src/features/pets/g05WebRealConsumer.real.test.ts';
export const knownGatedSkipNames=new Set([
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R01 201 new + exact replay same key/owner/Pet',
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R02 true server 201 recorded, client loses ACK, manual SAME-key replay',
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R03 same key changed payload 409 conflict, original still replayable',
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R04 A and B same UUID create separate owned Pet; no key crossover',
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R05 malformed UUID and unsupported header return 400',
 'AG2 G05 REAL Web consumer [explicit AG4 Web gate required] G05-WEB-R06 invalid synthetic Bearer token returns 401',
]);

function normalizeFile(path, root){
  const pathname=isAbsolute(path)?path:resolve(root,path.startsWith('apps/web-vite/')?path:'apps/web-vite/'+path);
  const rel=relative(root,pathname).replaceAll('\\','/');
  if(!rel.startsWith('apps/web-vite/') || rel.includes('/../'))throw Error('WEB_GROUP_EVIDENCE_FOREIGN_FILE:'+path);
  return rel;
}
export function verifyWebViteGroupReport(raw, expectedFiles, root){
  if(!raw || !Array.isArray(raw.testResults) || !raw.testResults.length ||
     raw.success!==true || raw.numFailedTests!==0 ||
     !Number.isInteger(raw.numPendingTests)||raw.numPendingTests<0 ||
     (raw.numTotalTests!==undefined && raw.numPassedTests+raw.numPendingTests!==raw.numTotalTests)){
    throw Error('WEB_GROUP_REPORT_FAILED_SKIPPED_OR_EMPTY');
  }
  const expected=expectedFiles.map(file=>normalizeFile(file,root));
  if(expected.length===0 || new Set(expected).size!==expected.length)throw Error('WEB_GROUP_INVALID_PLAN_FILES');
  const actual=raw.testResults.map(x=>normalizeFile(x.name,root));
  if(actual.length!==expected.length || new Set(actual).size!==expected.length ||
      [...expected].sort().some((file,i)=>file!==[...actual].sort()[i])){
    throw Error('WEB_GROUP_FILE_SET_MISMATCH:'+JSON.stringify({expected,actual}));
  }
  let passed=0,skipped=0;
  const skippedNames=[];
  for(const result of raw.testResults){
    if(result.status && result.status!=='passed')throw Error('WEB_GROUP_FILE_NOT_PASSED:'+result.name);
    if(!Array.isArray(result.assertionResults) || result.assertionResults.length===0)
      throw Error('WEB_GROUP_EMPTY_CASES:'+result.name);
    for(const t of result.assertionResults){
      const name=t.fullName||t.title;
      if(!name)throw Error('WEB_GROUP_CASE_WITHOUT_NAME:'+result.name);
      if(t.status==='passed')passed++;
      else if(t.status==='skipped' && normalizeFile(result.name,root)===gatedFile &&
              knownGatedSkipNames.has(name) && !skippedNames.includes(name)){
        skipped++;skippedNames.push(name);
      }else throw Error('WEB_GROUP_UNEXPECTED_SKIP_OR_FAILURE:'+result.name+':'+name+':'+t.status);
    }
  }
  if(raw.numPassedTests!==passed || raw.numPendingTests!==skipped)throw Error('WEB_GROUP_CASE_COUNT_MISMATCH');
  return {fileCount:actual.length,caseCount:passed+skipped,passedCount:passed,
    skippedCount:skipped,skippedNames,files:[...actual].sort()};
}
