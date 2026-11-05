import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chat = 'gafus-chat2-20261028.cr.cloud.ru/gafus-chat-video@sha256:' + 'a'.repeat(64);
const feed = 'gafus.cr.cloud.ru/gafus-feed-worker@sha256:' + 'b'.repeat(64);
const validManifest = JSON.stringify({ schemaVersion: 2,
  mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
  config: {digest: 'sha256:' + 'a'.repeat(64)}, layers: [{digest: 'sha256:' + 'b'.repeat(64)}] });
const indexManifest = JSON.stringify({ schemaVersion: 2,
  manifests: [{platform: {os: 'linux', architecture: 'amd64'}}] });

function check({input = `${chat}\n${feed}\n`, result = 'success', manifest = validManifest} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gafus-registry-check-'));
  try {
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'bin', 'docker'), `#!/bin/sh
if [ "$1" != manifest ] || [ "$2" != inspect ]; then echo INVALID_DOCKER_COMMAND >&2; exit 9; fi
if [ "$(cat "$DOCKER_CONFIG/config.json")" != '{"auths":{}}' ]; then echo AUTH_CONFIG_LEAKED >&2; exit 8; fi
if [ "$FAKE_DOCKER_RESULT" != success ]; then echo "$FAKE_DOCKER_RESULT" >&2; exit 1; fi
printf '%s\\n' "$FAKE_DOCKER_MANIFEST"
`, {mode: 0o755});
    const r = spawnSync('bash', ['ci-cd/scripts/verify-cloudru-manifests.sh'], {
      input, encoding: 'utf8', cwd: process.cwd(), timeout: 12000,
      env: {...process.env, PATH: `${join(root,'bin')}:${process.env.PATH}`,
        FAKE_DOCKER_RESULT: result, FAKE_DOCKER_MANIFEST: manifest,
        DOCKER_CONFIG: '/path/must/not/be/inherited'}
    });
    assert(!r.error, String(r.error));
    return r;
  } finally {rmSync(root, {recursive:true, force:true});}
}

test('checks both immutable images using isolated anonymous registry GET', () => {
  const r = check();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CLOUDRU_IMMUTABLE_MANIFEST_CHECK_PASS: 2/);
  assert.match(r.stdout, /gafus-feed-worker@sha256/);
  assert.match(r.stdout, /gafus-chat-video@sha256/);
});
test('accepts OCI index only when linux amd64 is present', () => {
  assert.equal(check({manifest:indexManifest}).status, 0);
  const r = check({manifest:JSON.stringify({schemaVersion:2, manifests:[{platform:{os:'linux',architecture:'arm64'}}]})});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CLOUDRU_IMMUTABLE_MANIFEST_INVALID/);
});
test('fails closed on real registry authentication failure or missing manifest', () => {
  for (const [result, marker] of [
    ['401 Unauthorized','CLOUDRU_REGISTRY_READ_DENIED'],
    ['403 Forbidden','CLOUDRU_REGISTRY_READ_DENIED'],
    ['404 Not Found','CLOUDRU_IMMUTABLE_MANIFEST_MISSING'],
  ]) {
    const r=check({result});
    assert.notEqual(r.status,0,result);
    assert.match(r.stderr,new RegExp(marker));
  }
});
test('rejects invalid, unpinned and empty plans instead of silently succeeding', () => {
  for (const input of ['', 'KEEP_EXISTING_PINNED_CHAT2_IMAGE\n', 'gafus.cr.cloud.ru/gafus-feed-worker:latest\n']) {
    const r=check({input});
    assert.notEqual(r.status,0,input);
    assert.match(r.stderr, /CLOUDRU_(NO_PINNED_MANIFESTS_TO_VERIFY|INVALID_IMMUTABLE_IMAGE_REFERENCE)/);
  }
});
test('workflow does not supply registry secrets to read-only manifest verification', () => {
  const wf=readFileSync('.github/workflows/production-job-release-reusable.yml','utf8');
  const segment=wf.slice(wf.indexOf('      # The two pinned image repositories'),wf.indexOf('      - name: Reconcile only 4 active video Jobs'));
  assert.match(segment,/verify-cloudru-manifests\.sh/);
  assert.doesNotMatch(segment, /docker\/login-action|buildx imagetools inspect/);
  assert.match(readFileSync('ci-cd/scripts/verify-cloudru-manifests.sh','utf8'), /export DOCKER_CONFIG=/);
});
