/** Offline read-only runtime-image release check for the extracted package graph.
 * Only loads JSON and resolves on-disk compiled JS/declarations; never imports
 * service modules or connects to DB, Redis, Cloud.ru or any external provider.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// Frozen original nine-package export graph. Preserve its exact 49-export
// minimum; adding new domains must not hide missing legacy entrypoints.
const legacyPackages = [
  '@gafus/core-client',
  '@gafus/achievements-server',
  '@gafus/consent-server',
  '@gafus/mobile-intro-server',
  '@gafus/notifications-server',
  '@gafus/feature-flags-server',
  '@gafus/admin-rewarded-ads-server',
  '@gafus/tracking-server',
  '@gafus/admin-reengagement-server',
];
// The new Chat2 Web/Mobile mode is an intentionally approved addition to the
// original nine-package 49-export baseline. Verify it separately so missing
// old exports cannot be obscured by new ones.
const chat2ClientExport = '@gafus/core-client/chat2/realtime-subscription';
const packages = [...legacyPackages, '@gafus/subscription-read-server'];
const mode = process.argv[2];
if (!['api', 'worker'].includes(mode)) throw Error('RUNTIME_IMAGE_TARGET_REQUIRED');
const main = mode === 'api' ? '/app/dist/index.js' : '/app/dist/worker/src/index.js';
const assertFile = (path, label) => {
  try { if (!statSync(path).isFile()) throw Error('NOT_FILE'); }
  catch { throw Error(`RUNTIME_PACKAGE_MISSING:${label}`); }
};
assertFile(main, `${mode} main entry`);
let exportsChecked = 0;
let legacyExportsChecked = 0;
let chat2ClientExportChecked = false;
for (const name of packages) {
  // pnpm deploy may nest transitives under @gafus/core rather than exposing
  // them at the deployment root. Resolve from the real core consumer.
  const consumer = createRequire(realpathSync('/app/node_modules/@gafus/core/package.json'));
  let entry;
  try { entry = realpathSync(consumer.resolve(name)); }
  catch { throw Error(`RUNTIME_PACKAGE_ENTRY_MISSING:${name}`); }
  let moduleDir = resolve(entry, '..');
  let manifest;
  for (let i = 0; i < 8; i++) {
    try {
      const candidate = JSON.parse(readFileSync(join(moduleDir, 'package.json'), 'utf8'));
      if (candidate.name === name) { manifest = candidate; break; }
    } catch { /* Search above the compiled entry for its manifest. */ }
    const parent = resolve(moduleDir, '..');
    if (parent === moduleDir) break;
    moduleDir = parent;
  }
  if (!manifest) throw Error(`RUNTIME_PACKAGE_MANIFEST_MISSING:${name}`);
  if (manifest.name !== name || !manifest.exports || typeof manifest.exports !== 'object')
    throw Error(`RUNTIME_PACKAGE_MANIFEST_INVALID:${name}`);
  for (const [key, exportPaths] of Object.entries(manifest.exports)) {
    if (key.includes('*') || (key !== '.' && !key.startsWith('./')))
      throw Error(`RUNTIME_PACKAGE_EXPORT_INVALID:${name}`);
    if (typeof exportPaths !== 'object' || typeof exportPaths.types !== 'string' ||
        !exportPaths.types.startsWith('./dist/') || exportPaths.types.includes('..'))
      throw Error(`RUNTIME_PACKAGE_EXPORT_DECLARATION_INVALID:${name}:${key}`);
    const specifier = key === '.' ? name : `${name}/${key.slice(2)}`;
    let jsPath;
    try { jsPath = realpathSync(consumer.resolve(specifier)); }
    catch { throw Error(`RUNTIME_PACKAGE_MISSING:${specifier} compiled JS`); }
    // Resolving an exports map is not sufficient: both targets must exist.
    assertFile(jsPath, `${specifier} compiled JS`);
    assertFile(resolve(moduleDir, exportPaths.types), `${specifier} compiled declarations`);
    exportsChecked++;
    if (specifier === chat2ClientExport) chat2ClientExportChecked = true;
    else if (legacyPackages.includes(name)) legacyExportsChecked++;
  }
  // The deployed package must carry declarations, not just source-side exports.
  const types = manifest.types ?? manifest.typings ?? manifest.exports['.']?.types;
  if (typeof types !== 'string' || types.includes('..'))
    throw Error(`RUNTIME_PACKAGE_TYPES_MISSING:${name}`);
  assertFile(resolve(moduleDir, types), `${name} declaration entry`);
}
if (legacyPackages.length !== 9 || legacyExportsChecked !== 49)
  throw Error(`RUNTIME_LEGACY_PACKAGE_EXPORT_COVERAGE_CHANGED:packages=${legacyPackages.length}:exports=${legacyExportsChecked}`);
if (!chat2ClientExportChecked) throw Error('RUNTIME_CHAT2_CLIENT_EXPORT_MISSING');
// Exactly 49 historical + 1 new Chat2 mode + 1 subscription-read server.
// A missing or extra declared entrypoint still blocks image publication.
if (packages.length !== 10 || exportsChecked !== 51)
  throw Error(`RUNTIME_POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED:packages=${packages.length}:exports=${exportsChecked}`);
console.log(`RUNTIME_PACKAGING_PASS target=${mode} packages=${packages.length} compiled_exports=${exportsChecked}`);
