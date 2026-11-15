import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const prod = read('ci-cd/docker/prometheus/config.alloy');
const candidate = read('ci-cd/docker/prometheus/config.uptrace-canary.alloy');

test('production Alloy exports exclusively filtered Uptrace metrics', () => {
  assert.doesNotMatch(prod, /prometheus\.remote_write "yc"/);
  assert.match(prod, /prometheus\.remote_write "uptrace"/);
  assert.doesNotMatch(prod, /YC_MONITORING_API_KEY/);
  assert.match(prod, /sys\.env\("GAFUS_UPTRACE_INGEST_DSN"\)/);
  assert.match(prod, /action = "labelkeep"/);
  assert.match(prod, /environment = "production", cluster = "gafus"/);
  assert.match(prod, /prometheus\.scrape "worker_telemetry_uptrace"/);
  assert.match(prod, /prometheus\.scrape "redis_exporter_uptrace"/);
  assert.doesNotMatch(prod, /otelcol\.receiver\.otlp/);
  const safeLabels = prod.match(/action = "labelkeep"[\s\S]*?forward_to =/);
  assert.ok(safeLabels);
  assert.doesNotMatch(safeLabels[0], /user_id|device_id|session_id|email|ip_address/);
});

test('uptrace candidate isolates both signals without a legacy metrics sink', () => {
  assert.doesNotMatch(candidate, /prometheus\.remote_write "yc"/);
  assert.match(candidate, /prometheus\.remote_write "uptrace"/);
  assert.match(candidate, /otelcol\.receiver\.otlp "gafus"/);
  assert.match(candidate, /otelcol\.processor\.memory_limiter "gafus"/);
  assert.match(candidate, /otelcol\.processor\.batch "gafus"/);
  assert.match(candidate, /prometheus\.scrape "redis_exporter_uptrace"/);
  assert.match(candidate, /GAFUS_UPTRACE_INGEST_DSN/);
  assert.match(candidate, /sys\.env\("GAFUS_UPTRACE_INGEST_DSN"\)/);
  assert.doesNotMatch(candidate, /https:\/\/[^\s"]+:[^\s"]+@/);
  assert.match(candidate, /NONPROD CANARY ONLY/);
  assert.match(candidate, /action = "labelkeep"/);
  assert.doesNotMatch(candidate.match(/action = "labelkeep"[\s\S]*?forward_to =/)[0],
    /user_id|device_id|session_id|email|ip_address/);

  assert.ok((candidate.match(/prometheus\.relabel\.uptrace_allowlist\.receiver/g) ?? []).length >= 6);
});

test('nonprod candidate remains separate from production without credential literals', () => {
  assert.match(candidate, /NONPROD CANARY ONLY/);
  assert.match(candidate, /environment = "preview", cluster = "gafus-nonprod"/);
  assert.match(prod, /environment = "production", cluster = "gafus"/);
  assert.doesNotMatch(prod, /uptrace-dsn"\s*=\s*"[a-zA-Z0-9]{15,}"/);
  assert.doesNotMatch(candidate, /authorization\s*=\s*"Bearer [a-zA-Z0-9]{15,}"/);
});
