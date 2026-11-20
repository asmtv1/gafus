#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import coverage from 'istanbul-lib-coverage';
import reporter from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { discoverWebTests, generateWebViteGroups } from './web-vite-groups.mjs';
import { coverageVitestArgs } from './coverage-args.mjs';

const root = resolve(import.meta.dirname, '../..');
const targets = [
  'packages/core', 'packages/core-client', 'packages/course-progress-server',
  'apps/api', 'apps/web-vite', 'apps/mobile', 'packages/csrf', 'packages/auth',
  'packages/video-access', 'packages/worker', 'packages/reengagement',
];
const vitestPackage = createRequire(join(root, 'package.json')).resolve('vitest/package.json');
const vitest = join(dirname(vitestPackage), 'vitest.mjs');

function run() {
  const tokens = process.argv.slice(2);
  const selected = tokens.length === 0 ? targets : targets.filter((dir) => {
    const { name } = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    return tokens.length === 2 && tokens[0] === '--package' && name === tokens[1];
  });
  if (!selected.length) throw Error('Usage: pnpm test:coverage [--package <coverage-enabled workspace>]');
  const env = Object.fromEntries(
    ['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','CI','PNPM_HOME'].filter((name)=>process.env[name] !== undefined)
      .map((name)=>[name,process.env[name]]),
  );
  env.NODE_ENV = 'test';
  const output = join(root, '.qa/testing');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const runDir = mkdtempSync(join(output, 'coverage-'));
  console.log('Coverage artifacts: ' + relative(root, runDir));
  const merged = coverage.createCoverageMap({});
  const expected = [];
  const completed = [];
  let code = 0;
  for (const workspace of selected) {
    const cwd = join(root, workspace);
    const isWeb = workspace === 'apps/web-vite';
    const groups = isWeb ? generateWebViteGroups(discoverWebTests(cwd))
      .filter((group) => group.mode === 'vitest') : [{ id: 'unit', files: [] }];
    if (!groups.length) throw Error('No Vitest groups for ' + workspace);
    for (const [index, group] of groups.entries()) {
      const id = workspace + '/' + group.id;
      expected.push(id);
      const reportsDirectory = join(runDir, 'raw', id);
      const args = coverageVitestArgs({
        files: group.files, web: isWeb, index, directory: reportsDirectory,
      });
      const execution = spawnSync(process.execPath, [vitest, ...args], { cwd, env, stdio: 'inherit' });
      const artifact = join(reportsDirectory, 'coverage-final.json');
      if (execution.status !== 0 || !existsSync(artifact)) {
        code = execution.status === 1 ? Math.max(code, 1) : 2;
        continue;
      }
      const data = JSON.parse(readFileSync(artifact, 'utf8'));
      const entries = Object.entries(data);
      if (!entries.length) { code = 2; continue; }
      for (const [path, file] of entries) {
        const source = isAbsolute(path) ? path : resolve(cwd, path);
        const name = relative(root, source);
        if (!selected.some((target) => name.startsWith(target+'/src/'))) continue;
        merged.addFileCoverage({ ...file, path: source });
      }
      completed.push(id);
    }
  }

  const metrics = merged.getCoverageSummary().toJSON();
  if (!metrics.lines.total || !metrics.branches.total || completed.length !== expected.length) code ||= 2;
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ code, expected, completed, metrics }, null, 2) + '\n');
  if (merged.files().length) {
    const context = reporter.createContext({ dir: runDir, coverageMap: merged });
    for (const format of ['json', 'lcovonly', 'html']) reports.create(format).execute(context);
  }
  return code;
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
