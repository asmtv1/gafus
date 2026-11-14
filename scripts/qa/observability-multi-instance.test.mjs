import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseArgs, runLoad } from './observability-multi-instance.mjs';

test('safe read-only target parser rejects external hosts, secrets and writes', () => {
  for (const invalid of [
    'https://prod.gafus.ru/health', 'http://8.8.8.8/health',
    'http://localhost:3001/v1/admin/delete', 'http://localhost:3001/health?token=abc',
    'http://user:secret@localhost:3001/health',
  ]) {
    assert.throws(() => parseArgs(['--target=' + invalid]));
  }
  assert.deepEqual(parseArgs(['--target=http://127.0.0.1:3001/health']).targets,
    ['http://127.0.0.1:3001/health']);
});
test('two real HTTP processes collect errors, per-target stats and burst vs steady', async () => {
  const servers = [];
  try {
    for (const status of [200, 503]) {
      const server = createServer((request, response) => {
        assert.equal(request.method, 'GET');
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ private: 'must-not-be-recorded' }));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      servers.push(server);
    }
    const options = parseArgs([
      ...servers.map(s => '--target=http://127.0.0.1:' + s.address().port + '/health'),
      '--duration=2', '--warmup=1', '--rate=25',
      '--burst=3', '--concurrency=6',
    ]);
    const summary = await runLoad(options, { persist: false });
    assert(summary.runId.startsWith('a2-obs-'));
    assert(summary.measured.successes > 0);
    assert(summary.measured.errors > 0);
    assert.equal(summary.measured.perTarget.length, 2);
    assert(summary.measured.perTarget[0].errors === 0);
    assert(summary.measured.perTarget[1].successes === 0);
    assert(summary.measured.p50Ms >= 0);
    assert(summary.measured.p95Ms >= summary.measured.p50Ms);
    assert(summary.measured.p99Ms >= summary.measured.p95Ms);
    assert(!JSON.stringify(summary).includes('must-not-be-recorded'));
    assert(!JSON.stringify(summary).includes('/health'));
    assert(summary.measured.burst.attempts > 0);
  } finally {
    await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
  }
});

test('baseline vs slow candidate reports p95 regression with raw independent receipts', async () => {
  let latencyMs = 2;
  const server = createServer(async (_, response) => {
    await new Promise(resolve => setTimeout(resolve, latencyMs));
    response.writeHead(200); response.end('ok');
  });
  const root = await mkdtemp(join(tmpdir(), 'a2-obs-comparison-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const target = '--target=http://127.0.0.1:' + server.address().port + '/health';
    const baseDir = join(root, 'baseline');
    const candidateDir = join(root, 'candidate');
    const baseline = await runLoad(parseArgs([target, '--duration=2', '--warmup=0',
      '--rate=40', '--concurrency=8', '--burst=1', '--out=' + baseDir]));
    assert(baseline.measured.p95Ms > 0);
    latencyMs = 120;
    const candidate = await runLoad(parseArgs([target, '--duration=2', '--warmup=0',
      '--rate=40', '--concurrency=8', '--burst=1', '--out=' + candidateDir,
      '--baseline=' + join(baseDir, 'summary.json'), '--regression-threshold=20']));
    assert(candidate.measured.p95Ms > baseline.measured.p95Ms);
    assert.equal(candidate.comparator?.pass, false);
    assert(candidate.comparator.changeP95Percent > 20);
    assert.equal(JSON.parse(await readFile(join(candidateDir, 'summary.json'))).comparator.pass, false);
    assert((await readFile(join(candidateDir, 'samples.jsonl'), 'utf8')).split('\n').length > 5);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
