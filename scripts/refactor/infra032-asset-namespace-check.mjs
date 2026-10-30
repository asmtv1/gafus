import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = '/Users/asmtv1/Desktop/gafus-refactor';
const CONF = path.join(ROOT, 'scripts/refactor/infra032-panel-optin-acceptance.nginx.conf');
const builds = [
  ['trainer', 'scripts/refactor/infra032-vite-acceptance-trainer-20261022'],
  ['admin', 'scripts/refactor/infra032-vite-acceptance-admin-20261022'],
];
function safeFile(relative) {
  const absolute = path.resolve(ROOT, relative);
  if (!absolute.startsWith(ROOT + path.sep)) throw new Error('OUTSIDE_ROOT');
  let current = ROOT;
  for (const component of path.relative(ROOT, absolute).split(path.sep)) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('SYMLINK');
  }
  if (!fs.statSync(absolute).isFile()) throw new Error('NOT_FILE');
  return absolute;
}
export function validateNamespace(entries, nginxText) {
  const seen = new Map();
  for (const entry of entries) {
    if (!/^\/[a-zA-Z0-9_./-]+\.js$/.test(entry.url) || !entry.url.startsWith('/assets/')) throw new Error('BAD_ASSET_URL');
    if (seen.has(entry.url)) throw new Error(`CROSS_PANEL_ASSET_COLLISION:${entry.url}`);
    seen.set(entry.url, entry);
    const exactLocation = `location = ${entry.url} {`;
    const exactAlias = `alias ${entry.absolute};`;
    if (nginxText.split(exactLocation).length !== 2 || nginxText.split(exactAlias).length !== 2) throw new Error(`MISSING_EXACT_MAPPING:${entry.name}`);
    const locationBody = nginxText.split(exactLocation)[1].split('}')[0];
    if (!locationBody.includes(exactAlias)) throw new Error(`WRONG_ASSET_MAPPING:${entry.name}`);
  }
  if (!nginxText.includes('location ^~ /assets/ { return 404; }')) throw new Error('MISSING_UNKNOWN_ASSET_DENY');
  return { checked: entries.length, uniqueUrls: seen.size };
}
export function readCurrent() {
  const entries = builds.map(([name, dir]) => {
    const html = fs.readFileSync(safeFile(`${dir}/index.html`), 'utf8');
    const refs = [...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[^"?#]+\.js)"/g)].map(m => m[1]);
    if (refs.length !== 1) throw new Error(`SCRIPT_COUNT:${name}:${refs.length}`);
    const absolute = safeFile(`${dir}${refs[0]}`);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    return { name, url: refs[0], absolute, sha256 };
  });
  return { entries, nginxText: fs.readFileSync(safeFile('scripts/refactor/infra032-panel-optin-acceptance.nginx.conf'), 'utf8') };
}
if (process.argv[1] === path.join(ROOT, 'scripts/refactor/infra032-asset-namespace-check.mjs')) {
  const { entries, nginxText } = readCurrent();
  console.log(JSON.stringify({ kind: 'INFRA032_SHARED_ASSET_NAMESPACE', ...validateNamespace(entries, nginxText), entries: entries.map(({name, url, sha256}) => ({name, url, sha256})), status: 'SOURCE_PASS_NO_RUNTIME' }));
}
