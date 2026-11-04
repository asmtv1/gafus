import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
const path = '.github/workflows/ci-cd.yml';
const wf = YAML.parse(readFileSync(path, 'utf8'));
const jobs = wf.jobs;
const needs = name => typeof jobs[name].needs === 'string' ? [jobs[name].needs] : jobs[name].needs || [];
const builds = ['web','trainer-panel','admin-panel','api','worker','bull-board','prisma'];

test('all release jobs have a valid DAG: no unknown prerequisites or cycles', () => {
  const active = new Set(), visited = new Set();
  const walk = name => {
    assert(jobs[name], `UNKNOWN_DEPENDENCY:${name}`);
    assert(!active.has(name), `RELEASE_JOB_CYCLE:${name}`);
    if (visited.has(name)) return;
    active.add(name);
    for (const dep of needs(name)) walk(dep);
    active.delete(name); visited.add(name);
  };
  for (const name of Object.keys(jobs)) walk(name);
  assert.equal(visited.size, Object.keys(jobs).length);
});

test('all seven production images are mandatory before deploy; no mutable latest image', () => {
  const imageDefs = jobs['build-images'].strategy.matrix.image;
  assert.deepEqual(imageDefs.map(x=>x.name), builds);
  assert.equal(new Set(imageDefs.map(x=>x.file)).size, 7);
  for (const img of imageDefs) {
    assert(img.file.startsWith('Dockerfile-') && img.file.endsWith('-optimized'));
    assert(existsSync(`ci-cd/docker/${img.file}`), `MISSING_BUILD_DOCKERFILE:${img.file}`);
    assert(!img.tag.includes('latest'));
  }
  const deploy = jobs['deploy-production'];
  assert(needs('deploy-production').includes('build-images'));
  assert(needs('deploy-production').includes('cutover-preflight'));
  for (const gate of ['security','build-apps','build-images','cloudru-media-contracts','cutover-preflight','beget-readonly-preflight']) {
    assert(deploy.if.includes(`needs.${gate}.result == 'success'`), `MISSING_SUCCESS_GATE:${gate}`);
  }
  assert(!deploy.if.includes(`needs.build-images.result != 'failure'`));
});

test('the full graph orders app deployment, job sync/verify and post-deploy validation', () => {
  assert.deepEqual(needs('cloudru-jobs-sync'), ['deploy-production']);
  assert.deepEqual(needs('cloudru-jobs-verify'), ['cloudru-jobs-sync']);
  assert(needs('beget-verify-after-deploy').includes('deploy-production'));
  assert(needs('beget-verify-after-deploy').includes('cloudru-jobs-verify'));
  assert(jobs['deploy-production'].if.includes('github.ref == \'refs/heads/main\''));
  assert(jobs['cloudru-jobs-sync'].if.includes('github.ref == \'refs/heads/main\''));
});

test('no release graph job is reached through a branchless manual bypass', () => {
  assert.equal(wf.concurrency['cancel-in-progress'], false);
  for (const name of ['build-images','prepare-docker','cloudru-jobs-preflight','deploy-production','cloudru-jobs-sync','cloudru-jobs-verify']) {
    assert(jobs[name].if?.includes('github.ref'), `UNGUARDED_PRODUCTION_JOB:${name}`);
  }
});


test('Cloud media CI gate runs actual Feed/Chat2/Questions Vitest instead of a pnpm no-op', () => {
  const manifest = JSON.parse(readFileSync('apps/feed-cloud/package.json', 'utf8'));
  assert.match(manifest.scripts?.test ?? '', /vitest run.*vitest\.config\.ts/,
    'CLOUD_RUNTIME_TEST_SCRIPT_MUST_EXECUTE_VITEST');
  const cloud = jobs['cloudru-media-contracts'];
  assert(cloud && typeof cloud.if === 'string' && cloud.if.includes('refs/heads/main'),
    'CLOUD_RUNTIME_TEST_JOB_SCOPE_CHANGED');
  assert(needs('cloudru-media-contracts').includes('prepare-deps'),
    'CLOUD_RUNTIME_MUST_WAIT_FOR_COMPILED_WORKSPACE_PACKAGES');
  const restore = cloud.steps.find(x => x.name === 'Restore compiled workspace dependencies');
  assert.equal(restore?.uses, 'actions/cache/restore@v5',
    'CLOUD_RUNTIME_WORKSPACE_BUILD_RESTORE_MISSING');
  assert.equal(restore?.with?.key, '${{ needs.prepare-deps.outputs.cache-key }}-deps');
  assert.match(restore?.with?.path ?? '', /packages\/\*\/dist/);
  const verify = cloud.steps.find(x => x.name === 'Verify media workspace dependencies are built (blocking)');
  assert.match(verify?.run ?? '', /MEDIA_WORKSPACE_BUILD_CACHE_MISSING/);
  assert.match(verify?.run ?? '', /MEDIA_WORKSPACE_PACKAGE_NOT_BUILT/);
  const provision = cloud.steps.findIndex(x => x.name === 'Provision FFmpeg/libx264 for real media tests (blocking)');
  const gateIndex = cloud.steps.findIndex(x => x.name === 'Cloud media runtime unit contracts (blocking)');
  assert(provision !== -1 && provision < gateIndex, 'FFMPEG_PROVISION_MUST_PRECEDE_MEDIA_TESTS');
  const install = cloud.steps[provision]?.run ?? '';
  assert.match(install, /sudo apt-get install -y --no-install-recommends ffmpeg/);
  assert.match(install, /command -v ffmpeg/);
  assert.match(install, /ffmpeg -hide_banner -encoders.*libx264/);
  assert.doesNotMatch(install, /grep -q ['\"]?libx264|\| head -n 1/);
  const gate = cloud.steps[gateIndex];
  assert.equal(gate?.run, 'pnpm --filter @gafus/feed-cloud-runtime test',
    'CLOUD_RUNTIME_TEST_GATE_MISSING_OR_NOOP');
  assert(needs('deploy-production').includes('cloudru-media-contracts'),
    'CLOUD_RUNTIME_TEST_MUST_BLOCK_DEPLOY');
});
