/** Never spawn an independent Chromium from a developer's Mac QA session.
 * Headless Playwright Test is reserved for actual GitHub Actions CI; manual
 * local QA uses the already-open personal Chrome Playwright Extension.
 */
export function selectWebE2eExecution(env) {
  const requested = env.GAFUS_WEB_E2E_AUTOMATED;
  if (requested !== undefined && requested !== '0' && requested !== '1')
    throw Error('INVALID_WEB_E2E_AUTOMATION_MODE');
  const githubCi = env.CI === 'true' && env.GITHUB_ACTIONS === 'true';
  if (requested === '1' && !githubCi)
    throw Error('REFUSE_SEPARATE_CHROMIUM_OUTSIDE_GITHUB_ACTIONS');
  return githubCi && requested !== '0';
}
