import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import { smokeSignedUrl } from './beget-production-smoke.mjs';
import { createHash } from 'node:crypto';

const workflow = yaml.parse(readFileSync('.github/workflows/production-deploy-reusable.yml', 'utf8'));
const compose = yaml.parse(readFileSync('ci-cd/docker/docker-compose.prod.yml', 'utf8'));
const deploy = Object.values(workflow.jobs).flatMap(job => job.steps || [])
  .find(step => step.name === 'Deploy to production server');
assert.ok(deploy, 'Production deployment workflow missing');
const scripts = ['DEPLOY_SCRIPT_1', 'DEPLOY_SCRIPT_2', 'DEPLOY_SCRIPT_3']
  .map(part => deploy.env[part]);
const script = scripts.join('\n');

describe('existing production CDN secret reuse', () => {
  it('audits Gallery metadata with the same Cloud.ru credentials as deployment', () => {
    const pipeline = yaml.parse(readFileSync('.github/workflows/ci-cd.yml', 'utf8'));
    const preflight = pipeline.jobs['beget-readonly-preflight'].env;
    const media = pipeline.jobs['cloudru-prepare-media'].env;
    for (const suffix of ['ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']) {
      assert.equal(preflight[`GALLERY_S3_${suffix}`], media[`CLOUDRU_S3_${suffix}`]);
      assert.equal(preflight[`GALLERY_S3_${suffix}`], '${{ secrets.CLOUDRU_S3_' + suffix + ' }}');
    }
  });
  it('never demands newly rotated Beget signing secrets', () => {
    assert.doesNotMatch(script, /secrets\.(?:BEGET_GALLERY_CDN_SECRET|BEGET_FEED_CDN_SECRET)/);
    assert.match(script, /Missing Gallery or Feed production CDN signing secret/);
    for (const name of ['GALLERY_CDN_SECRET', 'FEED_CDN_SECRET']) {
      assert.match(script, new RegExp(`secrets\\.${name}`));
      assert.match(script, new RegExp(`echo "${name}=\\$\\{\\{ secrets\\.${name} \\}\\}"`));
    }
    assert.doesNotMatch(script, /GALLERY_DEV_CDN_SECRET=/);
  });
  it('keeps purge API auth separate from signing secrets', () => {
    assert.match(script, /secrets.BEGET_CDN_API_TOKEN/);
    assert.match(script, /BEGET_CDN_PURGE_API_VERIFIED/);
    assert.match(script, /BEGET_CDN_PURGE_PROPAGATION_VERIFIED/);
    assert.match(script, /BEGET_CDN_RELEASE_CONFIRM/);
    assert.match(script, /MEDIA_CDN_PURGE_WORKER_ENABLED=true/);
  });
  it('uses the canonical Gallery secret with NO alias or legacy fallback', () => {
    const matches = [];
    for (const [name, service] of Object.entries(compose.services)) {
      const env = service.environment ?? [];
      const list = Array.isArray(env) ? env : Object.entries(env).map(([key, value]) => `${key}=${value}`);
      const gallery = list.find(row => row.startsWith('GALLERY_CDN_SECRET='));
      if (!gallery) continue;
      assert.equal(gallery, 'GALLERY_CDN_SECRET=${GALLERY_CDN_SECRET:-}', name);
      matches.push(name);
    }
    assert.equal(matches.length, 3);
  });
  it('requires explicit Beget-only approval and has NO Yandex CDN fallback', () => {
    assert.match(script, /vars.GAFUS_MEDIA_CDN_TARGET/);
    assert.doesNotMatch(script, /GAFUS_MEDIA_CDN_TARGET \|\| 'yandex'/);
    assert.doesNotMatch(script, /GALLERY_CDN_PROVIDER=yandex|FEED_CDN_PROVIDER=yandex|gallery-dev\.gafus\.ru|feed\.gafus\.ru/);
    assert.match(script, /GALLERY_CDN_PROVIDER=beget/);
    assert.match(script, /FEED_CDN_PROVIDER=beget/);
    assert.match(script, /https:\/\/mepsuduyokabib.begetcdn.cloud/);
    assert.match(script, /https:\/\/quepraquiecebquomiel.begetcdn.cloud/);
    assert.doesNotMatch(script, /echo \"FEED_CDN_BASE_URL=https:\/\/garaquachegasourn.begetcdn.cloud\"/);
  });
  it('does not allow Yandex CDN defaults in Gallery/Feed runtime Compose', () => {
    for (const [serviceName, svc] of Object.entries(compose.services)) {
      const settings = svc.environment ?? [];
      const env = Array.isArray(settings) ? settings : Object.entries(settings).map(([key,value]) => `${key}=${value}`);
      for (const value of env.filter(value => /^(?:GALLERY|FEED)_(?:CDN_BASE_URL|CDN_PROVIDER|CDN_SECRET|S3_ENDPOINT)=/.test(value))) {
        assert.doesNotMatch(value, /gallery-dev\.gafus\.ru|feed\.gafus\.ru|storage\.yandexcloud\.net|:-yandex|GALLERY_DEV_CDN_SECRET/, serviceName);
      }
      for (const scope of ['GALLERY', 'FEED']) {
        const provider = env.find(value => value.startsWith(`${scope}_CDN_PROVIDER=`));
        if (provider) assert.equal(provider, `${scope}_CDN_PROVIDER=${'${'+scope+'_CDN_PROVIDER:-beget}'}`);
      }
    }
    assert.doesNotMatch(script, /GALLERY_CDN_RESOURCE_IDS=|FEED_CDN_RESOURCE_IDS=/);
  });
  it('builds CDNvideo signatures with the unchanged input secret', () => {
    const secret = 'A'.repeat(32);
    const path = '/posts/user/post/attachments/media/poster.webp';
    const expires = 1800000000;
    const url = smokeSignedUrl('garaquachegasourn.begetcdn.cloud', path, secret, expires);
    const md5 = createHash('md5').update(`${secret}${path}${expires}`).digest('base64url');
    assert.equal(url, `https://garaquachegasourn.begetcdn.cloud/md5(${md5},${expires})${path}`);
    assert.ok(!url.includes(secret));
  });
});
