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
