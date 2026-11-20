#!/usr/bin/env node
// Repeatable inventory of actual workspaces and non-workspace QA entrypoints.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const ignore = new Set(['node_modules', '.git', 'dist', '.next', '.expo', 'build', 'coverage', '.turbo', '.qa', 'android', 'ios', 'Pods']);
const testRE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
function walk(dir, matches, predicate) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(item.name) || item.name.startsWith('.gafus-')) continue;
    const p = join(dir, item.name);
    if (item.isDirectory()) walk(p, matches, predicate);
    else if (item.isFile() && predicate(p)) matches.push(relative(root, p));
  }
}
const workspaces = [];
const suiteBySource = new Map();
for (const suite of load('tests/catalog/suites.json').checks) {
  for (const item of suite.command || []) {
    if (!testRE.test(item) && !/\.(?:sh|mjs|cjs|py)$/.test(item)) continue;
    const path = relative(root, resolve(root,suite.cwd || '.',item));
    if (!existsSync(join(root,path))) continue;
    suiteBySource.set(path,[...(suiteBySource.get(path) || []),suite.id]);
  }
}
for (const group of ['apps', 'packages']) {
  for (const dir of readdirSync(join(root, group), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const path = group + '/' + dir.name;
    if (!existsSync(join(root, path, 'package.json'))) continue;
    const pkg = load(path + '/package.json');
    const tests = [];
    walk(join(root, path), tests, (p) => testRE.test(p));
    tests.sort();
    const scripts = pkg.scripts || {};
    const dedicated = tests.filter(file => /real.?pg|isolated|permanent.work|private.work/i.test(file));
    const explicit = tests.filter(file => suiteBySource.has(file));

    const consumers = [];
    workspaces.push({
      name: pkg.name, path, owner: pkg.name, scripts: {
        test: scripts.test || null, unitTest: scripts['test:unit'] || null,
        coverage: scripts['test:coverage'] || null
      },
      testFiles: tests.length, tests, consumers,
      testSelection: {
        dedicatedEnvironment: dedicated,
        namedRoutes: Object.fromEntries(explicit.map(file=>[file,suiteBySource.get(file)])),
        remaining: scripts.test ? 'package runner selects from discovered files' :
          scripts['test:unit'] ? 'advisory script selects its declared source contracts' : 'no registered runner',
      },
      route: scripts.test ? 'package-test' :
        scripts['test:unit'] ? 'advisory-unit-script' : 'gap:no-test-script',
      // Advisory package test:unit scripts never enter the existing turbo test gate.
      advisoryUnitOnly: Boolean(scripts['test:unit']?.startsWith(
        'node ../../scripts/qa/workspace-gap-advisory.mjs --run --package ')),
      defaultProfile: scripts.test ? 'unit-legacy' :
        scripts['test:unit'] ? 'unit-advisory' : 'unassigned',
      publicContracts: group === 'packages' ? [] : undefined,
      migration: 'legacy'
    });
  }
}
const byName = new Map(workspaces.map((p) => [p.name, p]));
for (const ws of workspaces) {
  const pkg = load(ws.path + '/package.json');
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  for (const dep of Object.keys(deps)) if (byName.has(dep) && dep !== ws.name) byName.get(dep).consumers.push(ws.name);
}
for (const ws of workspaces) ws.consumers.sort();
workspaces.sort((a, b) => a.name.localeCompare(b.name));
const legacy = [];
for (const [path, kind] of [['scripts/qa', 'qa-shell-browser'], ['scripts', 'repo-checks'], ['docker', 'docker-contracts'], ['ci-cd', 'ci-infrastructure'], ['infra', 'infrastructure'], ['tests', 'python-infra'], ['.github/workflows', 'workflow']]) {
  const files = [];
  walk(join(root, path), files, (p) => {
    const r = relative(root, p);
    if (path === 'scripts' && r.startsWith('scripts/qa/')) return false;
    return path === 'scripts/qa' ? /\.(?:sh|cjs|mjs|py)$/.test(p)
      : path === '.github/workflows' ? /\.ya?ml$/.test(p)
      : path === 'tests' ? /test_.*\.py$/.test(p) || testRE.test(p) || /\/e2e\/mobile\/flows\/.*\.ya?ml$/.test(p)
      : testRE.test(p) || /(?:test|qa|smoke|health|check|verify|acceptance)[^/]*\.(?:sh|py|mjs|cjs)$/.test(p);
  });
  legacy.push({ path, kind, owner: 'qa/infrastructure', files: files.sort(),
    namedRoutes: Object.fromEntries(files.filter(file=>suiteBySource.has(file)).sort()
      .map(file=>[file,suiteBySource.get(file)])),
    route: 'legacy-specialized', migration: 'unreviewed',
    note: 'Preserve existing invocation; register by specific scenario before marking as equivalent' });
}
let commit = 'unknown';
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const result = { schema: 1, baselineCommit: commit,
  generated: 'deterministic-snapshot-no-timestamp',
  summary: { workspaces: workspaces.length, workspaceTestFiles: workspaces.reduce((n, p) => n + p.testFiles, 0), withTestScript: workspaces.filter((w) => w.scripts.test).length,
    withoutTestScript: workspaces.filter((w) => !w.scripts.test).length,
    withAdvisoryUnitScript: workspaces.filter((w) => w.advisoryUnitOnly).length,
    withAnyTestRoute: workspaces.filter((w) => w.scripts.test || w.scripts.unitTest).length,
    legacyFiles: legacy.reduce((n, p) => n + p.files.length, 0) },
  workspaces, legacy };
writeFileSync(join(root, 'tests/catalog/inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary, null, 2));
