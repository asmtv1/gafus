#!/usr/bin/env node
/**
 * Agent 2 repeatable local/staging GET-only API load driver.
 * No destructive routes, production targets or plaintext credentials.
 * Example:
 *   node scripts/qa/observability-multi-instance.mjs \
 *     --target=http://127.0.0.1:4101/health \
 *     --target=http://127.0.0.1:4102/health \
 *     --duration=60 --warmup=15 --rate=30 --concurrency=16 \
 *     --out=./artifacts/a2-obs-baseline
 *
 * Runs remain pending for Redis/PG/Worker/Cloud until those components are
 * actually observed using the scenario runbook. The driver measures HTTP only.
 */
import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const allowedOptions = new Set([
  'target', 'duration', 'warmup', 'rate', 'concurrency', 'burst',
  'timeout', 'out', 'baseline', 'regression-threshold',
]);
const safePath = /^\/[A-Za-z0-9/_:.-]*$/;
export function parseArgs(args) {
  const raw = new Map();
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match || !allowedOptions.has(match[1])) throw Error('Unknown option: ' + arg);
    const list = raw.get(match[1]) ?? [];
    list.push(match[2]);
    raw.set(match[1], list);
  }
  const scalar = (name, fallback) => {
    const values = raw.get(name);
    if (values?.length > 1) throw Error('Duplicate option: ' + name);
    return values?.[0] ?? fallback;
  };
  const int = (name, fallback, low, high) => {
    const result = Number(scalar(name, String(fallback)));
    if (!Number.isSafeInteger(result) || result < low || result > high) {
      throw Error('Invalid ' + name + ', expected ' + low + '..' + high);
    }
    return result;
  };
  const targets = raw.get('target') ?? [];
  if (!targets.length || targets.length > 16) throw Error('Supply 1..16 explicit --target URLs');
  const urls = targets.map((value) => {
    const url = new URL(value);
    // External traffic is intentionally forbidden even when staging is approved.
    // Use an SSH tunnel or local port forward to an isolated staging deployment.
    if (url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || !safePath.test(url.pathname)) {
      throw Error('Only local read-only HTTP targets without queries/credentials are allowed');
    }
    if (!/\/(?:health|healthz|ready|readiness|api\/health|v1\/health)$/.test(url.pathname)) {
      throw Error('Only approved read-only health paths are allowed: ' + url.pathname);
    }
    return url.toString();
  });
  return {
    targets: urls,
    durationSeconds: int('duration', 60, 1, 3600),
    warmupSeconds: int('warmup', 10, 0, 300),
    rate: int('rate', 20, 1, 2000),
    concurrency: int('concurrency', 8, 1, 500),
    burstMultiplier: int('burst', 4, 1, 20),
    timeoutMs: int('timeout', 5000, 100, 60000),
    out: scalar('out', 'artifacts/a2-obs-' + Date.now()),
    baseline: scalar('baseline', ''),
    regressionThreshold: int('regression-threshold', 20, 0, 1000),
  };
}
function quantile(values, q) {
  if (!values.length) return null;
  const pos = (values.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((values[lo] + (values[hi] - values[lo]) * (pos - lo)) * 100) / 100;
}
function stats(samples) {
  const good = samples.filter((s) => s.ok);
  const latencies = good.map((s) => s.durationMs).sort((a, b) => a - b);
  return {
    attempts: samples.length,
    successes: good.length,
    errors: samples.length - good.length,
    errorRate: samples.length ? Number(((samples.length - good.length) / samples.length).toFixed(5)) : null,
    p50Ms: quantile(latencies, 0.5),
    p95Ms: quantile(latencies, 0.95),
    p99Ms: quantile(latencies, 0.99),
    worstMs: latencies.length ? Math.round(latencies.at(-1) * 100) / 100 : null,
  };
}
async function collect({ targets, seconds, rate, concurrency, timeoutMs, burstMultiplier, warmup }) {
  const samples = [];
  const inflight = new Set();
  let rejectedDueToCapacity = 0;
  let sequence = 0;
  const start = performance.now();
  const end = start + seconds * 1000;
  let nextDue = start;
  while (performance.now() < end) {
    const now = performance.now();
    // A one-quarter burst followed by drain makes baseline/candidate comparable.
    const phase = (now - start) / (seconds * 1000);
    const isBurst = !warmup && burstMultiplier > 1 && phase >= 0.25 && phase < 0.5;
    const effectiveRate = rate * (isBurst ? burstMultiplier : 1);
    if (now < nextDue) {
      await new Promise((r) => setTimeout(r, Math.min(40, Math.max(0, nextDue - now))));
      continue;
    }
    nextDue = Math.max(nextDue + 1000 / effectiveRate, now);
    if (inflight.size >= concurrency) {
      rejectedDueToCapacity++;
      continue;
    }
    const target = sequence % targets.length;
    const id = sequence++;
    const stamp = performance.now();
    const promise = (async () => {
      try {
        const response = await fetch(targets[target], {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Accept': 'application/json', 'X-A2-Load-Test': 'synthetic-readonly' },
        });
        // Never store response body/headers or URL: may contain PII.
        samples.push({ seq: id, target, phase: isBurst ? 'burst' : 'steady',
          elapsedMs: Math.round(stamp - start), durationMs: performance.now() - stamp,
          ok: response.status >= 200 && response.status < 400,
          status: response.status });
        await response.body?.cancel();
      } catch (error) {
        samples.push({ seq: id, target, phase: isBurst ? 'burst' : 'steady',
          elapsedMs: Math.round(stamp - start), durationMs: performance.now() - stamp,
          ok: false, status: 0,
          errorClass: error?.name === 'TimeoutError' ? 'timeout' : 'transport' });
      }
    })();
    inflight.add(promise);
    void promise.finally(() => inflight.delete(promise));
  }
  await Promise.allSettled([...inflight]);
  samples.sort((a, b) => a.seq - b.seq);
  return { ...stats(samples), seconds, requestsPerSecond: Number((samples.length / seconds).toFixed(2)),
    rejectedDueToCapacity,
    capacityDropRate: (samples.length + rejectedDueToCapacity) ?
      Number((rejectedDueToCapacity / (samples.length + rejectedDueToCapacity)).toFixed(5)) : 0,
    perTarget: targets.map((_, i) => stats(samples.filter(s => s.target === i))),
    steady: stats(samples.filter(s => s.phase === 'steady')),
    burst: stats(samples.filter(s => s.phase === 'burst')),
    samples };
}
export async function runLoad(config, { persist = true } = {}) {
  const runId = 'a2-obs-' + Date.now();
  const warmed = config.warmupSeconds > 0
    ? await collect({ targets: config.targets, seconds: config.warmupSeconds,
      rate: config.rate, concurrency: config.concurrency, timeoutMs: config.timeoutMs,
      burstMultiplier: 1, warmup: true })
    : null;
  const measured = await collect({ targets: config.targets, seconds: config.durationSeconds,
    rate: config.rate, concurrency: config.concurrency, timeoutMs: config.timeoutMs,
    burstMultiplier: config.burstMultiplier, warmup: false });
  const { samples, ...metrics } = measured;
  const summary = {
    runId, date: new Date().toISOString(), driver: 'a2-obs-get-only-v1',
    environment: 'loopback-only', // A remote port forward does not prove staging topology
    targets: config.targets.map((_, i) => 'loopback-target-' + i),
    params: { durationSeconds: config.durationSeconds, warmupSeconds: config.warmupSeconds,
      rate: config.rate, concurrency: config.concurrency,
      burstMultiplier: config.burstMultiplier, timeoutMs: config.timeoutMs },
    warmup: warmed ? stats(warmed.samples) : null,
    measured: metrics,
    comparator: null,
  };
  if (config.baseline) {
    const baseline = JSON.parse(await readFile(config.baseline, 'utf8'));
    const old = baseline.measured;
    if (!old || old.p95Ms === null || metrics.p95Ms === null) throw Error('Invalid or empty baseline');
    const change = Number(((metrics.p95Ms / Math.max(old.p95Ms, 0.01) - 1) * 100).toFixed(2));
    summary.comparator = { baselineRunId: baseline.runId,
      changeP95Percent: change, p99BaselineMs: old.p99Ms, p99CandidateMs: metrics.p99Ms,
      thresholdPercent: config.regressionThreshold, pass: change <= config.regressionThreshold };
  }
  if (persist) {
    const output = resolve(config.out);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    await writeFile(resolve(output, 'samples.jsonl'), samples.map(s => JSON.stringify(s)).join('\n') + '\n');
  }
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const summary = await runLoad(parseArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    if (!summary.measured.successes || (summary.comparator && !summary.comparator.pass)) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write('A2 load configuration/driver failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
