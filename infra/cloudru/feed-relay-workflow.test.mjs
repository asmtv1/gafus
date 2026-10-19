import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import yaml from 'yaml';

const workflow=yaml.parse(readFileSync('.github/workflows/cloudru-media-images.yml','utf8'));
const steps=workflow.jobs.build.steps;
const named=(name)=>steps.find(step=>step.name?.startsWith(name));

test('Feed publishes exact release SHA privately to GHCR before production relay',()=>{
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.media.options,['all','feed','gallery','questions']);
  assert.equal(workflow.permissions.contents,'read');
  assert.equal(workflow.permissions.packages,'write');
  const staging=named('Publish Feed revision to private GHCR');
  assert.equal(staging.uses,'docker/build-push-action@v6');
  assert.match(staging.if,/inputs.publish/);
  assert.match(staging.if,/matrix.media == 'feed'/);
  assert.equal(staging.with.context,'.');
  assert.equal(staging.with.file,'apps/feed-cloud/Dockerfile');
  assert.equal(staging.with.platforms,'linux/amd64');
  assert.equal(staging.with.push,true);
  assert.equal(staging.with.tags,'ghcr.io/asmtv1/gafus-feed-relay:${{ github.sha }}');
  const login=named('Authenticate to private GHCR');
  assert.match(login.if,/matrix.media == 'feed'/);
  assert.match(login.with.password,/secrets.GHCR_TOKEN/);
});

test('Feed relay uses production GitHub Secrets for SSH and temporary Docker auth',()=>{
  const relay=named('Transfer Feed GHCR image');
  assert.equal(relay.uses,'appleboy/ssh-action@v1.0.3');
  assert.match(relay.if,/inputs.publish/);
  assert.match(relay.if,/matrix.media == 'feed'/);
  assert.match(relay.with.host,/secrets.SERVER_HOST/);
  assert.match(relay.with.key,/secrets.GAFUS_SERVER_SSH_KEY/);
  assert.match(relay.with.envs,/GHCR_TOKEN,CLOUDRU_KEY_ID,CLOUDRU_KEY_SECRET/);
  assert.match(relay.env.GHCR_TOKEN,/secrets.GHCR_TOKEN/);
  assert.match(relay.env.CLOUDRU_KEY_SECRET,/secrets.CLOUDRU_KEY_SECRET/);
  const script=relay.with.script;
  assert.match(script,/docker login ghcr.io.*--password-stdin/);
  assert.match(script,/docker pull "\$ghcr"/);
  assert.match(script,/docker image inspect "\$ghcr"/);
  assert.match(script,/docker tag "\$ghcr" "\$cloud"/);
  assert.match(script,/docker login gafus\.cr\.cloud\.ru.*--password-stdin/);
  assert.match(script,/docker push "\$cloud"/);
  assert.match(script,/mktemp -d \/tmp\/gafus-feed-registry-relay/);
  assert.match(script,/trap.*authdir/);
  assert.doesNotMatch(script,/docker compose|docker system prune|kubectl|service |systemctl|jobs:execute|production-media-release\.mjs/);
  assert.match(script,/FEED_CLOUDRU_PRODUCTION_RELAY_PUSH_COMPLETED/);
});

test('Gallery and Questions retain proven Buildx publication, while Feed direct push is blocked',()=>{
  const direct=named('Publish Gallery or Questions directly');
  assert.match(direct.if,/matrix.media != 'feed'/);
  assert.match(direct.run,/publish-cloudru-image\.sh/);
  const script=readFileSync('ci-cd/scripts/publish-cloudru-image.sh','utf8');
  assert.match(script,/FEED_REQUIRES_PRIVATE_GHCR_PRODUCTION_RELAY/);
  assert.match(script,/if \[\[ "\$media:\$role" == feed:worker \]\]/);
  assert.match(script,/--push/);
  const report=named('Report independently pinned');
  assert.match(report.run,/docker buildx imagetools inspect/);
  assert.match(report.run,/worker-image-pins\.mjs --source/);
  assert.match(report.run,/sha256:/);
  assert.ok(!workflow.jobs.build.steps.some(x=>x.run?.includes('production-media-release.mjs --prepare')));
});
