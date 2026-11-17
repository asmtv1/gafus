import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const vendorRoot = resolve(root, 'packages/vendor/picomatch');
const require = createRequire(import.meta.url);
const picomatch = require(vendorRoot);

test('all vulnerable picomatch dependencies resolve to the reviewed local fork', () => {
  const pkg = require(resolve(vendorRoot, 'package.json'));
  const rootPackage = require(resolve(root, 'package.json'));
  const lock = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
  assert.equal(pkg.version, '4.0.8-gafus.1');
  assert.equal(pkg.gafusSecurityPatch.advisory, 'GHSA-fc5q-39xc-vjpf');
  assert.equal(rootPackage.pnpm.overrides.picomatch, 'file:packages/vendor/picomatch');
  assert.match(lock, /^  picomatch: file:packages\/vendor\/picomatch$/m);
  assert.match(lock, /^  picomatch@file:packages\/vendor\/picomatch:/m);
  assert.doesNotMatch(lock, /^  picomatch@\d+\.\d+\.\d+:/m,
    'No unpatched npm picomatch snapshot may remain in the release lockfile');
  assert(!rootPackage.pnpm.auditConfig?.ignoreGhsas?.includes('GHSA-fc5q-39xc-vjpf'),
    'Do not bypass the mandatory security audit');
});

test('standard globs and ordinary repeated extglobs still work', () => {
  assert(picomatch('**/*.ts')('src/deep/component.ts'));
  assert(picomatch('+(cat|dog).ts')('dog.ts'));
  assert(picomatch('@(ios|android)')('ios'));
  assert(picomatch('src/**/file.{ts,tsx}')('src/mobile/file.tsx'));
});

test('single-branch repeated-extglob ReDoS inputs cannot construct a vulnerable regex', () => {
  // Run each probe in an independent process with a hard timeout: a regression
  // to upstream picomatch 4.0.7 must fail rather than hanging this CI job.
  for (const pattern of ['+(*)', '+(*a)', '*(*)', '*(*a)', '+(a*)', '+(*aa)']) {
    for (const options of [{}, {maxExtglobRecursion:false}]) {
    const script = `
      const pm = require(${JSON.stringify(vendorRoot)});
      const re = pm.makeRe(${JSON.stringify(pattern)}, ${JSON.stringify(options)});
      if (re.test('a'.repeat(128) + 'X')) process.exit(3);
      if (re.test('b'.repeat(128) + 'X')) process.exit(4);
    `;
    const probe = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', timeout: 3000,
    });
    assert.equal(probe.error, undefined,
      `dangerous extglob ${pattern} exceeded bounded execution: ${probe.error?.message}`);
    assert.equal(probe.status, 0,
      `dangerous extglob ${pattern} produced unsafe regex: ${probe.stderr}`);
    }
  }
});
