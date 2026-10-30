import test from 'node:test';
import assert from 'node:assert/strict';
import { readCurrent, validateNamespace } from './infra032-asset-namespace-check.mjs';
const original = readCurrent();
test('current two compiled panel assets have unique routes and exact nginx aliases', () => {
  assert.deepEqual(validateNamespace(original.entries, original.nginxText), { checked: 2, uniqueUrls: 2 });
});
test('reject future cross-panel URL collision even if compiled bytes match', () => {
  const entries = structuredClone(original.entries);
  entries[1].url = entries[0].url;
  assert.throws(() => validateNamespace(entries, original.nginxText), /CROSS_PANEL_ASSET_COLLISION/);
});
test('reject wrong alias under otherwise valid location', () => {
  const [first] = original.entries;
  const text = original.nginxText.replace(`alias ${first.absolute};`, 'alias /bad/file.js;');
  assert.throws(() => validateNamespace(original.entries, text), /MISSING_EXACT_MAPPING/);
});
test('reject missing unknown-asset fail closed rule', () => {
  const text = original.nginxText.replace('location ^~ /assets/ { return 404; }', '');
  assert.throws(() => validateNamespace(original.entries, text), /MISSING_UNKNOWN_ASSET_DENY/);
});
test('reject aliased asset in wrong exact location', () => {
  const [first, second] = original.entries;
  const text = original.nginxText.replace(`alias ${first.absolute};`, `alias ${second.absolute};`);
  assert.throws(() => validateNamespace(original.entries, text), /MISSING_EXACT_MAPPING|WRONG_ASSET_MAPPING/);
});
