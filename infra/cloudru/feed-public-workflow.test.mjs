import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const yaml = require('yaml');
const parse = file => yaml.parse(readFileSync(file, 'utf8'));
const ci = parse('.github/workflows/ci-cd.yml');
const deploy = parse('.github/workflows/production-deploy-reusable.yml');
const manual = parse('.github/workflows/beget-synthetic-acceptance.yml');
const finalSmoke = parse('.github/workflows/beget-final-readonly-smoke.yml');
const mediaBuild = parse('.github/workflows/cloudru-media-images.yml');
const expected = {
  FEED_BUCKET_PUBLIC: 'true',
  FEED_CDN_BASE_URL: 'https://quepraquiecebquomiel.begetcdn.cloud',
  FEED_BEGET_CDN_SERVICE_ID: 'cbb7fe86-a193-457e-a756-9cf3aa2aef1b',
};
const fixtureExpression = '${{ vars.BEGET_FEED_SMOKE_FINAL_KEY }}';

test('one verified public Feed service for main preflight, manual E2E, and reusable SSH deploy', () => {
  for (const [scope, env] of [
    ['push preflight', ci.jobs['beget-readonly-preflight'].env],
    ['reusable deploy preflight', deploy.jobs['deploy-production'].steps.find(s => s.name === 'Validate Beget-only production readiness before SSH').env],
    ['manual synthetic acceptance', manual.jobs.acceptance.env],
    ['manual final read-only smoke', finalSmoke.jobs['final-smoke'].env],
    ['post-deploy smoke', ci.jobs['beget-verify-after-deploy'].env],
  ]) {
    assert.equal(env.FEED_BUCKET_PUBLIC, expected.FEED_BUCKET_PUBLIC, scope);
    assert.equal(env.FEED_CDN_BASE_URL, expected.FEED_CDN_BASE_URL, scope);
    if (scope !== 'post-deploy smoke')
      assert.equal(env.FEED_BEGET_CDN_SERVICE_ID, expected.FEED_BEGET_CDN_SERVICE_ID, scope);
  }
  assert.equal(ci.jobs['beget-readonly-preflight'].env.FEED_CDN_HEALTH_OBJECT_KEY, fixtureExpression);
  assert.equal(deploy.jobs['deploy-production'].steps.find(s => s.name === 'Validate Beget-only production readiness before SSH').env.FEED_CDN_HEALTH_OBJECT_KEY, fixtureExpression);
  assert.equal(ci.jobs['beget-verify-after-deploy'].env.FEED_CDN_HEALTH_OBJECT_KEY, fixtureExpression);
});

test('normal main push reuses pinned Feed worker and verifies Jobs without PATCH', () => {
  const release = ci.jobs['cloudru-prepare-media'];
  const env = release.env;
  assert.equal(env.FEED_BUCKET_PUBLIC, 'true');
  assert.equal(env.FEED_CDN_BASE_URL, expected.FEED_CDN_BASE_URL);
  assert.equal(env.CLOUDRU_S3_ENDPOINT, 'https://s3.cloud.ru');
  assert.ok(release.needs.includes('beget-readonly-preflight'));
  assert.ok(!ci.jobs['cloudru-build-media-images']);
  assert.ok(release.steps.some(s => s.run === 'node infra/cloudru/worker-image-pins.mjs --check'));
  assert.ok(release.steps.some(s => s.run === 'node infra/cloudru/production-media-release.mjs --verify'));
  assert.ok(!release.steps.some(s => s.run?.includes('production-media-release.mjs --prepare')));
  for (const media of ['GALLERY','FEED','QUESTIONS']) {
    assert.equal(env[`CLOUDRU_${media}_WORKER_IMAGE`],
      '${{ vars.CLOUDRU_' + media + '_WORKER_IMAGE }}');
    assert.equal(env[`CLOUDRU_${media}_WORKER_SOURCE`],
      '${{ vars.CLOUDRU_' + media + '_WORKER_SOURCE }}');
  }
});

test('production Compose file is generated with pinned public Feed + exact health fixture', () => {
  const item = deploy.jobs['deploy-production'].steps.find(s => s.name === 'Deploy to production server');
  assert.ok(item);
  const script = Object.entries(item.env).filter(([name]) => name.startsWith('DEPLOY_SCRIPT_')).map(([,value]) => value).join('\n');
  assert.ok(script.includes('echo "FEED_BUCKET_PUBLIC=true"'));
  assert.ok(script.includes(`echo "FEED_CDN_BASE_URL=${expected.FEED_CDN_BASE_URL}"`));
  assert.ok(script.includes(`echo "FEED_BEGET_CDN_SERVICE_ID=${expected.FEED_BEGET_CDN_SERVICE_ID}"`));
  assert.ok(script.includes(`echo "FEED_CDN_HEALTH_OBJECT_KEY=${fixtureExpression}"`));
  // Gallery has its own independent cutover gate. This Feed contract checks
  // that the existing Gallery CDN remains an available fallback, not that its
  // environment expression is permanently hard-coded to one Gallery mode.
  assert.ok(script.includes('echo "GALLERY_CDN_BASE_URL='));
  assert.ok(script.includes('https://mepsuduyokabib.begetcdn.cloud'));
  assert.ok(!script.includes('GALLERY_CDN_BASE_URL=https://storage.yandexcloud.net'));
  assert.ok(script.includes('echo "FEED_MEDIA_FALLBACK_ENABLED=true"'));
  assert.ok(script.includes('secrets.BEGET_CDN_API_TOKEN'));
  for (const deprecated of ['FEED_BUCKET_PUBLIC=${{ vars.FEED_BUCKET_PUBLIC',
    'FEED_CDN_BASE_URL=${{ vars.FEED_CDN_BASE_URL',
    'FEED_BEGET_CDN_SERVICE_ID=${{ vars.FEED_BEGET_CDN_SERVICE_ID',
    'FEED_CDN_HEALTH_OBJECT_KEY=${{ vars.FEED_CDN_HEALTH_OBJECT_KEY']) {
    assert.ok(!script.includes(deprecated), deprecated);
  }
});


test('both production pre-deploy gates never probe the retired Gallery Origin', () => {
  const preflight = ci.jobs['beget-readonly-preflight'].steps.find(s =>
    s.name === 'Verify public Feed CDN before API changes (read-only)');
  const reusable = deploy.jobs['deploy-production'].steps.find(s =>
    s.name === 'Validate Beget-only production readiness before SSH');
  assert.equal(preflight.run, 'node infra/cloudru/beget-production-smoke.mjs --feed-only');
  assert.match(reusable.run, /node infra\/cloudru\/beget-production-smoke\.mjs --feed-only/);
  assert.doesNotMatch(reusable.run, /GALLERY_CDN_REDIRECT_ENABLED=false/);
  assert.ok(ci.jobs['beget-readonly-preflight'].steps.some(s =>
    s.run === 'node infra/cloudru/gallery-release-edge-readiness.mjs'));
  assert.ok(ci.jobs['beget-readonly-preflight'].steps.some(s =>
    s.run === 'node infra/cloudru/gallery-release-metadata-ready.mjs'));
  assert.ok(ci.jobs['beget-verify-after-deploy'].steps.some(s =>
    s.run === 'node infra/cloudru/beget-production-smoke.mjs'));
  assert.ok(ci.jobs['beget-verify-after-deploy'].steps.some(s =>
    s.run === 'node infra/cloudru/gallery-origin-canary.mjs'));
});

test('normal push never publishes images, and separate manual release has only three workers', () => {
  assert.equal(ci.jobs['cloudru-build-media-images'], undefined);
  const jobs = mediaBuild.jobs.build.strategy.matrix.include.map(x => `${x.media}-${x.role}`);
  assert.deepEqual(jobs, ['feed-worker', 'gallery-worker', 'questions-worker']);
  assert.equal(mediaBuild.jobs.build.strategy['max-parallel'], 1);
  assert.equal(mediaBuild.jobs.build['timeout-minutes'], 350);
  assert.equal(mediaBuild.jobs.build.environment, 'production');
  assert.ok(ci.jobs['beget-readonly-preflight'].steps.some(s =>
    s.name === 'Enforce Origin-free media release before image publication'));
  const operator = parse('.github/workflows/cloudru-apply-worker-pins.yml');
  assert.equal(operator.jobs['apply-pins'].environment, 'production');
  assert.ok(operator.jobs['apply-pins'].steps.some(s =>
    s.run === 'node infra/cloudru/production-media-release.mjs --prepare'));
  assert.ok(!ci.jobs['cloudru-prepare-media'].steps.some(s =>
    s.run === 'node infra/cloudru/production-media-release.mjs --prepare'));
  const release = readFileSync('infra/cloudru/production-media-release.mjs', 'utf8');
  assert.match(release, /workerImages\(e\)/);
  assert.match(release, /CLOUDRU_RETIRED_ORIGIN_NOT_ALLOWED/);
});

test('one-push registry time budgets match the proven long Cloud.ru uploads', () => {
  const script = readFileSync('ci-cd/scripts/publish-cloudru-image.sh', 'utf8');
  assert.match(script, /timeout --kill-after=30s 30m docker buildx build/);
  assert.match(script, /timeout --kill-after=30s 200m python3 ci-cd\/scripts\/upload-cloudru-oci\.py/);
  assert.match(script, /release_budget_seconds=\$\(\(320 \* 60\)\)/);
  assert.match(script, /attempt_seconds=\$\(\(remaining < 150 \* 60/);
  assert.match(script, /timeout --kill-after=30s "\$\{attempt_seconds\}s" docker buildx build/);
  assert.match(script, /Cloud\.ru registry rejected authorization \(no retry\)/);
  assert.ok(!script.includes('timeout --kill-after=30s 10m'));
});
