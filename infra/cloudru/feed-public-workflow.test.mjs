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

test('Cloud.ru jobs also see public Feed before provisioning without affecting Gallery', () => {
  const env = ci.jobs['cloudru-prepare-media'].env;
  assert.equal(env.FEED_BUCKET_PUBLIC, 'true');
  assert.equal(env.FEED_CDN_BASE_URL, expected.FEED_CDN_BASE_URL);
  assert.equal(env.CLOUDRU_S3_ENDPOINT, 'https://s3.cloud.ru');
  assert.equal(ci.jobs['beget-readonly-preflight'].needs.includes('security'), true);
  assert.equal(ci.jobs['cloudru-prepare-media'].needs.includes('cloudru-build-media-images'), true);
  const steps = ci.jobs['cloudru-prepare-media'].steps;
  const prepareIndex = steps.findIndex(step => step.run === 'node infra/cloudru/production-media-release.mjs --prepare');
  const verifyIndex = steps.findIndex(step => step.name === 'Wait for Cloud.ru Jobs revision and public Feed flag before application deploy');
  assert.ok(prepareIndex >= 0 && verifyIndex > prepareIndex);
  assert.match(steps[verifyIndex].run, /production-media-release\.mjs --verify/);
  assert.match(steps[verifyIndex].run, /sleep 10/);
  const release = readFileSync('infra/cloudru/production-media-release.mjs', 'utf8');
  assert.match(release, /CLOUDRU_FEED_JOB_CONFIG_NOT_CURRENT_/);
  for (const flag of ['FEED_BUCKET_PUBLIC', 'FEED_RUN_ONCE', 'FEED_WORKER_TYPE'])
    assert.ok(release.includes(`"${flag}"`));
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
