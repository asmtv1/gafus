import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readViewerToken, makeReadUrl, fetchReadOnlyJson, summariseResponse, ReadFailure,
} from './uptrace-read.mjs';

test('viewer token file must be private, regular and owner-only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gafus-uptrace-test-'));
  try {
    const privateFile = join(dir, 'viewer');
    await writeFile(privateFile, 'test-viewer-token-123456\n', { mode: 0o600 });
    assert.equal(await readViewerToken(privateFile), 'test-viewer-token-123456');
    await chmod(privateFile, 0o644);
    await assert.rejects(readViewerToken(privateFile), e => e instanceof ReadFailure && e.exitCode === 2);
    await chmod(privateFile, 0o600);
    await symlink(privateFile, join(dir, 'link'));
    await assert.rejects(readViewerToken(join(dir, 'link')), /VIEWER_TOKEN_FILE_UNSAFE/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('only pinned Uptrace read endpoints are constructed', () => {
  const url = makeReadUrl('spans', '9378', Date.UTC(2026, 10, 13, 12));
  assert.equal(url.host, 'api.uptrace.dev');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('time_start'), '2026-11-13T11:45:00.000Z');
  assert.throws(() => makeReadUrl('spans', '9378/../../x'), /PROJECT_ID_INVALID/);
  assert.throws(() => makeReadUrl('delete', '9378'), /READ_MODE_INVALID/);
  assert.throws(() => makeReadUrl('spans', '9378', Date.now(), 10081), /WINDOW_INVALID/);
});
test('request retries temporary errors without redirects or exposing secret', async () => {
  let count = 0;
  const waits = [];
  const payload = await fetchReadOnlyJson(makeReadUrl('up', '9378'), 'viewer-test-secret', {
    sleep: ms => { waits.push(ms); return Promise.resolve(); },
    random: () => 0,
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer viewer-test-secret');
      count++;
      return count === 1
        ? { status: 429, headers: { get: () => '1' } }
        : { ok: true, status: 200, json: async () => ({ status: 'success', data: { result: [] } }) };
    },
  });
  assert.equal(count, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(payload.status, 'success');
});
test('401 is not retried and rejects with auth-specific exit code', async () => {
  let calls = 0;
  await assert.rejects(fetchReadOnlyJson(makeReadUrl('up', '9378'), 'abc', {
    fetchImpl: async () => {
      calls++;
      return { status: 401, ok: false };
    },
  }), e => e instanceof ReadFailure && e.exitCode === 2);
  assert.equal(calls, 1);
});
test('safe output never prints raw exception message, payload or URL', () => {
  const result = summariseResponse('spans', {
    spans: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16),
      serviceName: 'gafus-api', message: 'Authorization: Bearer secret; gps=55.5',
      url: 'https://private.example/path?token=secret', user_id: 'p123' }],
  }, '9378');
  const output = JSON.stringify(result);
  assert.match(output, /gafus-api/);
  assert.doesNotMatch(output, /secret|gps|private\.example|user_id/);
  assert.deepEqual(Object.keys(result.samples[0]), ['traceId', 'spanId', 'service']);
  assert.throws(() => summariseResponse('up', { data: {} }, '9378'), /PROMETHEUS_SCHEMA_MISMATCH/);
});
