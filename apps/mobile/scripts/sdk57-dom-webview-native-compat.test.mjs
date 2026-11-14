/** Prevent the real SDK57 Android startup crash observed on 16 KB emulator:
 * a 55.x DOM WebView module references a Kotlin Expo Modules symbol absent
 * in the 57.x runtime (NoClassDefFoundError: AnyTypeProvider). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project=resolve(mobile,'../..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
test('Expo 57 must explicitly pin native DOM WebView 57 in mobile deps',()=>{
  const pkg=read(resolve(mobile,'package.json'));
  const bundled=read(resolve(mobile,'node_modules/expo/bundledNativeModules.json'));
  assert.match(pkg.dependencies.expo,/^57\./);
  assert.match(pkg.dependencies['@expo/dom-webview']??'',/^~57\.0\.\d+$/);
  assert.equal(pkg.dependencies['@expo/dom-webview'], bundled['@expo/dom-webview']);
});
test('mobile lockfile must resolve DOM WebView to the Expo 57 ABI',()=>{
  const yaml=readFileSync(resolve(project,'pnpm-lock.yaml'),'utf8');
  const start=yaml.indexOf('  apps/mobile:\n');
  const end=yaml.indexOf('\n  apps/',start+1);
  assert(start>=0&&end>start);
  const importer=yaml.slice(start,end);
  assert.match(importer,/\n      '@expo\/dom-webview':\n        specifier: ~57\.0\.\d+\n        version: 57\.0\.\d+/);
  assert.match(importer,/\n      expo:\n        specifier: 57\.0\.\d+/);
  assert.doesNotMatch(importer,/@expo\/dom-webview@55\./);
});
