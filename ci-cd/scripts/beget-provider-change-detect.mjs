/** Decide whether this source release changes Beget CDN provider configuration.
 * Deploy smoke checks still run on every release. This detector only determines
 * if an additional provider CONTROL-PLANE read must block this particular push.
 * Changes to GitHub environment variables / Beget console require the separate
 * manual Beget Provider Audit workflow before applying the change.
 */
import { execFileSync } from 'node:child_process';

const providerConfigFiles = new Set([
  'infra/cloudru/beget-gallery-create.mjs',
  'infra/cloudru/beget-gallery-secure-configure.mjs',
  'infra/cloudru/gallery-redirect-release-gate.mjs',
]);
const composePath = 'ci-cd/docker/docker-compose.prod.yml';
const providerVariables = /^[+-](?![+-]).*(?:BEGET_CDN_|GALLERY_CDN_|FEED_CDN_|GALLERY_BEGET_CDN_|FEED_BEGET_CDN_)/m;

export function requiresProviderCheck(changedPaths, composePatch = '') {
  if (changedPaths.some(path => providerConfigFiles.has(path))) return true;
  return changedPaths.includes(composePath) && providerVariables.test(composePatch);
}

export function detectProviderChange(before, after, git = execFileSync) {
  const sha = /^[a-f0-9]{40}$/;
  if (!sha.test(before) || !sha.test(after)) throw Error('BEGET_CHANGE_DETECT_INVALID_SHA');
  // New branch / zero SHA: unknown baseline -> verify provider before deploy.
  if (/^0{40}$/.test(before)) return true;
  const run = args => git('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  // A rewritten main history must not silently get treated as a harmless push.
  // A non-ancestor baseline is a provider revalidation, not a skipped check.
  try { run(['merge-base', '--is-ancestor', before, after]); }
  catch { return true; }
  const paths = run(['diff', '--name-only', '--no-renames', before, after, '--',
    ...providerConfigFiles, composePath]).trim().split('\n').filter(Boolean);
  if (!paths.includes(composePath)) return requiresProviderCheck(paths);
  const patch = run(['diff', '--unified=0', '--no-ext-diff', before, after, '--', composePath]);
  return requiresProviderCheck(paths, patch);
}

if (process.argv[1]?.endsWith('/beget-provider-change-detect.mjs')) {
  try {
    const required = detectProviderChange(process.argv[2] ?? '', process.argv[3] ?? '');
    const line = `provider_required=${required}\n`;
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_OUTPUT, line);
    }
    process.stdout.write(`BEGET_PROVIDER_CONFIG_CHANGE=${required}\n`);
  } catch {
    // Detection errors are never interpreted as "no change".
    console.error('BEGET_CHANGE_DETECT_FAILED');
    process.exitCode = 1;
  }
}
