import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compose = read('../docker/docker-compose.prod.yml');
const ci = read('../../.github/workflows/ci-cd.yml');
const sharedDeploy = read('../../.github/workflows/production-deploy-reusable.yml');

function composeService(name) {
  const marker = `\n  ${name}:\n`;
  const start = compose.indexOf(marker);
  assert.ok(start >= 0, `Docker service ${name} must exist`);
  const body = compose.slice(start + marker.length);
  const end = body.search(/\n  [a-z0-9-]+:/);
  return end >= 0 ? body.slice(0, end) : body;
}

test('polls require no separate feature flag in Web, API or background worker', () => {
  for (const name of ['web', 'api', 'worker']) {
    const service = composeService(name);
    assert.match(service, /^      - FEED_ENABLED=\$\{FEED_ENABLED:-false\}$/m);
    assert.doesNotMatch(service, /FEED_POLLS_ENABLED/);
  }
});

test('CI exercises migrations and real PostgreSQL poll end-to-end before deploying main', () => {
  assert.match(ci, /test-feed-polls-ci\.py/);
  assert.match(ci, /FeedPollComposer\.test\.tsx/);
  assert.match(ci, /publication-client\.test\.ts/);
  assert.match(ci, /feed-poll-release-contract\.test\.mjs/);
  assert.match(ci, /deploy-production:\s+needs: \[security, build-apps, build-images, cloudru-prepare-media\]/);
  // Cloud.ru worker publication is explicitly manual; the normal main path
  // must verify immutable pins and existing processing Jobs before deployment.
  assert.doesNotMatch(ci, /cloudru-build-media-images:/);
  assert.match(ci, /cloudru-prepare-media:\s+needs: \[beget-readonly-preflight, cloudru-media-contracts\]/);
  assert.match(ci, /CLOUDRU_WORKER_PINS_REQUIRED == 'true'/);
  assert.match(ci, /node infra\/cloudru\/worker-image-pins\.mjs --check/);
  assert.match(ci, /node infra\/cloudru\/production-media-release\.mjs --verify/);
  assert.match(ci, /github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'/);
  assert.match(sharedDeploy, /production-schema-cutover\.sh/);
});

test('poll migration remains additive and polls use Feed availability without a second flag', () => {
  const sql = read('../../packages/prisma/migrations/20261014000000_feed_polls/migration.sql');
  const runtime = read('../../packages/core/src/services/feed/runtimeServices.ts');
  const publish = read('../../packages/core/src/services/feed/publish.ts');
  const dto = read('../../packages/core/src/services/feed/service.ts');
  assert.match(sql, /CREATE TABLE "FeedPoll"/);
  assert.match(sql, /CREATE TABLE "FeedPollOption"/);
  assert.match(sql, /CREATE TABLE "FeedPollVote"/);
  assert.match(sql, /CREATE TABLE "FeedPollVoteSelection"/);
  assert.doesNotMatch(sql, /\bDROP (TABLE|COLUMN|INDEX)\b/i);
  const web = read('../../apps/web/src/features/feed/FeedViews.tsx');
  const mobile = read('../../apps/mobile/src/features/feed/screens.tsx');
  const http = read('../../packages/feed-server/src/index.ts');
  for (const source of [runtime, publish, dto, web, mobile, http]) {
    assert.doesNotMatch(source, /FEED_POLLS_ENABLED|pollsEnabled/);
  }
  assert.match(runtime, /polls: createFeedPolls\(\{ db: prisma, storage, enabled \}\)/);
  assert.match(publish, /await tx\.feedPoll\.findUnique/);
  assert.match(dto, /db\.feedPoll\.findMany/);
  assert.match(web, /access\.enabled\.data\?\.enabled/);
  assert.match(mobile, /status\.data\?\.enabled/);
});
