import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const prod = read('ci-cd/docker/prometheus/config.alloy');
const candidate = read('ci-cd/docker/prometheus/config.uptrace-canary.alloy');

test('production Alloy stays on original Yandex pipeline', () => {
  assert.match(prod, /prometheus\.remote_write "yc"/);
  assert.doesNotMatch(prod, /prometheus\.remote_write "uptrace"/);
  assert.doesNotMatch(prod, /otelcol\.receiver\.otlp/);
});

test('uptrace candidate preserves Yandex while separating signal routes', () => {
  assert.match(candidate, /prometheus\.remote_write "yc"/);
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

test('only a separate candidate changes, never a live config rename', () => {
  assert.ok(candidate.length > prod.length);
  assert.ok(candidate.includes(prod.slice(0, 100)));
  assert.doesNotMatch(candidate, /authorization\s*=\s*"Bearer [a-zA-Z0-9]{15,}"/);
});
