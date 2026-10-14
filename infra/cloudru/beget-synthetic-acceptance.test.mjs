import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('yaml');
const filename = 'infra/cloudru/beget-synthetic-purge-acceptance.mjs';
const workflow = yaml.parse(readFileSync('.github/workflows/beget-synthetic-acceptance.yml','utf8'));
const source = readFileSync(filename,'utf8');

const launch = (mode, env = {}) => spawnSync(process.execPath, [filename,mode], {
  cwd:process.cwd(), encoding:'utf8', timeout:10000,
  env:{PATH:process.env.PATH,HOME:process.env.HOME,...env},
});

test('manual workflow cannot run on push and never deploys', () => {
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.match(workflow.jobs.acceptance.if, /github\.ref == 'refs\/heads\/main'/);
  const contents=readFileSync('.github/workflows/beget-synthetic-acceptance.yml','utf8');
  assert.doesNotMatch(contents,/appleboy\/ssh-action|docker\/build-push-action|production-deploy-reusable|deploy-only\.yml|gh workflow run/);
  assert.equal(workflow.permissions.contents,'read');
  assert.equal(workflow.jobs.acceptance.environment,'production');
  assert.match(contents,/BEGET_SYNTHETIC_PURGE_CONFIRM/);
});

test('offline plan is safe and does not need any secrets', () => {
  const result=launch('--plan');
  assert.equal(result.status,0,result.stderr);
  const plan=JSON.parse(result.stdout);
  assert.equal(plan.mutates,false);
  assert.equal(plan.provider,'beget');
  assert.equal(plan.effectOfRun.length,5);
});

test('direct run refuses absent or wrong explicit confirmation before network', () => {
  for (const env of [{},{BEGET_SYNTHETIC_PURGE_CONFIRM:'wrong'},{
    BEGET_SYNTHETIC_PURGE_CONFIRM:'approved-two-disposable-production-webps',
    CLOUDRU_S3_ENDPOINT:'https://not-cloudru.invalid'
  }]) {
    const run=launch('--run',env);
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/SYNTHETIC_ACCEPTANCE_NOT_AUTHORIZED/);
  }
});

test('run requires production-scoped storage, signing, purge credentials and real UUIDs', () => {
  const run=launch('--run',{
    BEGET_SYNTHETIC_PURGE_CONFIRM:'approved-two-disposable-production-webps',
    CLOUDRU_S3_ENDPOINT:'https://s3.cloud.ru',
  });
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/SYNTHETIC_ACCEPTANCE_MISSING_/);
  assert.match(source,/IfNoneMatch:'\*'/);
  assert.match(source,/DeleteObjectCommand/);
  assert.match(source,/purge-cache-by-paths/);
  assert.match(source,/HEAD','GET/);
  assert.doesNotMatch(source,/purge-all-cache|gafus-gallery-production[^-]/);
});
