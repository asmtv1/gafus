/** Strict fault-pilot Vitest receipt: real SQL + mocked provider is not a full external run. */
export function verifyFaultReport(raw, task, root) {
  const filesByTask={
    'payment.failures.pg':[
      'packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts',
      'packages/subscription-payment-server/src/appleSubscriptionState.realpg.test.ts',
      'packages/subscription-payment-server/src/subscriptionTransitions.realpg.test.ts',
    ],
    'worker.failures.pg':['packages/worker/src/media-cdn-purge-worker.real-pg.test.ts'],
  };
  const expectedFiles=filesByTask[task?.id];
  if(!expectedFiles || task.kind!=='faults' || !Array.isArray(task.expectedCases) || task.expectedCases.length<2)
    throw Error('FAULT_QA_UNREGISTERED_OR_EMPTY_PLAN');
  if(!raw || !Array.isArray(raw.testResults) || raw.testResults.length!==expectedFiles.length ||
     raw.numFailedTests!==0 || raw.numPendingTests!==0 || !Number.isInteger(raw.numPassedTests) ||
     raw.numPassedTests<task.expectedCases.length || raw.success===false)
    throw Error('FAULT_QA_MISSING_OR_FAILED_VITEST_RECEIPT');
  const relativeFiles=raw.testResults.map(entry=>{
    if(typeof entry.name!=='string' || !entry.name.startsWith(root+'/') ||
       !Array.isArray(entry.assertionResults) || entry.assertionResults.length===0)
      throw Error('FAULT_QA_INVALID_SOURCE_OR_ASSERTIONS');
    return entry.name.slice(root.length+1);
  });
  if(relativeFiles.length!==new Set(relativeFiles).size ||
     relativeFiles.slice().sort().join('|')!==expectedFiles.slice().sort().join('|'))
    throw Error('FAULT_QA_SOURCE_FILE_DRIFT');
  const cases=raw.testResults.flatMap(result=>result.assertionResults);
  if(cases.length!==raw.numPassedTests || cases.some(c=>c.status!=='passed' || typeof c.fullName!=='string'))
    throw Error('FAULT_QA_FAIL_OR_SKIP_IN_FULL_RESULT');
  const names=task.expectedCases.map(name=>{
    const found=cases.filter(c=>c.fullName===name || c.fullName.endsWith(' '+name));
    if(found.length!==1 || found[0].status!=='passed')
      throw Error('FAULT_QA_REQUIRED_ASSERTION_NOT_UNIQUE_PASSED: '+name);
    return {name,status:'passed'};
  });
  return {validatedFiles:relativeFiles.length,validatedAssertions:cases.length,namedCases:names};
}
