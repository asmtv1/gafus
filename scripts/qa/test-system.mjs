#!/usr/bin/env node
// GAFUS test system: explicit plan -> execution evidence -> fail-closed report.
// Legacy 'pnpm test' and package entrypoints remain unchanged during migration.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { verifyPlaywrightJson } from '../../tests/support/playwright-report-contract.mjs';
import { evaluateRun } from '../../tests/support/report-contract.mjs';
import { readWorktreeFingerprint, sameWorktreeFingerprint } from '../../tests/support/worktree-fingerprint.mjs';
import { verifyWebViteGroupReport } from '../../tests/support/web-vite-group-report.mjs';
import { verifyMobileRun } from '../../tests/support/mobile-run-report.mjs';
import { verifyMobilePreflightEvidence } from '../../tests/support/mobile-preflight-report.mjs';
import { verifyFaultReport } from '../../tests/support/fault-report.mjs';
import { verifyRiskCoverageReceipt, compareHistoricalRiskCoverage } from '../../tests/support/coverage-risk-report.mjs';
import { verifyWorkerRecoveryReport } from '../../tests/support/worker-recovery-report.mjs';
import { verifyApiHttpAcceptance } from '../../tests/support/api-auth-http-report.mjs';
import { verifyBrowserCookieReport } from '../../tests/support/browser-cookie-report.mjs';
import { verifyAccountDeleteWebReport } from '../../tests/support/account-delete-web-report.mjs';
import { verifyAccountCleanupWorkerReport } from '../../tests/support/account-cleanup-worker-report.mjs';
import { discoverLegacyRegression, discoverLegacyFaults } from './legacy-matrix-ledger.mjs';
import { discoverWebTests, generateWebViteGroups, groupFingerprint } from './web-vite-groups.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'tests/catalog/critical.json'), 'utf8'));
const suiteData = JSON.parse(readFileSync(join(ROOT, 'tests/catalog/suites.json'), 'utf8'));
// Accept both the initial catalog and the migration inventory's suite records.
const suites = { checks: suiteData.checks.map((c) => ({
  ...c,
  kind: c.kind || (c.profiles.includes('integration') ? 'integration' :
    c.profiles.includes('e2e-web') ? 'e2e:web' : c.profiles.includes('e2e-mobile') ? 'e2e:mobile' : 'unit'),
  platform: c.platform === 'any' ? 'node' : c.platform === 'web' ? 'chromium' : c.platform,
  part: c.part || c.id.split('.').at(-1),
  scenario: c.scenario || c.id.split('.').slice(0,-1).join('.'),
  command: c.command?.map((v) => v.replaceAll('{result}', '{report}')),
  reportEnv: c.reportEnv || (c.format === 'vitest-console' ? 'VITEST_REPORT_PATH' : undefined),
  status: c.status || (c.format === 'legacy-evidence' ? 'pending-migration' : 'ready'),
  reason: c.reason || (c.format === 'legacy-evidence' ? c.note : null)
})) };
const inventory = JSON.parse(readFileSync(join(ROOT, 'tests/catalog/inventory.json'), 'utf8'));
const profiles = ['legacy', 'unit', 'web-vite', 'native-preflight', 'faults', 'coverage-risk', 'recovery', 'api-acceptance', 'browser-cookie', 'account-delete-web', 'account-cleanup-worker', 'integration', 'e2e:web', 'e2e:mobile', 'ci', 'full'];
const kinds = ['legacy', 'unit', 'faults', 'coverage-risk', 'recovery', 'api-acceptance', 'browser-cookie', 'account-delete-web', 'account-cleanup-worker', 'integration', 'e2e:web', 'e2e:mobile'];
const sha256 = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function git(args, allowFailure = false) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0 && !allowFailure) throw Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.status === 0 ? r.stdout.trim() : null;
}
function args() {
  const [operation = 'plan', ...tokens] = process.argv.slice(2);
  const options = { operation, profile: 'unit', planOnly: false };
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    if (key === '--plan-only') { options.planOnly = true; continue; }
    if (!['--profile', '--base', '--package', '--scenario', '--platform', '--plan', '--run-id', '--task'].includes(key)) {
      throw Error('Unknown argument: ' + key);
    }
    if (!tokens[i + 1] || tokens[i + 1].startsWith('--')) throw Error('Missing value for ' + key);
    options[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = tokens[++i];
  }
  if (options.profile === 'e2e-web') options.profile = 'e2e:web';
  if (options.profile === 'e2e-mobile') options.profile = 'e2e:mobile';
  if (!['plan','run','report','inventory'].includes(operation)) throw Error('Unknown operation: ' + operation);
  if (operation !== 'report' && operation !== 'inventory' && !profiles.includes(options.profile)) {
    throw Error('Unknown profile: ' + options.profile);
  }
  if (options.runId && !/^qa-[a-zA-Z0-9_-]{1,97}$/.test(options.runId)) throw Error('Invalid run ID');
  if (options.package && options.scenario) throw Error('Choose --package or --scenario, not both');
  if (options.platform && !['ios','android'].includes(options.platform)) throw Error('Unknown mobile platform: ' + options.platform);
  return options;
}
const fromKind = (kind) => kind === 'unit' ? 'unit' : kind;
function fullTask(check) {
  let expectedCases = check.expectedCases || [];
  if (check.kind === 'legacy') {
    const script = check.part === 'regression' ? 'architecture-final-regression.sh' : 'architecture-chaos-local.sh';
    const source = readFileSync(join(ROOT,'scripts/qa',script),'utf8');
    expectedCases = check.part === 'regression' ? discoverLegacyRegression(source) :
      discoverLegacyFaults(source).map(({id})=>id);
  }
  return { ...check, expectedCases,
    reproduction: 'pnpm test:' + (check.kind === 'e2e:web' ? 'e2e:web' : check.kind === 'e2e:mobile' ? 'e2e:mobile' : check.kind) +
      ' --scenario ' + check.scenario + (check.kind === 'e2e:mobile' ? ' --platform ' + check.platform : '') };
}
function workspaceTask(workspace) {
  const selectedCommand=workspace.scripts.test ? 'test' :
    workspace.advisoryUnitOnly && workspace.scripts.unitTest ? 'test:unit' : null;
  return {
    id: 'workspace.unit.' + workspace.name, scenario: null, owner: workspace.name, kind: 'unit',
    platform: 'node', part: 'legacy-aggregate', resources: [],
    status: selectedCommand ? 'ready' : 'missing-test-command',
    reason: selectedCommand ? null : 'No test script registered for workspace',
    cwd: '.', command: selectedCommand ? ['pnpm', '--filter', workspace.name, selectedCommand] : null,
    reproduction: 'pnpm test:unit --package ' + workspace.name,
    expectedCases: []
  };
}
function webViteGroupTasks() {
  const manifest=JSON.parse(readFileSync(join(ROOT,'tests/catalog/web-vite-groups.json'),'utf8'));
  const groups=generateWebViteGroups(discoverWebTests(join(ROOT,'apps/web-vite')));
  if(manifest.schema!==1 || manifest.groupFingerprint!==groupFingerprint(groups) ||
     JSON.stringify(manifest.groups)!==JSON.stringify(groups))throw Error('WEB_VITE_GROUP_MANIFEST_DRIFT');
  return groups.map(group=>({
    id:'workspace.unit.@gafus/web-vite.'+group.id,scenario:null,owner:'@gafus/web-vite',
    kind:'unit',platform:'node',part:group.id,status:'ready',cwd:'.',
    resources:['isolated-vitest-process','jsdom'],
    command:['node','scripts/qa/web-vite-regression-group.mjs','run',group.id],
    reportEnv:'VITEST_REPORT_PATH',expectedCases:[],
    expectedFiles:group.files.map(file=>'apps/web-vite/'+file),
    timeoutMs:25*60_000,
    reproduction:'node scripts/qa/web-vite-regression-group.mjs run '+group.id,
  }));
}
function workspaceTasks(workspace) {
  return workspace.name==='@gafus/web-vite' ? webViteGroupTasks() : [workspaceTask(workspace)];
}
function nativePreflightTask() {
  return {
    id:'mobile.maestro.preflight',scenario:null,owner:'@gafus/mobile',kind:'native-preflight',
    platform:'node',part:'all-platforms-device-free',status:'ready',
    completionExpectation:'incomplete until real physical-device, signed QA binary, and OTA revision evidence exists',
    cwd:'.',command:['node','scripts/qa/mobile-e2e-preflight.mjs','--strict'],
    nativePreflight:true,nativeReportEnv:'GAFUS_NATIVE_PREFLIGHT_REPORT',
    resources:['local-java17','maestro-cli-2.12.1','static-flow-yaml'],timeoutMs:120000,
    expectedCases:[],
    reproduction:'pnpm test:mobile:preflight',
  };
}
function comparison(base) {
  if (!base) return { mode:'unfiltered', changed:[], impacted:[] };
  const branchPoint = git(['merge-base', base, 'HEAD'], true);
  if (!branchPoint) return { mode:'fallback-full', reason:'unknown comparison base: ' + base, changed:[], impacted:[] };
  const raw = git(['diff', '--name-only', branchPoint + '...HEAD'], true) || '';
  // Locally include staged, unstaged, and untracked files; CI checkout is clean.
  const working = git(['status', '--porcelain', '--untracked-files=all'], true) || '';
  const changed = [...new Set([...raw.split('\n'), ...working.split('\n').map((s) => s.slice(3))].filter(Boolean))].sort();
  if (changed.every((p) => /\.(?:md|mdx|txt)$/.test(p) && /^(docs\/|README|CHANGELOG)/.test(p))) {
    return { mode:'documentation-only', changed, impacted:[] };
  }
  const global = changed.some((p) => /^(pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|package\.json|tests\/|scripts\/qa\/test-|\.github\/workflows\/)/.test(p) ||
    /(^|\/)(vitest\.config\.|schema\.prisma|migrations\/)/.test(p));
  if (global) return { mode:'full-scope', reason:'shared configuration/schema/test infrastructure', changed, impacted:inventory.workspaces.map((w) => w.name) };
  const impacted = new Set(inventory.workspaces.filter((w) => changed.some((p) => p.startsWith(w.path + '/'))).map((w) => w.name));
  let count;
  do {
    count = impacted.size;
    for (const w of inventory.workspaces) if (impacted.has(w.name)) w.consumers.forEach((c) => impacted.add(c));
  } while (count !== impacted.size);
  const unknown = changed.filter((path) => !/^(docs\/|README|CHANGELOG)/.test(path) &&
    !inventory.workspaces.some((workspace) => path.startsWith(workspace.path + '/')));
  if (unknown.length) return {
    mode:'fallback-full', reason:'unknown executable path: ' + unknown.join(', '),
    changed, impacted:inventory.workspaces.map((w) => w.name) };
  return { mode:'affected', changed, impacted:[...impacted].sort() };
}
function createPlan(options) {
  for (const group of ['apps', 'packages']) {
    for (const entry of readdirSync(join(ROOT, group), {withFileTypes:true})) {
      const pkg = join(ROOT,group,entry.name,'package.json');
      if (!entry.isDirectory() || !existsSync(pkg)) continue;
      const name=JSON.parse(readFileSync(pkg,'utf8')).name;
      if (!inventory.workspaces.some((w)=>w.name===name))
        throw Error('New workspace missing from inventory: '+name+' (run pnpm test:plan after inventory refresh)');
    }
  }
  const cmp = comparison(options.base);
  const affected = new Set(cmp.impacted);
  const scenario = options.scenario && catalog.scenarios.find((s) => s.id === options.scenario);
  if (options.scenario && !scenario) throw Error('Unknown or not-yet-catalogued scenario: ' + options.scenario);
  const workspace = options.package && inventory.workspaces.find((w) => w.name === options.package);
  if (options.package && !workspace) throw Error('Unknown workspace: ' + options.package);
  const directKind = kinds.includes(options.profile);
  const allowed = (check) => {
    // Fault pilots are explicitly opted into, never promoted by ci/full or
    // other profiles before a separate release-gate decision.
    if (check.kind === 'legacy' && options.profile !== 'legacy') return false;
    if (check.kind === 'faults' && options.profile !== 'faults') return false;
    if (check.kind === 'coverage-risk' && options.profile !== 'coverage-risk') return false;
    if (check.kind === 'recovery' && options.profile !== 'recovery') return false;
    if (check.kind === 'api-acceptance' && options.profile !== 'api-acceptance') return false;
    if (check.kind === 'browser-cookie' && options.profile !== 'browser-cookie') return false;
    if (check.kind === 'account-delete-web' && options.profile !== 'account-delete-web') return false;
    if (check.kind === 'account-cleanup-worker' && options.profile !== 'account-cleanup-worker') return false;
    if (options.platform && check.platform !== options.platform) return false;
    if (directKind && fromKind(check.kind) !== options.profile) return false;
    return true;
  };
  let tasks = [];
  if (options.profile === 'web-vite') {
    if (scenario || (workspace && workspace.name!=='@gafus/web-vite'))
      throw Error('web-vite profile only supports the whole web-vite package');
    tasks = webViteGroupTasks();
  } else if (options.profile === 'native-preflight') {
    if(scenario || workspace || options.platform)throw Error('native-preflight checks all flows and requires no scenario/package/platform filters');
    tasks=[nativePreflightTask()];
  } else if (scenario) {
    tasks = suites.checks.filter((c) => scenario.requiredChecks.includes(c.id) && allowed(c)).map(fullTask);
    if (tasks.length === 0) throw Error('No registered checks for scenario ' + scenario.id + ' in profile ' + options.profile);
  } else if (workspace) {
    if (options.profile !== 'unit' && options.profile !== 'ci' && options.profile !== 'full') throw Error('Package filter is unit-only');
    if (workspace.advisoryUnitOnly && options.profile !== 'unit')
      throw Error('Advisory-only workspace test not promoted to ci/full: '+workspace.name);
    tasks = workspaceTasks(workspace);
  } else if (cmp.mode !== 'documentation-only') {
    if (['unit', 'ci', 'full'].includes(options.profile)) {
      const packages = inventory.workspaces.filter((w) =>
        (options.profile === 'unit' || !w.advisoryUnitOnly) &&
        (options.profile !== 'ci' || !options.base || cmp.mode !== 'affected' || affected.has(w.name)));
      tasks.push(...packages.filter((p) => p.scripts.test ||
        (options.profile === 'unit' && p.advisoryUnitOnly && p.scripts.unitTest)).flatMap(workspaceTasks));
    }
    if (options.profile !== 'unit') {
      for (const check of suites.checks) {
        if (!allowed(check)) continue;
        if (options.profile === 'ci') {
          const sc = catalog.scenarios.find((s) => s.id === check.scenario);
          if (!sc || !(sc.workspaces || []).some((w) => affected.has(w)) && options.base && cmp.mode === 'affected') continue;
          if (!options.base && check.kind === 'e2e:mobile') continue;
        }
        if (options.profile === 'legacy' && check.kind !== 'legacy') continue;
        if (options.profile === 'faults' && check.kind !== 'faults') continue;
        if (options.profile === 'coverage-risk' && check.kind !== 'coverage-risk') continue;
        if (options.profile === 'recovery' && check.kind !== 'recovery') continue;
        if (options.profile === 'api-acceptance' && check.kind !== 'api-acceptance') continue;
        if (options.profile === 'browser-cookie' && check.kind !== 'browser-cookie') continue;
        if (options.profile === 'account-delete-web' && check.kind !== 'account-delete-web') continue;
        if (options.profile === 'account-cleanup-worker' && check.kind !== 'account-cleanup-worker') continue;
        if (options.profile === 'integration' && check.kind !== 'integration') continue;
        if (options.profile === 'e2e:web' && check.kind !== 'e2e:web') continue;
        if (options.profile === 'e2e:mobile' && check.kind !== 'e2e:mobile') continue;
        tasks.push(fullTask(check));
      }
    }
  }
  tasks = [...new Map(tasks.map((t) => [[t.id,t.platform,t.part].join('|'), t])).values()].sort((a,b) => a.id.localeCompare(b.id));
  // Fail at plan construction if any required named scenario has an unresolved check ID.
  for (const sc of catalog.scenarios) for (const id of sc.requiredChecks)
    if (!suites.checks.some((c) => c.id === id)) throw Error('Catalog references missing check ' + id);
  const commit = git(['rev-parse','HEAD']);
  const workspaceGaps = options.profile === 'full' && !workspace && !scenario ?
    inventory.workspaces.filter((item)=>!item.scripts.test).map(({name,route})=>({name,route})) : [];
  const sourceState = readWorktreeFingerprint(ROOT);
  const sourceClean = sourceState.changedFiles === 0;
  const core = { schema:1, profile:options.profile, commit, sourceClean, sourceState, base:options.base || null,
    selection:cmp, package:options.package || null, scenario:options.scenario || null,
    platform:options.platform || null, tasks, workspaceGaps, emptyReason:cmp.mode === 'documentation-only' ? 'documentation-only' : null };
  const fingerprint = sha256(core);
  const runId = options.runId || 'qa-' + randomUUID();
  if (!/^[\w-]{4,100}$/.test(runId)) throw Error('Invalid run ID');
  const plan = { ...core, fingerprint, runId };
  const dir = join(ROOT, '.qa/testing', runId);
  mkdirSync(dirname(dir), { recursive:true });
  mkdirSync(dir, { mode:0o700 });
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan,null,2) + '\n', { flag:'wx' });
  return { plan, dir };
}
function parseVitest(file) {
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file,'utf8'));
  return (json.testResults || []).flatMap((suite) =>
    (suite.assertionResults || []).map((item) => ({ name:item.fullName || item.title, fullName:item.fullName,
      status:item.status, file:suite.name })));
}
async function executeOne(task, plan, dir) {
  const taskRoot = join(dir, 'tasks', sha256([task.id,task.platform,task.part]).slice(0,20));
  mkdirSync(taskRoot,{recursive:true});
  const attempt = Math.max(0, ...readdirSync(taskRoot)
    .filter((item) => /^attempt-[1-9][0-9]*$/.test(item))
    .map((item) => Number(item.slice(8)))) + 1;
  const taskDir = join(taskRoot, 'attempt-' + attempt);
  // Atomic allocation prevents concurrent execution from overwriting an attempt.
  mkdirSync(taskDir, { mode:0o700 });
  const reportPath = join(taskDir, 'tests.json');
  const logPath = join(taskDir, 'output.log');
  const receipt = { id:task.id, platform:task.platform, part:task.part, runId:plan.runId,
    commit:plan.commit, fingerprint:plan.fingerprint, attempt,
    status:'blocked', durationMs:0, evidencePath:null, cases:[], reason:null };
  if (!task.command || (task.status && task.status !== 'ready')) {
    receipt.reason = task.reason || task.status || 'unavailable';
  } else {
    const started = Date.now();
    const [program, ...params] = task.command.map((arg) => arg.replaceAll('{report}', reportPath));
    const env = { ...process.env, NODE_ENV:'test', GAFUS_TEST_COMMIT:plan.commit, GAFUS_TEST_RUN_ID:plan.runId,
      GAFUS_TEST_PLAN_FINGERPRINT:plan.fingerprint };
    // Never pass existing production DB/queue/provider credentials into QA subprocesses.
    for (const key of Object.keys(env)) {
      if (/^(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|AWS_|S3_|CLOUDRU_|YOOKASSA_|APPLE_.*SECRET|UPTRACE_.*TOKEN)/.test(key)) delete env[key];
    }
    if (task.reportEnv) env[task.reportEnv] = reportPath;
    const nativePath = task.nativePreflight ? join(taskDir,'native-preflight.json') : null;
    if (nativePath)env[task.nativeReportEnv||'GAFUS_NATIVE_PREFLIGHT_REPORT'] = nativePath;
    try {
      const { createWriteStream } = await import('node:fs');
      const out = createWriteStream(logPath);
      const child = spawn(program, params, {cwd:join(ROOT,task.cwd || '.'),env, stdio:['ignore','pipe','pipe']});
      child.stdout.pipe(out,{end:false});
      child.stderr.pipe(out,{end:false});
      const timeoutMs = Math.min(task.timeoutMs || 15 * 60_000, 60 * 60_000);
      let timedOut = false;
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        child.kill('SIGTERM');
      };
      process.once('SIGINT',cancel);
      process.once('SIGTERM',cancel);
      const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
      const exitCode = await new Promise((resolveCode) => {
        child.on('error', (e) => { receipt.reason = 'failed to start: ' + e.message; resolveCode(2); });
        child.on('close', (code) => resolveCode(timedOut || cancelled ? 2 : code ?? 2));
      });
      clearTimeout(deadline);
      process.removeListener('SIGINT',cancel);
      process.removeListener('SIGTERM',cancel);
      if (cancelled) {
        receipt.reason = 'test cancelled';
        receipt.cancelled = true;
      }
      if (timedOut) receipt.reason = 'test timed out after ' + timeoutMs + ' ms';
      out.end();
      await finished(out);
      receipt.durationMs = Date.now() - started;
      receipt.exitCode = exitCode;
      receipt.evidencePath = relative(ROOT, logPath);
      if (task.kind==='account-cleanup-worker') {
        const evidence=join(taskDir,'worker-fake-storage.json');
        const resources=join(taskDir,'resources.json');
        if(existsSync(evidence))receipt.fakeWorkerEvidencePath=relative(ROOT,evidence);
        if(existsSync(resources))receipt.fakeWorkerResourcePath=relative(ROOT,resources);
      }
      if (task.kind==='account-delete-web') {
        const evidence=join(taskDir,'browser-delete.json');
        const resources=join(taskDir,'resources.json');
        if(existsSync(evidence))receipt.webDeleteEvidencePath=relative(ROOT,evidence);
        if(existsSync(resources))receipt.webDeleteResourcesPath=relative(ROOT,resources);
      }
      if (task.kind==='browser-cookie') {
        const browser=join(taskDir,'browser-cookie.json');
        const resources=join(taskDir,'resources.json');
        if(existsSync(browser))receipt.browserCookieEvidencePath=relative(ROOT,browser);
        if(existsSync(resources))receipt.browserCookieResourcePath=relative(ROOT,resources);
      }
      if (task.kind==='api-acceptance') {
        const evidence=join(taskDir,'api-http.json');
        const resources=join(taskDir,'resources.json');
        if(existsSync(evidence))receipt.apiHttpEvidencePath=relative(ROOT,evidence);
        if(existsSync(resources))receipt.apiResourceEvidencePath=relative(ROOT,resources);
      }
      if (task.kind==='recovery') {
        const recoveryPath=join(taskDir,'recovery.json');
        if(existsSync(recoveryPath))receipt.recoveryEvidencePath=relative(ROOT,recoveryPath);
      }
      if (task.kind==='coverage-risk') {
        const coveragePath=join(taskDir,'coverage-risk.json');
        if(existsSync(coveragePath))receipt.coverageRiskEvidencePath=relative(ROOT,coveragePath);
      }
      if (task.expectedCases?.length || task.expectedFiles?.length) {
        if (existsSync(reportPath)) receipt.caseEvidencePath = relative(ROOT, reportPath);
        try { receipt.cases = parseVitest(reportPath) || []; }
        catch(e) { receipt.reason = 'cannot parse named case report: ' + e.message; }
      }
      receipt.status = exitCode === 0 ? 'passed' : exitCode === 2 ? 'blocked' : 'failed';
      if (task.nativePreflight) {
        // Informational native preflight returns 2 by design until physical QA
        // proof exists; it can never be mapped to a passing OTA test.
        receipt.nativeEvidencePath = nativePath && existsSync(nativePath) ? relative(ROOT,nativePath) : null;
        if (receipt.nativeEvidencePath && exitCode===2) {
          try {
            const verified=verifyMobilePreflightEvidence(JSON.parse(readFileSync(nativePath,'utf8')));
            receipt.status='incomplete';
            receipt.reason='incomplete: '+verified.incompleteReasons.join(', ');
            receipt.nativePreflightToolsReady=verified.toolsReady;
          }catch(error){receipt.status='blocked';receipt.reason='invalid native preflight receipt: '+error.message;}
        }else{
          receipt.reason='native preflight missing receipt or unexpected exit '+exitCode;
          receipt.status=exitCode===1?'failed':'blocked';
        }
      }
      if (exitCode !== 0) receipt.reason ||= 'test process exit code ' + exitCode;
    } catch(e) {
      receipt.status = 'blocked';
      receipt.reason = 'runner failed: ' + e.message;
      receipt.durationMs = Date.now() - started;
    }
  }
  writeFileSync(join(taskDir,'receipt.json'),JSON.stringify(receipt,null,2) + '\n');
  console.log(receipt.status.toUpperCase().padEnd(9) + ' ' + task.id + ' [' + task.platform + '] ' +
    (receipt.reason || '') + ' (' + receipt.durationMs + ' ms)');
  return receipt;
}
function readReceipts(dir) {
  const base = join(dir,'tasks');
  if (!existsSync(base)) return [];
  return readdirSync(base,{withFileTypes:true}).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const taskRoot = join(base,entry.name);
    const attempts = readdirSync(taskRoot).filter((item) => /^attempt-[1-9][0-9]*$/.test(item))
      .sort((a,b) => Number(b.slice(8)) - Number(a.slice(8)));
    const latest = join(taskRoot,attempts[0] || '', 'receipt.json');
    if (!existsSync(latest)) return [];
    const receipt = JSON.parse(readFileSync(latest,'utf8'));
    if (attempts.length && receipt.attempt !== Number(attempts[0].slice(8))) {
      return [{ ...receipt, status:'blocked', reason:'attempt receipt mismatch' }];
    }
    return [{...receipt, artifactDirectory:dirname(latest)}];
  });
}
function report(plan, dir) {
  const receipts = readReceipts(dir);
  const rootDir = resolve(dir);
  for (const r of receipts) {
    for (const target of [r.evidencePath, r.caseEvidencePath, r.nativeEvidencePath, r.coverageRiskEvidencePath, r.recoveryEvidencePath, r.apiHttpEvidencePath, r.apiResourceEvidencePath, r.browserCookieEvidencePath, r.browserCookieResourcePath, r.webDeleteEvidencePath, r.webDeleteResourcesPath, r.fakeWorkerEvidencePath, r.fakeWorkerResourcePath]) {
      if (!target) continue;
      const file = resolve(ROOT, target);
      if (!file.startsWith(rootDir + '/') || !file.startsWith(r.artifactDirectory+'/') || !existsSync(file)) {
        r.status = 'blocked';
        r.reason = 'missing or foreign evidence artifact: ' + target;
      }
    }
    const task = plan.tasks.find((t) => t.id === r.id && t.platform === r.platform && t.part === r.part);
    if (task?.expectedCases?.length) {
      if (!r.caseEvidencePath && r.status === 'passed') {
        r.status = 'blocked';
        r.reason = 'missing named test reporter artifact';
      } else if (r.status === 'passed') {
        // A receipt is never proof on its own: reload the actual structured
        // runner artifact at aggregation time. Stale or altered receipts
        // cannot turn a skipped/failed named case into a passing case.
        try {
          const path = resolve(ROOT, r.caseEvidencePath);
          if (!path.startsWith(rootDir + '/') || !existsSync(path)) throw Error('missing or foreign named result');
          const report = JSON.parse(readFileSync(path, 'utf8'));
          if (!Array.isArray(report.testResults) || report.testResults.length === 0 ||
              report.numFailedTests > 0 || report.success === false) {
            throw Error('invalid, empty or failing Vitest report');
          }
          r.cases = parseVitest(path);
          if (!r.cases.length) throw Error('empty case list');
        } catch (error) {
          r.status = 'blocked';
          r.reason = 'unverifiable named reporter artifact: ' + error.message;
        }
      }
    }
    if (task?.id === 'training.complete.web' && r.status === 'passed') {
      try {
        const taskDir = dirname(resolve(ROOT,r.caseEvidencePath));
        const evidence = JSON.parse(readFileSync(join(taskDir,'training-web.json'),'utf8'));
        const { sql, browser } = evidence;
        if (evidence.commit !== plan.commit || evidence.testRunId !== plan.runId ||
            evidence.fingerprint !== plan.fingerprint || browser.runId !== evidence.project ||
            browser.browserCompletion !== true || browser.freshLoginReadback !== true || browser.post200 !== true ||
            sql.stepCount !== 1 || sql.owner !== true || sql.step !== 'COMPLETED' || sql.course !== 'COMPLETED') {
          throw Error('incomplete or foreign browser/SQL evidence');
        }
        if (evidence.automated === true) {
          verifyPlaywrightJson(JSON.parse(readFileSync(join(taskDir,'playwright-raw.json'),'utf8')),task.expectedCases[0]);
        } else if (process.env.GITHUB_ACTIONS === 'true') {
          throw Error('CI requires Playwright Test evidence');
        }
      } catch (error) {
        r.status = 'blocked';
        r.reason = 'invalid training E2E evidence: ' + error.message;
      }
    }
    if (task?.kind === 'e2e:mobile' && r.status === 'passed') {
      try {
        const expectedDir = join(dir, 'tasks', sha256([task.id,task.platform,task.part]).slice(0,20), 'attempt-' + r.attempt);
        if (!r.caseEvidencePath || resolve(ROOT,r.caseEvidencePath) !== join(expectedDir,'tests.json')) {
          throw Error('foreign native artifact');
        }
        r.nativeRun = verifyMobileRun(expectedDir,task,plan);
      } catch (error) {
        r.status = 'blocked';
        r.reason = 'invalid mobile result: ' + error.message;
      }
    }
    if(task?.kind==='coverage-risk' && r.status==='passed'){
      try{
        if(!r.coverageRiskEvidencePath||r.exitCode!==0)throw Error('missing successful coverage measurement');
        const p=resolve(ROOT,r.coverageRiskEvidencePath);
        if(!p.startsWith(rootDir+'/')||!existsSync(p)||p!==join(dirname(p),'coverage-risk.json'))
          throw Error('missing or foreign coverage receipt');
        const baseline=JSON.parse(readFileSync(join(ROOT,'tests/catalog/coverage-risk-baseline.json'),'utf8'));
        const expected=(Object.values(baseline.targets?.[task.riskDomain]?.groups||{})).flat();
        if(JSON.stringify(task.coverageSources)!==JSON.stringify(expected))throw Error('coverage plan source list differs from baseline');
        r.riskCoverage=verifyRiskCoverageReceipt(ROOT,task.riskDomain,join(dirname(p),'coverage'),p,baseline);
      }catch(error){r.status='blocked';r.reason='invalid source coverage measurement: '+error.message;}
    }
    if(task?.kind==='account-cleanup-worker' && r.status==='passed'){
      try{
        if(r.exitCode!==0||!r.caseEvidencePath||!r.fakeWorkerEvidencePath||!r.fakeWorkerResourcePath)
          throw Error('missing successful test or fake Worker evidence or owned cleanup');
        const test=resolve(ROOT,r.caseEvidencePath),evidence=resolve(ROOT,r.fakeWorkerEvidencePath);
        const cleaned=resolve(ROOT,r.fakeWorkerResourcePath);
        if(!test.startsWith(rootDir+'/')||!evidence.startsWith(rootDir+'/')||
           !cleaned.startsWith(rootDir+'/')||
           evidence!==join(dirname(test),'worker-fake-storage.json')||
           cleaned!==join(dirname(test),'resources.json')||
           !existsSync(test)||!existsSync(evidence)||!existsSync(cleaned))
          throw Error('missing or foreign fake Worker receipts');
        r.fakeWorkerEvidence=verifyAccountCleanupWorkerReport(
          JSON.parse(readFileSync(test,'utf8')),
          JSON.parse(readFileSync(evidence,'utf8')),
          JSON.parse(readFileSync(cleaned,'utf8')),task,ROOT);
      }catch(error){r.status='blocked';r.reason='invalid isolated Worker fake-storage receipts: '+error.message;}
    }
    if(task?.kind==='account-delete-web' && r.status==='passed'){
      try{
        if(r.exitCode!==0||!r.caseEvidencePath||!r.webDeleteEvidencePath||!r.webDeleteResourcesPath)
          throw Error('missing original-Web Chrome HTTP SQL receipt or disposable cleanup');
        const test=resolve(ROOT,r.caseEvidencePath),evidence=resolve(ROOT,r.webDeleteEvidencePath);
        const cleaned=resolve(ROOT,r.webDeleteResourcesPath);
        if(!test.startsWith(rootDir+'/')||!evidence.startsWith(rootDir+'/')||!cleaned.startsWith(rootDir+'/')||
           evidence!==join(dirname(test),'browser-delete.json')||cleaned!==join(dirname(test),'resources.json')||
           !existsSync(test)||!existsSync(evidence)||!existsSync(cleaned))
          throw Error('missing or foreign deletion evidence');
        r.webDeleteEvidence=verifyAccountDeleteWebReport(
          JSON.parse(readFileSync(test,'utf8')),
          JSON.parse(readFileSync(evidence,'utf8')),
          JSON.parse(readFileSync(cleaned,'utf8')),task,ROOT);
      }catch(error){r.status='blocked';r.reason='invalid account-delete Web/browser/HTTP/SQL receipt: '+error.message;}
    }
    if(task?.kind==='browser-cookie' && r.status==='passed'){
      try{
        if(r.exitCode!==0||!r.caseEvidencePath||!r.browserCookieEvidencePath||!r.browserCookieResourcePath)
          throw Error('missing signed browser HTTP/SQL or owned-resource cleanup receipts');
        const test=resolve(ROOT,r.caseEvidencePath),proof=resolve(ROOT,r.browserCookieEvidencePath);
        const clean=resolve(ROOT,r.browserCookieResourcePath);
        if(!test.startsWith(rootDir+'/')||!proof.startsWith(rootDir+'/')||!clean.startsWith(rootDir+'/')||
           proof!==join(dirname(test),'browser-cookie.json')||clean!==join(dirname(test),'resources.json')||
           !existsSync(test)||!existsSync(proof)||!existsSync(clean))
          throw Error('missing or foreign browser acceptance artifacts');
        r.browserCookieEvidence=verifyBrowserCookieReport(
          JSON.parse(readFileSync(test,'utf8')),
          JSON.parse(readFileSync(proof,'utf8')),
          JSON.parse(readFileSync(clean,'utf8')),task,ROOT);
      }catch(error){
        r.status='blocked';
        r.reason='invalid existing-Chrome cookie/SQL evidence: '+error.message;
      }
    }
    if(task?.kind==='api-acceptance' && r.status==='passed'){
      try{
        if(r.exitCode!==0||!r.caseEvidencePath||!r.apiHttpEvidencePath||!r.apiResourceEvidencePath)
          throw Error('missing successful Hono/SQL test process or cleanup receipt');
        const test=resolve(ROOT,r.caseEvidencePath),evidence=resolve(ROOT,r.apiHttpEvidencePath);
        const resources=resolve(ROOT,r.apiResourceEvidencePath);
        if(!test.startsWith(rootDir+'/')||!evidence.startsWith(rootDir+'/')||!resources.startsWith(rootDir+'/')||
           evidence!==join(dirname(test),'api-http.json')||resources!==join(dirname(test),'resources.json')||
           !existsSync(test)||!existsSync(evidence)||!existsSync(resources))
          throw Error('foreign or missing HTTP SQL cleanup files');
        r.apiHttpEvidence=verifyApiHttpAcceptance(JSON.parse(readFileSync(test,'utf8')),
          JSON.parse(readFileSync(evidence,'utf8')),JSON.parse(readFileSync(resources,'utf8')),task,ROOT);
      }catch(error){r.status='blocked';r.reason='invalid local Hono HTTP/SQL acceptance: '+error.message;}
    }
    if(task?.kind==='recovery' && r.status==='passed'){
      try{
        if(r.exitCode!==0||!r.caseEvidencePath||!r.recoveryEvidencePath)
          throw Error('missing real recovery process exit or evidence');
        const testFile=resolve(ROOT,r.caseEvidencePath),metricsFile=resolve(ROOT,r.recoveryEvidencePath);
        if(!testFile.startsWith(rootDir+'/')||!metricsFile.startsWith(rootDir+'/')||
           !existsSync(testFile)||!existsSync(metricsFile)||
           metricsFile!==join(dirname(testFile),'recovery.json'))
          throw Error('foreign recovery evidence or incorrect task directory');
        r.recoveryEvidence=verifyWorkerRecoveryReport(
          JSON.parse(readFileSync(metricsFile,'utf8')),
          JSON.parse(readFileSync(testFile,'utf8')),task,ROOT);
      }catch(error){r.status='blocked';r.reason='invalid isolated real recovery evidence: '+error.message;}
    }
    if(task?.kind==='faults' && r.status==='passed'){
      try{
        if(!r.caseEvidencePath || r.exitCode!==0)throw Error('missing successful fault process and result');
        const path=resolve(ROOT,r.caseEvidencePath);
        if(!path.startsWith(rootDir+'/')||!existsSync(path))throw Error('missing or foreign fault result file');
        r.faultEvidence=verifyFaultReport(JSON.parse(readFileSync(path,'utf8')),task,ROOT);
      }catch(error){r.status='blocked';r.reason='invalid isolated fault evidence: '+error.message;}
    }
    if (task?.expectedFiles?.length) {
      if(!r.caseEvidencePath){
        r.status='blocked';r.reason='missing expected file-level named reporter artifact';
      } else if(r.status==='passed'){
        try {
          const p=resolve(ROOT,r.caseEvidencePath);
          if(!p.startsWith(rootDir+'/')||!existsSync(p))throw Error('missing or foreign shard reporter');
          const raw=JSON.parse(readFileSync(p,'utf8'));
          const checked=verifyWebViteGroupReport(raw,task.expectedFiles,ROOT);
          r.cases=parseVitest(p);
          if(r.cases.length!==checked.caseCount)throw Error('case reporter count mismatch');
          r.validatedFiles=checked.fileCount;
          r.validatedCases=checked.passedCount;
          r.validatedSkipped=checked.skippedCount;
          if(checked.skippedCount)r.reason='existing AG4-gated G05 HTTP cases skipped: '+checked.skippedCount;
        }catch(error){r.status='blocked';r.reason='invalid web-vite shard evidence: '+error.message;}
      }
    }
    if (task?.nativePreflight) {
      try{
        if(!r.nativeEvidencePath || r.exitCode!==2)throw Error('missing native evidence or unexpected process code');
        const path=resolve(ROOT,r.nativeEvidencePath);
        if(!path.startsWith(rootDir+'/')||!existsSync(path))throw Error('missing or foreign native evidence');
        const evidence=verifyMobilePreflightEvidence(JSON.parse(readFileSync(path,'utf8')));
        r.status='incomplete';
        r.reason='incomplete: '+evidence.incompleteReasons.join(', ');
        r.nativePreflight=evidence;
      }catch(error){r.status='blocked';r.reason='invalid or missing native preflight evidence: '+error.message;}
    }
    if (r.status === 'passed' && r.exitCode !== 0) {
      r.status = 'blocked';
      r.reason = 'passing receipt has no successful process exit';
    }
  }
  const result = evaluateRun(plan,receipts,git(['rev-parse','HEAD']));
  const selectedCoverageTasks=plan.tasks.filter(t=>t.kind==='coverage-risk');
  const coverageReceipts=receipts.filter(r=>selectedCoverageTasks.some(t=>t.id===r.id));
  const coverageFiles=coverageReceipts.flatMap(r=>r.riskCoverage?.files||[]).sort((a,b)=>a.path.localeCompare(b.path));
  const coverageTotals={lines:{total:0,covered:0},branches:{total:0,covered:0}};
  const coverageBaselineTotals={lines:{total:0,covered:0},branches:{total:0,covered:0}};
  for(const f of coverageFiles)for(const k of ['lines','branches']){
    coverageTotals[k].total+=f[k].total;coverageTotals[k].covered+=f[k].covered;
    coverageBaselineTotals[k].total+=f.baseline[k].total;
    coverageBaselineTotals[k].covered+=f.baseline[k].covered;
  }
  for(const k of ['lines','branches'])coverageBaselineTotals[k].pct=coverageBaselineTotals[k].total>0?
    Number((100*coverageBaselineTotals[k].covered/coverageBaselineTotals[k].total).toFixed(2)):null;
  for(const k of ['lines','branches'])coverageTotals[k].pct=coverageTotals[k].total>0?
    Number((100*coverageTotals[k].covered/coverageTotals[k].total).toFixed(2)):null;
  const riskNamedCases=selectedCoverageTasks.flatMap(task=>{
    const receipt=coverageReceipts.find(r=>r.id===task.id);
    return (task.expectedCases||[]).map(name=>{
      const matched=(receipt?.cases||[]).filter(c=>c.fullName===name || c.fullName?.endsWith(' '+name));
      return {check:task.id,name,status:matched.length===1?matched[0].status:'incomplete',
        file:matched.length===1?relative(ROOT,matched[0].file):null};
    });
  });
  const comparisonBaselinePath=join(ROOT,'tests/catalog/coverage-risk-baseline-pre-transition-20261119.json');
  let coveragePreviousBaseline=null;
  if(selectedCoverageTasks.length && existsSync(comparisonBaselinePath)){
    try{
      const previous=JSON.parse(readFileSync(comparisonBaselinePath,'utf8'));
      const current=JSON.parse(readFileSync(join(ROOT,'tests/catalog/coverage-risk-baseline.json'),'utf8'));
      coveragePreviousBaseline=compareHistoricalRiskCoverage(coverageFiles,previous,current,
        'tests/catalog/coverage-risk-baseline-pre-transition-20261119.json');
    }catch(e){
      coveragePreviousBaseline={invalid:String(e.message||e)};
    }
  }
  const riskCoverage=selectedCoverageTasks.length?{
    status:'measured-not-gated',advisory:true,
    checksSelected:selectedCoverageTasks.length,
    checksMeasured:coverageReceipts.filter(r=>r.status==='passed'&&r.riskCoverage).length,
    sourceFilesSelected:selectedCoverageTasks.reduce((n,t)=>n+(t.coverageSources?.length||0),0),
    sourceFilesMeasured:coverageFiles.length,
    baselineKind:'local-dirty-worktree-measured-baseline-not-release-threshold',
    totals:coverageTotals,baselineTotals:coverageBaselineTotals,files:coverageFiles,
    namedCases:riskNamedCases,previousBaseline:coveragePreviousBaseline,
    unmeasured:[...new Set(coverageReceipts.flatMap(r=>r.riskCoverage?.unmeasured||[]))].sort(),
  }:null;
  if(riskCoverage && result.code===0 &&
    (riskCoverage.checksSelected!==riskCoverage.checksMeasured ||
     riskCoverage.sourceFilesSelected!==riskCoverage.sourceFilesMeasured ||
     riskCoverage.namedCases.some(c=>c.status!=='passed') ||
     riskCoverage.previousBaseline?.invalid)){
       result.code=2;result.summary='Risk coverage baseline source set incomplete';
  }
  const selectedFakeWorkerTasks=plan.tasks.filter(t=>t.kind==='account-cleanup-worker');
  const fakeWorkerReceipts=receipts.filter(r=>selectedFakeWorkerTasks.some(t=>t.id===r.id));
  const accountCleanupWorker=selectedFakeWorkerTasks.length?{
    advisory:true,status:'isolated-PG18-real-Worker-in-memory-fake-storage-only',
    checksSelected:selectedFakeWorkerTasks.length,
    checksVerified:fakeWorkerReceipts.filter(r=>r.status==='passed'&&r.fakeWorkerEvidence).length,
    namedCases:fakeWorkerReceipts.flatMap(r=>(r.fakeWorkerEvidence?.cases||[]).map(c=>({check:r.id,...c}))),
    sqlSnapshots:fakeWorkerReceipts.reduce((n,r)=>n+(r.fakeWorkerEvidence?.sqlSnapshots||0),0),
    fakeStorageSweeps:fakeWorkerReceipts.reduce((n,r)=>n+(r.fakeWorkerEvidence?.fakeStorageSweeps||0),0),
    fakeCdnSubmissions:fakeWorkerReceipts.reduce((n,r)=>n+(r.fakeWorkerEvidence?.fakeCdnSubmissions||0),0),
    fakeCdnAcknowledgements:fakeWorkerReceipts.reduce((n,r)=>n+(r.fakeWorkerEvidence?.fakeCdnAcknowledgements||0),0),
    idempotent:fakeWorkerReceipts.every(r=>r.fakeWorkerEvidence?.idempotentRepeat===true),
    otherUserPreserved:fakeWorkerReceipts.every(r=>r.fakeWorkerEvidence?.foreignUserPreserved===true),
    resourcesCleaned:fakeWorkerReceipts.every(r=>r.fakeWorkerEvidence?.resourcesCleaned===true),
    queueBackend:'PostgreSQL AccountStorageCleanup, not Redis/BullMQ',
    cloudVerified:false,
    limitations:'Fake in-memory storage and fake CDN only; no external S3/Cloud.ru/Yandex/Beget operations. Real SQL lease/queue state; isolated Redis connectivity but not a BullMQ cleanup consumer.',
  }:null;
  if(result.code===0&&accountCleanupWorker&&(
    accountCleanupWorker.checksVerified!==accountCleanupWorker.checksSelected||
    accountCleanupWorker.namedCases.length!==6||accountCleanupWorker.sqlSnapshots!==6||
    accountCleanupWorker.fakeStorageSweeps!==6||accountCleanupWorker.fakeCdnSubmissions!==3||
    accountCleanupWorker.fakeCdnAcknowledgements!==3||
    !accountCleanupWorker.idempotent||!accountCleanupWorker.otherUserPreserved||
    !accountCleanupWorker.resourcesCleaned||accountCleanupWorker.cloudVerified!==false)){
      result.code=2;result.summary='Fake-storage Worker SQL queue or cleanup evidence incomplete';
  }
  const selectedDeleteTasks=plan.tasks.filter(t=>t.kind==='account-delete-web');
  const deleteReceipts=receipts.filter(r=>selectedDeleteTasks.some(t=>t.id===r.id));
  const accountDeletion=selectedDeleteTasks.length?{
    advisory:true,status:'verified-original-Web-existing-Chrome-local-only',
    checksSelected:selectedDeleteTasks.length,
    checksVerified:deleteReceipts.filter(r=>r.status==='passed'&&r.webDeleteEvidence).length,
    requiredCases:selectedDeleteTasks.reduce((n,t)=>n+t.expectedCases.length,0),
    namedCases:deleteReceipts.flatMap(r=>(r.webDeleteEvidence?.cases||[]).map(c=>({check:r.id,...c}))),
    realHttpRequests:deleteReceipts.reduce((n,r)=>n+(r.webDeleteEvidence?.actualHttpResponses||0),0),
    sqlSnapshots:deleteReceipts.reduce((n,r)=>n+(r.webDeleteEvidence?.sqlSnapshots||0),0),
    ownerAndForeignIsolation:deleteReceipts.length===selectedDeleteTasks.length&&
      deleteReceipts.every(r=>r.webDeleteEvidence?.otherUserUnaffected===true),
    revokedSessionAndRepeatDenied:deleteReceipts.length===selectedDeleteTasks.length&&
      deleteReceipts.every(r=>r.webDeleteEvidence?.revokedSessionAndRepeatDenied===true),
    auditUnchangedAndCountOnce:deleteReceipts.length===selectedDeleteTasks.length&&
      deleteReceipts.every(r=>r.webDeleteEvidence?.auditSingleRowPersistedUnchangedAcrossReplay===true),
    ownServicesCleaned:deleteReceipts.length===selectedDeleteTasks.length&&
      deleteReceipts.every(r=>r.webDeleteEvidence?.resourcesCleaned===true),
    realOriginalWebUI:true,realHonoApi:true,
    mode:'synthetic QA email saved to isolated local file (not SMTP); real Vite UI; original Hono routes + SQL',
    limitations:'No proof of external media physical erasure (durable queued cleanup only); PostgreSQL db push, not full migration chain; audit row hash stable through test, not database UPDATE/DELETE immutable enforcement',
  }:null;
  if(result.code===0&&accountDeletion&&(
    accountDeletion.checksVerified!==accountDeletion.checksSelected||
    accountDeletion.namedCases.length!==accountDeletion.requiredCases||
    accountDeletion.realHttpRequests!==25||accountDeletion.sqlSnapshots!==11||
    accountDeletion.ownerAndForeignIsolation!==true||
    accountDeletion.revokedSessionAndRepeatDenied!==true||
    accountDeletion.auditUnchangedAndCountOnce!==true||
    accountDeletion.ownServicesCleaned!==true)){
    result.code=2;result.summary='Missing real-Web account deletion HTTP/SQL/audit evidence';
  }
  const selectedBrowserTasks=plan.tasks.filter(t=>t.kind==='browser-cookie');
  const browserReceipts=receipts.filter(r=>selectedBrowserTasks.some(t=>t.id===r.id));
  const browserCookie=selectedBrowserTasks.length?{
    advisory:true,status:'isolated-existing-Chrome-evidence-only',
    checksSelected:selectedBrowserTasks.length,
    checksVerified:browserReceipts.filter(r=>r.status==='passed'&&r.browserCookieEvidence).length,
    requiredNamedCases:selectedBrowserTasks.reduce((n,t)=>n+t.expectedCases.length,0),
    namedCases:browserReceipts.flatMap(r=>(r.browserCookieEvidence?.verifiedCases||[]).map(c=>({check:r.id,...c}))),
    realBrowserHttpRequests:browserReceipts.reduce((n,r)=>n+(r.browserCookieEvidence?.realBrowserHttpRequests||0),0),
    sqlSnapshots:browserReceipts.reduce((n,r)=>n+(r.browserCookieEvidence?.sqlSnapshots||0),0),
    browserOrigins:browserReceipts.reduce((n,r)=>n+(r.browserCookieEvidence?.independentBrowserOrigins||0),0),
    syntheticUsers:browserReceipts.reduce((n,r)=>n+(r.browserCookieEvidence?.syntheticUsers||0),0),
    refreshRotations:browserReceipts.reduce((n,r)=>n+(r.browserCookieEvidence?.refreshRotations||0),0),
    sameUserOtherSessionDeniedAfterLogoutAll:browserReceipts.length===selectedBrowserTasks.length&&
      browserReceipts.every(r=>r.browserCookieEvidence?.sameUserOtherSessionDeniedAfterLogoutAll===true),
    otherUserSessionPreserved:browserReceipts.length===selectedBrowserTasks.length&&
      browserReceipts.every(r=>r.browserCookieEvidence?.otherUserSessionPreserved===true),
    ownedResourcesCleaned:browserReceipts.length===selectedBrowserTasks.length&&
      browserReceipts.every(r=>r.browserCookieEvidence?.resourceCleanupVerified===true),
    sourceFingerprintsVerified:browserReceipts.length===selectedBrowserTasks.length&&
      browserReceipts.every(r=>r.browserCookieEvidence?.sourceFingerprintsVerified===true),
    scope:'McpGo Playwright Extension attached to existing personal Chrome; three isolated temporary *.localhost hosts; original Hono, PostgreSQL18, Redis',
    limitations:'synthetic QA accounts; no customer login or production, browser tab removal is separate from server process teardown; Prisma db push only',
  }:null;
  if(result.code===0&&browserCookie&&(
    browserCookie.checksSelected!==browserCookie.checksVerified ||
    browserCookie.namedCases.length!==browserCookie.requiredNamedCases ||
    browserCookie.realBrowserHttpRequests!==29 ||
    browserCookie.sqlSnapshots!==browserCookie.requiredNamedCases ||
    browserCookie.ownedResourcesCleaned!==true||
    browserCookie.sourceFingerprintsVerified!==true||
    browserCookie.sameUserOtherSessionDeniedAfterLogoutAll!==true||
    browserCookie.otherUserSessionPreserved!==true)){
    result.code=2;result.summary='Browser cookie/refresh HTTP SQL acceptance evidence incomplete';
  }
  const selectedApiTasks=plan.tasks.filter(t=>t.kind==='api-acceptance');
  const apiReceipts=receipts.filter(r=>selectedApiTasks.some(t=>t.id===r.id));
  const apiAcceptance=selectedApiTasks.length?{
    status:'measured-isolated-information-only',advisory:true,
    checksSelected:selectedApiTasks.length,
    checksVerified:apiReceipts.filter(r=>r.status==='passed'&&r.apiHttpEvidence).length,
    expectedNamedCases:selectedApiTasks.reduce((n,t)=>n+t.expectedCases.length,0),
    namedCases:apiReceipts.flatMap(r=>(r.apiHttpEvidence?.namedCases||[]).map(c=>({check:r.id,...c}))),
    caseEvidence:apiReceipts.flatMap(r=>(r.apiHttpEvidence?.caseEvidence||[]).map(c=>({check:r.id,...c}))),
    httpRequests:apiReceipts.reduce((n,r)=>n+(r.apiHttpEvidence?.httpRequests||0),0),
    sqlCaseReceipts:apiReceipts.reduce((n,r)=>n+(r.apiHttpEvidence?.sqlCaseReceipts||0),0),
    ownedResourcesCleaned:apiReceipts.length===selectedApiTasks.length&&
      apiReceipts.every(r=>r.apiHttpEvidence?.resourcesCleaned===true),
    origin:'real mounted Hono application over private loopback TCP; PostgreSQL18 + Redis; synthetic users and course',
    limitations:'Prisma db push only, no migration chain or production provider/test account, no full mobile/browser E2E',
  }:null;
  if(result.code===0&&apiAcceptance&&(
    apiAcceptance.checksSelected!==apiAcceptance.checksVerified ||
    apiAcceptance.expectedNamedCases!==apiAcceptance.namedCases.length ||
    apiAcceptance.caseEvidence.length!==apiAcceptance.expectedNamedCases ||
    apiAcceptance.ownedResourcesCleaned!==true)){
    result.code=2;result.summary='Isolated Hono HTTP/SQL acceptance evidence incomplete';
  }
  const selectedRecoveryTasks=plan.tasks.filter(t=>t.kind==='recovery');
  const recoveryReceipts=receipts.filter(r=>selectedRecoveryTasks.some(t=>t.id===r.id));
  const recoveryPilot=selectedRecoveryTasks.length?{
    advisory:true,status:'isolated-qa-only',
    checksSelected:selectedRecoveryTasks.length,
    checksVerified:recoveryReceipts.filter(r=>r.status==='passed'&&r.recoveryEvidence).length,
    namedCases:recoveryReceipts.flatMap(r=>(r.recoveryEvidence?.verifiedCases||[]).map(c=>({check:r.id,...c}))),
    observations:recoveryReceipts.filter(r=>r.recoveryEvidence).map(r=>({
      check:r.id,
      redisStartStopPairs:r.recoveryEvidence.redisStartStopPairs,
      ownedWorkerSigkills:r.recoveryEvidence.ownedWorkerSigkills,
      stalledReclaim:r.recoveryEvidence.stalledReclaim,
      checkpointReused:r.recoveryEvidence.checkpointReused,
      providerSubmitCount:r.recoveryEvidence.providerSubmitCount,
      completedJobs:r.recoveryEvidence.completedJobs,
    })),
    resourcesCleaned:recoveryReceipts.length===selectedRecoveryTasks.length&&
      recoveryReceipts.every(r=>r.recoveryEvidence?.ownedResourcesCleaned===true),
    topology:'real BullMQ Redis AOF QA bridge to production SQL-fenced CDN purge handler; NOT deployed queue routing',
    caveat:'synthetic provider fsync ledger; NOT real Beget HTTP, long-duration connectivity or process group restart',
  }:null;
  if(result.code===0&&recoveryPilot&&(recoveryPilot.checksVerified!==recoveryPilot.checksSelected||
    recoveryPilot.namedCases.length!==selectedRecoveryTasks.reduce((n,t)=>n+t.expectedCases.length,0)||
    recoveryPilot.resourcesCleaned!==true)){
    result.code=2;result.summary='Isolated Worker Redis recovery evidence incomplete';
  }
  const selectedFaultTasks=plan.tasks.filter(t=>t.kind==='faults');
  const faultReceipts=receipts.filter(r=>selectedFaultTasks.some(t=>t.id===r.id));
  const faultPilots=selectedFaultTasks.length?{
    advisory:true,checksSelected:selectedFaultTasks.length,
    checksPassed:faultReceipts.filter(r=>r.status==='passed' && r.faultEvidence).length,
    casesSelected:selectedFaultTasks.reduce((n,t)=>n+t.expectedCases.length,0),
    namedCases:faultReceipts.flatMap(r=>(r.faultEvidence?.namedCases||[]).map(c=>({check:r.id,...c}))),
    assertionsPassed:faultReceipts.reduce((n,r)=>n+(r.faultEvidence?.validatedAssertions||0),0),
    sourceFilesValidated:faultReceipts.reduce((n,r)=>n+(r.faultEvidence?.validatedFiles||0),0),
    providerMode:'synthetic-provider-only',databaseMode:'disposable-loopback-postgres18-db-push',
  }:null;
  if(result.code===0 && faultPilots && (faultPilots.checksPassed!==faultPilots.checksSelected ||
    faultPilots.namedCases.length!==faultPilots.casesSelected)){
    result.code=2;result.summary='Named fault pilot evidence incomplete';
  }
  const selectedNativeTasks=plan.tasks.filter(t=>t.nativePreflight);
  const nativeReceipts=receipts.filter(r=>selectedNativeTasks.some(t=>t.id===r.id && t.part===r.part));
  const nativePreflight=selectedNativeTasks.length ? {
    status:'incomplete',
    toolsReady:nativeReceipts.length===1&&nativeReceipts[0].nativePreflight?.toolsReady===true,
    staticFlowsValidated:nativeReceipts.length===1?nativeReceipts[0].nativePreflight?.staticFlowCount??0:0,
    missingPrerequisites:nativeReceipts.length===1?nativeReceipts[0].nativePreflight?.incompleteReasons??['missing-native-evidence']:['missing-native-receipt'],
    nativeAcceptance:false,
  } : null;
  const selectedWebTasks=plan.tasks.filter(t=>t.owner==='@gafus/web-vite'&&t.expectedFiles?.length);
  const webReceipts=receipts.filter(r=>selectedWebTasks.some(t=>t.id===r.id&&t.platform===r.platform&&t.part===r.part));
  const webVite = selectedWebTasks.length ? {
    groupsSelected:selectedWebTasks.length,
    groupsPassed:webReceipts.filter(r=>r.status==='passed').length,
    expectedFiles:selectedWebTasks.reduce((sum,t)=>sum+t.expectedFiles.length,0),
    validatedFiles:webReceipts.reduce((sum,r)=>sum+(r.validatedFiles||0),0),
    passedCases:webReceipts.reduce((sum,r)=>sum+(r.validatedCases||0),0),
    knownGatedSkips:webReceipts.reduce((sum,r)=>sum+(r.validatedSkipped||0),0),
    groupDurationsMs:webReceipts.map(r=>({id:r.part,ms:r.durationMs})).sort((a,b)=>b.ms-a.ms),
  } : null;
  if(result.code===0&&webVite && (webVite.groupsSelected!==webVite.groupsPassed ||
      webVite.expectedFiles!==webVite.validatedFiles || webVite.passedCases===0)){
    result.code=2;
    result.summary='Web-vite named file/case coverage is incomplete';
  }
  if(riskCoverage && result.code!==0) riskCoverage.status='incomplete';
  if (plan.workspaceGaps?.length) {
    result.code = 2;
    result.summary = 'Workspace routes pending full-profile acceptance';
  }
  const currentSourceState = readWorktreeFingerprint(ROOT);
  const sourceStateVerified = sameWorktreeFingerprint(plan.sourceState, currentSourceState);
  if (!sourceStateVerified) {
    if (result.code === 0) result.code = 2;
    result.summary += '; source tree differs from planned snapshot (no green receipt)';
  }
  const final = { ...result, workspaceGaps:plan.workspaceGaps || [], runId:plan.runId, commit:plan.commit, fingerprint:plan.fingerprint, profile:plan.profile,
    sourceStateVerified, plannedSourceState:plan.sourceState || null, currentSourceState,
    sourceClean:plan.sourceClean === true && currentSourceState.changedFiles === 0,
    expectedTasks:plan.tasks.length, receivedTasks:receipts.length,
    nativeRuns:receipts.filter((receipt)=>receipt.nativeRun).map((receipt)=>receipt.nativeRun),
    ...(webVite?{webVite}:{}),...(nativePreflight?{nativePreflight}:{}),
    ...(faultPilots?{faultPilots}:{}),...(riskCoverage?{riskCoverage}:{}),
    ...(recoveryPilot?{recoveryPilot}:{}),...(apiAcceptance?{apiAcceptance}:{}),
    ...(browserCookie?{browserCookie}:{}),...(accountDeletion?{accountDeletion}:{}),...(accountCleanupWorker?{accountCleanupWorker}:{}) };
  writeFileSync(join(dir,'summary.json'), JSON.stringify(final,null,2) + '\n');
  const lines = ['# GAFUS test report', '', 'Commit: ' + plan.commit, 'Plan: ' + plan.fingerprint,
    'Profile: ' + plan.profile, 'Exit code: ' + result.code,
    'Source checkout fingerprint: ' + (sourceStateVerified ? 'verified' : 'DRIFT / UNVERIFIED'), '',
    '| Check | Platform | Status | Duration | Explanation | Reproduce |',
    '| --- | --- | --- | ---: | --- | --- |'];
  for (const o of result.outcomes) lines.push('| ' + o.id + ' | ' + (o.platform || '-') + ' | ' + o.status +
    ' | ' + (o.durationMs == null ? '-' : o.durationMs + ' ms') + ' | ' + (o.reason || '—').replaceAll('|','/') +
    ' | ' + (o.reproduction || '—').replaceAll('|','/') + ' |');
  if(result.unstableAttempts?.length){
    lines.push('', '## Passed after retry (unstable, not first-attempt green)', '');
    for(const retry of result.unstableAttempts)
      lines.push('- '+retry.id+' succeeded only on attempt '+retry.attempt+'; investigate flakiness');
  }
  if(webVite){
    lines.push('', '## web-vite exhaustive regression', '',
      `Groups ${webVite.groupsPassed}/${webVite.groupsSelected}; files ${webVite.validatedFiles}/${webVite.expectedFiles}; `+
      `passed named cases ${webVite.passedCases}; exact known gated G05 skipped cases ${webVite.knownGatedSkips}.`,
      '', 'Longest named groups:');
    for(const t of webVite.groupDurationsMs.slice(0,8))lines.push(`- ${t.id}: ${t.ms} ms`);
  }
  if(riskCoverage){
    lines.push('', '## Measured risk coverage (advisory; never a release gate)', '',
      `Real SQL + V8 source code coverage: ${riskCoverage.checksMeasured}/${riskCoverage.checksSelected} measured tasks; `+
      `source files ${riskCoverage.sourceFilesMeasured}/${riskCoverage.sourceFilesSelected}.`,
      `Current counted coverage: lines ${riskCoverage.totals.lines.covered}/${riskCoverage.totals.lines.total} `+
      `(${riskCoverage.totals.lines.pct??'unmeasured'}%), branches `+
      `${riskCoverage.totals.branches.covered}/${riskCoverage.totals.branches.total} `+
      `(${riskCoverage.totals.branches.pct??'unmeasured'}%). Never average per-file percentages.`,
      `Baseline (initial dirty-worktree snapshot): lines ${riskCoverage.baselineTotals.lines.covered}/${riskCoverage.baselineTotals.lines.total}, branches `+
      `${riskCoverage.baselineTotals.branches.covered}/${riskCoverage.baselineTotals.branches.total}. This is not a release threshold.`,
      'A source-specific 100% does **not** mean the payment or Worker domain is fully covered.',
      '', '| Real source file | Lines V8 (current) | Branches V8 (current) | Baseline lines | Baseline branches |',
      '| --- | ---: | ---: | ---: | ---: |');
    for(const f of riskCoverage.files)lines.push(`| ${f.path} | ${f.lines.covered}/${f.lines.total} `+
      `| ${f.branches.covered}/${f.branches.total} | ${f.baseline.lines.covered}/${f.baseline.lines.total} `+
      `| ${f.baseline.branches.covered}/${f.baseline.branches.total} |`);
    if(riskCoverage.previousBaseline?.status==='not-comparable'){
      lines.push('', 'Historical comparison unavailable: source or instrumented denominator changed. Current measurements are verified; no before/after improvement is asserted.');
      for(const f of riskCoverage.previousBaseline.changed) lines.push('- '+f.path+': '+f.reasons.join(', '));
    }
    if(riskCoverage.previousBaseline?.totals){
      const prev=riskCoverage.previousBaseline.totals;
      lines.push('', `Compared to immutable pre-transition baseline: lines `+
        `${prev.lines.covered}/${prev.lines.total} (${prev.lines.pct}%) → `+
        `${riskCoverage.totals.lines.covered}/${riskCoverage.totals.lines.total} (${riskCoverage.totals.lines.pct}%), `+
        `branches ${prev.branches.covered}/${prev.branches.total} (${prev.branches.pct}%) → `+
        `${riskCoverage.totals.branches.covered}/${riskCoverage.totals.branches.total} (${riskCoverage.totals.branches.pct}%).`,
        '', '| Source | Added covered lines | Added covered branches |', '| --- | ---: | ---: |');
      for(const f of riskCoverage.previousBaseline.sourceDeltas)lines.push(`| ${f.path} | `+
        `${f.lines.deltaCovered>=0?'+':''}${f.lines.deltaCovered} | `+
        `${f.branches.deltaCovered>=0?'+':''}${f.branches.deltaCovered} |`);
    }
    lines.push('', `## Named risk-coverage assertions (${riskCoverage.namedCases.length})`, '',
      '| Check | Named assertion | Evidence | Status |', '| --- | --- | --- | --- |');
    for(const item of riskCoverage.namedCases)lines.push(`| ${item.check} | `+
      `${item.name.replaceAll('|','/')} | ${item.file||'not recorded'} | ${item.status} |`);
    lines.push('', '**Unmeasured or outside this test scope:**');
    for(const omitted of riskCoverage.unmeasured)lines.push('- '+omitted);
    lines.push('', 'Coverage receipts: V8 Istanbul JSON + LCOV; raw source SHA-256 and `coverage-risk.json` are independently rechecked by `report`.',
      'All provider calls are synthetic; PostgreSQL 18 uses `prisma db push`, not a migration baseline. No acceptance of real provider or Worker restart is implied.');
  }
  if(accountCleanupWorker){
    lines.push('', '## Original Worker account cleanup: SQL queue + fake storage (advisory)', '',
      `Verified ${accountCleanupWorker.checksVerified}/${accountCleanupWorker.checksSelected} checks; `+
      `${accountCleanupWorker.namedCases.length} named cases; SQL snapshots ${accountCleanupWorker.sqlSnapshots}.`,
      `Fake storage sweeps: ${accountCleanupWorker.fakeStorageSweeps}; `+
      `fake CDN submissions: ${accountCleanupWorker.fakeCdnSubmissions}; `+
      `fake acknowledgements: ${accountCleanupWorker.fakeCdnAcknowledgements}.`,
      `Repeat idempotent: ${accountCleanupWorker.idempotent}; other user preserved: `+
      `${accountCleanupWorker.otherUserPreserved}; owned resources cleaned: ${accountCleanupWorker.resourcesCleaned}.`,
      '', '| Named case | Status |','| --- | --- |');
    for(const c of accountCleanupWorker.namedCases)lines.push('| '+c.name+' | '+c.status+' |');
    lines.push('',accountCleanupWorker.queueBackend,'',accountCleanupWorker.limitations);
  }
  if(accountDeletion){
    lines.push('', '## Original Web account deletion through existing Chrome + Hono/SQL (advisory)', '',
      `Verified ${accountDeletion.checksVerified}/${accountDeletion.checksSelected} checks; `+
      `${accountDeletion.namedCases.length}/${accountDeletion.requiredCases} real Chrome cases; `+
      `Hono HTTP observations ${accountDeletion.realHttpRequests}; `+
      `PostgreSQL snapshots ${accountDeletion.sqlSnapshots}; `+
      `owned Vite/Hono/PG18/Redis cleanup ${accountDeletion.ownServicesCleaned}.`,
      '',accountDeletion.mode,'',
      `Stale session/repeat denied: ${accountDeletion.revokedSessionAndRepeatDenied}; `+
      `other user preserved: ${accountDeletion.ownerAndForeignIsolation}; `+
      `single post-deletion audit hash unchanged across replay: ${accountDeletion.auditUnchangedAndCountOnce}.`,
      '', '| Real Web/browser stage | Status |','| --- | --- |');
    for(const item of accountDeletion.namedCases)lines.push('| '+item.name+' | '+item.status+' |');
    lines.push('',accountDeletion.limitations);
  }
  if(browserCookie){
    lines.push('', '## Existing Chrome cookie / refresh / logout-all HTTP + SQL (advisory)', '',
      `Checks verified ${browserCookie.checksVerified}/${browserCookie.checksSelected}; `+
      `named cases ${browserCookie.namedCases.length}/${browserCookie.requiredNamedCases}; `+
      `real browser HTTP requests ${browserCookie.realBrowserHttpRequests}; `+
      `SQL snapshots ${browserCookie.sqlSnapshots}; `+
      `separate browser cookie origins ${browserCookie.browserOrigins}; `+
      `refresh rotations ${browserCookie.refreshRotations}.`, '',
      browserCookie.scope, '',
      `Revoked A session cannot authorize from a different Chrome tab: `+
      `${browserCookie.sameUserOtherSessionDeniedAfterLogoutAll}; `+
      `unrelated B session still authorizes and refreshes: `+
      `${browserCookie.otherUserSessionPreserved}.`,
      `Owned PostgreSQL/Redis/Hono resources removed: ${browserCookie.ownedResourcesCleaned}; `+
      `source SHA-256 evidence intact: ${browserCookie.sourceFingerprintsVerified}.`,
      '',browserCookie.limitations,'',
      '| Browser case | Status |', '| --- | --- |');
    for(const item of browserCookie.namedCases)lines.push('| '+item.name+' | '+item.status+' |');
    lines.push('', 'Verified source artifacts: original Hono app, cookie security middleware, Chrome driver, 13 browser step receipts, 29 HTTP responses, 13 SQL snapshots, session hashes and cleanup; HttpOnly JWT values are not stored.');
  }
  if(apiAcceptance){
    lines.push('', '## Real local authenticated Hono HTTP + PostgreSQL acceptance (advisory)', '',
      `Checks ${apiAcceptance.checksVerified}/${apiAcceptance.checksSelected}; `+
      `required named HTTP/SQL cases ${apiAcceptance.namedCases.length}/${apiAcceptance.expectedNamedCases}; `+
      `verified HTTP requests ${apiAcceptance.httpRequests}; SQL case receipts ${apiAcceptance.sqlCaseReceipts}; `+
      `owned PostgreSQL, Redis and Hono resources cleaned: ${apiAcceptance.ownedResourcesCleaned}.`,
      '',apiAcceptance.origin,'',apiAcceptance.limitations,'',
      '| Case | HTTP statuses | PostgreSQL observations | Status |',
      '| --- | --- | --- | --- |');
    for(const c of apiAcceptance.caseEvidence){
      const statuses=c.http.map(h=>h.method+' '+h.path.split('?')[0]+'='+h.status).join(', ');
      const sql=Object.entries(c.sql).map(([k,v])=>k+'='+v).join(', ');
      lines.push('| '+c.name.replaceAll('|','/')+' | '+statuses+' | '+sql+' | passed |');
    }
    lines.push('', 'This report re-checks the actual named HTTP responses, SQL counters, source hashes and owned-resource cleanup; a synthetic local PASS does not assert production or external-provider acceptance.');
  }
  if(recoveryPilot){
    lines.push('', '## Real isolated Worker + Redis/BullMQ recovery (advisory)', '',
      `Verified checks ${recoveryPilot.checksVerified}/${recoveryPilot.checksSelected}; `+
      `named cases ${recoveryPilot.namedCases.length}; owned child/Redis resources cleaned: `+
      `${recoveryPilot.resourcesCleaned}.`, '',
      ...recoveryPilot.observations.map(x=>`Observed ${x.check}: own Redis start/stop pairs `+
        `${x.redisStartStopPairs}; owned Worker SIGKILL ${x.ownedWorkerSigkills}; `+
        `BullMQ stalled reclaim ${x.stalledReclaim}; persisted SQL checkpoint reused `+
        `${x.checkpointReused}; synthetic provider submits ${x.providerSubmitCount} `+
        `for ${x.completedJobs} completed jobs.`), '',
      recoveryPilot.topology, '',recoveryPilot.caveat,'',
      '| Check | Measured recovery case | Status |','| --- | --- | --- |');
    for(const item of recoveryPilot.namedCases)lines.push('| '+item.check+' | '+
      item.name.replaceAll('|','/')+' | '+item.status+' |');
  }
  if(faultPilots){
    lines.push('', '## Isolated payment + Worker fault pilots (advisory)', '',
      `Checks ${faultPilots.checksPassed}/${faultPilots.checksSelected}; required named cases `+
      `${faultPilots.namedCases.length}/${faultPilots.casesSelected}; `+
      `all passed assertions ${faultPilots.assertionsPassed}; evidence files ${faultPilots.sourceFilesValidated}.`,
      '', 'Provider operations are synthetic only; real PostgreSQL used with db push (not migration proof).', '',
      '| Check | Named assertion | Status |', '| --- | --- | --- |');
    for(const c of faultPilots.namedCases) lines.push('| '+c.check+' | '+c.name.replaceAll('|','/')+' | '+c.status+' |');
  }
  if(nativePreflight){
    lines.push('', '## Native Maestro preflight (informational; no device tests)', '',
      '**Status: incomplete** (not an Android/iOS E2E PASS).', '',
      'CLI and static flows ready: '+nativePreflight.toolsReady+'; validated flows: '+nativePreflight.staticFlowsValidated+'/3.',
      'Missing native QA prerequisites: '+nativePreflight.missingPrerequisites.join(', '), '',
      'No device execution, OTA installation or runtime revision is asserted.');
  }
  if (plan.workspaceGaps?.length) {
    lines.push('', '## Workspace routes pending full-profile acceptance', '',
      ...plan.workspaceGaps.map(({name,route})=>'- '+name+' ('+route+')'));
  }
  writeFileSync(join(dir,'summary.md'), lines.join('\n') + '\n');
  console.log('REPORT ' + result.code + ': ' + result.summary + ' | ' + relative(ROOT, join(dir,'summary.md')));
  return result.code;
}
async function main() {
  const options = args();
  if (options.operation === 'inventory') {
    const r = spawnSync(process.execPath,['scripts/qa/test-inventory.mjs'],{cwd:ROOT,stdio:'inherit'});
    process.exitCode = r.status ?? 2; return;
  }
  let plan, dir;
  if ((options.operation === 'report' || options.operation === 'run' && options.task) && !options.plan && options.runId) {
    options.plan = join('.qa/testing',options.runId,'plan.json');
  }
  if (options.operation === 'report' && !options.plan) {
    throw Error('report requires --run-id or --plan; refusing to invent a new plan');
  }
  if (options.plan) {
    const p = resolve(ROOT, options.plan);
    plan = JSON.parse(readFileSync(p,'utf8'));
    dir = dirname(p);
    const {fingerprint,runId,...core}=plan;
    if (fingerprint !== sha256(core))throw Error('Stored plan fingerprint mismatch');
    if (plan.commit !== git(['rev-parse','HEAD']))throw Error('Stored plan commit differs from checkout');
    if (options.operation === 'run' && !sameWorktreeFingerprint(plan.sourceState, readWorktreeFingerprint(ROOT)))
      throw Error('Stored plan source tree differs from checkout; create a fresh plan');
  } else {
    ({ plan, dir } = createPlan(options));
  }
  if (options.operation === 'plan' || options.planOnly) {
    console.log('PLAN ' + relative(ROOT,join(dir,'plan.json')) + ' fingerprint=' + plan.fingerprint);
    console.log('Selection: ' + plan.selection.mode + ' / ' + plan.tasks.length + ' checks');
    for (const t of plan.tasks) console.log(' - ' + t.id + ' (' + t.platform + '): ' + (t.command ? t.command.join(' ') : 'BLOCKED: ' + t.reason));
    return;
  }
  if (options.operation === 'run') {
    if (options.task && !plan.tasks.some((t)=>t.id===options.task))
      throw Error('Unknown or unplanned task '+options.task);
    for (const task of plan.tasks.filter((t)=>!options.task||t.id===options.task)) {
      const receipt = await executeOne(task,plan,dir);
      if (receipt.cancelled) { process.exitCode = 2; break; }
      if (options.task) process.exitCode = receipt.status === 'passed' ? 0 :
        receipt.status === 'failed' ? 1 : 2;
    }
    if (options.task) return; // Aggregator checks all planned receipts and named cases.
  }
  process.exitCode = report(plan,dir);
}
main().catch((error) => { console.error('TEST_SYSTEM_ERROR: ' + error.message); process.exitCode = 2; });
