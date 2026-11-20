/** Strict translation of an actual Playwright JSON receipt into the existing
 * named-case test report format. Never infer success from process exit alone.
 */
export function verifyPlaywrightJson(report, requiredTitle) {
  const found=[];
  const visit=(s)=>{
    for(const spec of s.specs||[])if(spec.title===requiredTitle)found.push(spec);
    for(const child of s.suites||[])visit(child);
  };
  for(const suite of report?.suites||[])visit(suite);
  if(found.length!==1)throw Error(`PLAYWRIGHT_EXPECTED_CASE_COUNT_${found.length}`);
  const spec=found[0];
  if(spec.ok!==true || !Array.isArray(spec.tests) || spec.tests.length!==1)throw Error('PLAYWRIGHT_EXPECTED_CASE_NOT_SINGLE_PASS');
  const test=spec.tests[0];
  if(test.status!=='expected' || test.expectedStatus!=='passed' || !Array.isArray(test.results) ||
     test.results.length!==1 || test.results[0].status!=='passed'){
    throw Error('PLAYWRIGHT_TEST_SKIPPED_FAILED_RETRIED_OR_MALFORMED');
  }
  if((report.errors||[]).length)throw Error('PLAYWRIGHT_RUN_CONTAINS_ERRORS');
  return {
    success:true,numFailedTests:0,numPendingTests:0,numPassedTests:1,
    testResults:[{name:'tests/e2e/web/training.complete.spec.ts',assertionResults:[{title:requiredTitle,fullName:requiredTitle,status:'passed'}]}]
  };
}
