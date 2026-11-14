import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import YAML from 'yaml';
const load = path => YAML.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const base = load('./docker-compose.prod.yml');
const overlay = load('./docker-compose.observability-logs.yml');
test('optional logging overlay covers exactly every production Compose service', () => {
  assert.deepEqual(Object.keys(overlay.services).sort(), Object.keys(base.services).sort());
});
test('bounded, compressed Docker local driver excludes unlimited JSON logs', () => {
  let bytesBudget = 0;
  for (const [name, service] of Object.entries(overlay.services)) {
    const logging = service.logging;
    assert.equal(logging.driver, 'local', `unbounded logging driver: ${name}`);
    const options = logging.options;
    assert.equal(options.compress, 'true');
    assert.match(options['max-size'], /^[0-9]+m$/);
    assert.match(options['max-file'], /^[0-9]+$/);
    const maxMb = Number.parseInt(options['max-size'], 10);
    const files = Number.parseInt(options['max-file'], 10);
    assert(maxMb >= 1 && maxMb <= 20);
    assert(files >= 2 && files <= 5);
    bytesBudget += maxMb * files;
  }
  assert(bytesBudget <= 500, `too-large uncompressed worst-case budget: ${bytesBudget} MiB`);
  assert.equal(overlay.services.api.logging.options['max-size'], '20m');
  assert.equal(overlay.services.worker.logging.options['max-size'], '20m');
});
test('overlay does not accidentally change production images, environment or network', () => {
  for (const service of Object.values(overlay.services))
    assert.deepEqual(Object.keys(service), ['logging']);
  assert(!('volumes' in overlay) && !('networks' in overlay));
});
