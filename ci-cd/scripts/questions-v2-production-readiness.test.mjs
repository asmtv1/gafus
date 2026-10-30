import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const compose = readFileSync('ci-cd/docker/docker-compose.prod.yml', 'utf8');
const deploy = readFileSync('.github/workflows/production-deploy-reusable.yml', 'utf8');
const job = readFileSync('infra/cloudru/production-job-release.mjs', 'utf8');
const reusable = readFileSync('.github/workflows/production-job-release-reusable.yml', 'utf8');

const gates = [
  'QUESTIONS_V2_MEDIA_ENABLED',
  'QUESTIONS_V2_PROCESSOR_READY',
  'QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED',
  'QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED',
  'QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED',
];

test('production API and worker default all Questions V2 readiness to false', () => {
  for (const gate of gates) {
    const composeLiteral = `${gate}=\${${gate}:-false}`;
    assert.equal(compose.split(composeLiteral).length - 1, 2, `API + Worker: ${gate}`);
    const defaultFalse = `vars.${gate} || 'false'`;
    assert(deploy.includes(`echo \"${gate}=false\"`), `bootstrap must default false: ${gate}`);
    assert.doesNotMatch(deploy, new RegExp(`${gate}=true`));
  }
});

test('Questions V2 production S3/HMAC remain secret inputs; no temporary tunnel in deploy', () => {
  for (const key of ['QUESTIONS_V2_INTERNAL_HMAC_SECRET','QUESTIONS_V2_S3_ACCESS_KEY_ID','QUESTIONS_V2_S3_SECRET_ACCESS_KEY']) {
    assert(deploy.includes(`secrets.${key}`), `SECRET_BINDING_MISSING_${key}`);
    assert.equal(compose.split(`- ${key}=\${${key}:-}`).length - 1, 2);
  }
  for(const fixed of ['QUESTIONS_V2_S3_BUCKET=gafus-questions-public', 'QUESTIONS_V2_S3_ENDPOINT=https://s3.cloud.ru', 'QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME=api.gafus.ru']) {
    assert(deploy.includes(fixed));
  }
  assert.doesNotMatch(compose + deploy, /trycloudflare\.com|stage-core-not-configured\.invalid/);
});

test('regular app deploy cannot mutate Cloud.ru Job image or bypass incompatible Gallery V2', () => {
  assert(reusable.includes('production-job-release.mjs \"--$PHASE\"'));
  assert(reusable.includes('preflight|cutover|verify'));
  assert(reusable.includes('docker buildx imagetools inspect'));
  assert(!/docker buildx build|docker\/build-push-action|publish-cloudru-image/.test(reusable));
  assert(job.includes('UNRECOGNIZED_GALLERY_IMAGE'));
  assert(job.includes('NEW_BACKEND_MUST_BE_DEPLOYED_BEFORE_JOBS'));
  assert(job.includes('QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED'));
  assert(job.includes('INVALID_EXISTING_JOB_RELEASE_MODE'));
});
