#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync, existsSync, mkdirSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { maestroCases, readMaestroJUnit } from '../../tests/support/mobile-run-report.mjs';

const root = resolve(import.meta.dirname, '../..');
const flowDir = join(root, 'tests/e2e/mobile/flows');
const [platform, scenario] = process.argv.slice(2);

function requireCondition(condition, message) {
  if (!condition) throw Error(message);
}

async function main() {
  requireCondition(['android','ios'].includes(platform) && ['ota','training'].includes(scenario), 'Unknown native scenario');
  const input = process.env['GAFUS_MAESTRO_' + platform.toUpperCase() + '_INPUT'];
  const report = process.env.GAFUS_MOBILE_REPORT_PATH;
  requireCondition(input && report?.startsWith(join(root,'.qa/testing')+'/') &&
    report.endsWith('/tests.json'), 'Missing device input manifest or test-system output path');
  const qa = JSON.parse(readFileSync(input,'utf8'));
  const commit = spawnSync('git',['rev-parse','HEAD'],{ cwd:root, encoding:'utf8' }).stdout.trim();
  requireCondition(qa.platform === platform && qa.serverCommit === commit && /^[a-f0-9]{40}$/.test(commit) &&
    /^[\w:-]+$/.test(qa.device || '') && /^\d+\.\d+\.\d+$/.test(qa.version || '') &&
    /^\d+(?:\.\d+)*$/.test(qa.build || '') && qa.runtime === qa.version &&
    /^[a-f0-9]{64}$/.test(qa.binarySha256 || '') && qa.artifact,
    'Invalid or foreign QA-binary input');
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(qa.artifact)) sha.update(chunk);
  requireCondition(sha.digest('hex') === qa.binarySha256, 'QA binary digest differs');
  requireCondition(Number.isSafeInteger(qa.initial?.revision) && qa.initial.revision >= 0 &&
    /^(?:embedded|[a-f0-9-]{36})$/.test(qa.initial.updateId || ''), 'Invalid initial runtime identity');
  if (scenario === 'ota') {
    requireCondition(qa.install?.revision > qa.initial.revision && qa.recovery?.revision > qa.install.revision &&
      [qa.install, qa.recovery].every((phase) => Number.isSafeInteger(phase.revision) &&
        /^[a-f0-9-]{36}$/.test(phase.updateId || '')) && qa.install.updateId !== qa.recovery.updateId,
      'Missing distinct installation and recovery update identities');
  }
  const taskDir = dirname(report);
  const flows = maestroCases(platform,scenario);
  const expectations = [];
  let pg;
  async function assertTrainingRows(expected) {
    const result = await pg.query(
      'SELECT count(*)::int AS total, count(*) FILTER (WHERE s.status = $4)::int AS completed '+
      'FROM "UserStep" s JOIN "UserTraining" t ON t.id = s."userTrainingId" '+
      'WHERE t."userId" = $1 AND t."dayOnCourseId" = $2 AND s."stepOnDayId" = $3',
      [qa.userId,qa.dayOnCourseId,qa.stepOnDayId,'COMPLETED'],
    );
    return result.rows[0].total === expected && result.rows[0].completed === expected;
  }
  async function flow(id, phase) {
    const { path, junitName } = flows.find((entry) => entry.id === id);
    const junit = join(taskDir,id+'.xml');
    const env = { ...process.env };
    const identity = phase && ['qa-runtime',qa.version,qa.build,qa.runtime,phase.revision,phase.updateId,commit].join('/');
    const variables = {
      QA_RUNTIME_ID: identity, QA_USERNAME: process.env.QA_USERNAME, QA_PASSWORD: process.env.QA_PASSWORD,
      QA_TRAINING_LINK: qa.trainingLink, QA_STEP_TITLE: qa.stepTitle,
    };
    delete env.QA_USERNAME;
    delete env.QA_PASSWORD;
    const required = {
      runtime: ['QA_RUNTIME_ID'], installed: ['QA_RUNTIME_ID'], recovery: ['QA_RUNTIME_ID'],
      login: ['QA_USERNAME','QA_PASSWORD'], open: ['QA_TRAINING_LINK','QA_STEP_TITLE'],
      readback: ['QA_TRAINING_LINK','QA_STEP_TITLE'],
    }[id] || [];
    const args = [
      '--platform',platform,'--device',qa.device,'test','--format','junit','--output',junit,
      '--debug-output',join(taskDir,id+'-debug'),
    ];
    for (const key of required) args.push('-e',key+'='+variables[key]);
    console.log('Maestro '+platform+' '+id);
    const child = spawn('maestro',[...args,join(flowDir,path)],{ env, stdio:'ignore' });
    const cancel = () => child.kill('SIGTERM');
    process.once('SIGTERM',cancel);
    process.once('SIGINT',cancel);
    let interrupted = false;
    const mark = () => { interrupted = true; };
    process.once('SIGTERM',mark);
    process.once('SIGINT',mark);
    let code;
    try {
      code = await new Promise((result) => {
        child.once('error', () => result(null));
        child.once('close', result);
      });
    } finally {
      for (const signal of ['SIGTERM','SIGINT']) {
        process.removeListener(signal,cancel);
        process.removeListener(signal,mark);
      }
    }
    requireCondition(!interrupted && existsSync(junit), 'Maestro did not write JUnit for '+id);
    const status = readMaestroJUnit(junit,junitName);
    if (status === 'failed') {
      process.exitCode = 1;
      throw Error('Maestro assertion failed for '+id);
    }
    requireCondition(code === 0 && status === 'passed', 'Incomplete Maestro execution for '+id);
    expectations.push({ id, identity: identity || null });
  }

  const lockDir = join(root,'.qa/testing/mobile-device-locks');
  mkdirSync(lockDir,{recursive:true,mode:0o700});
  const lock = join(lockDir,createHash('sha256').update(platform+':'+qa.device).digest('hex'));
  mkdirSync(lock,{mode:0o700});
  try {
    await flow('runtime',qa.initial);
    requireCondition(/^qa_learner_[a-z0-9]+$/.test(process.env.QA_USERNAME || '') &&
      process.env.QA_PASSWORD, 'Missing synthetic learner credentials');
    await flow('login');
    if (scenario === 'training') {
      const db = new URL(qa.databaseUrl);
      requireCondition(db.protocol === 'postgresql:' && db.hostname === '127.0.0.1' &&
        /^\/gafusqa[a-f0-9]{12}$/.test(db.pathname) && db.username === db.pathname.slice(1).replace(/^gafusqa/,'qa') &&
        Number(db.port) >= 1024 && qa.trainingLink === 'gafus:///trainings/'+qa.courseType+'/'+qa.dayOnCourseId &&
        /^qa-training-[a-f0-9]+$/.test(qa.courseType || '') && /^QA: /.test(qa.stepTitle || ''),
        'Require disposable PostgreSQL and a synthetic training fixture');
      const { Client } = createRequire(join(root,'packages/worker/package.json'))('pg');
      pg = new Client({ connectionString:db.toString(), statement_timeout:5000, connectionTimeoutMillis:5000 });
      await pg.connect();
      requireCondition(await assertTrainingRows(0), 'Synthetic training fixture already has progress');
      await flow('open');
      console.log('Disable network on the selected QA device now');
      await flow('offline');
      requireCondition(await assertTrainingRows(0), 'Offline operation reached PostgreSQL before reconnect');
      console.log('Restore network on the selected QA device now');
      await flow('readback');
      for (let i = 0; i < 30 && !await assertTrainingRows(1); i++) await sleep(1000);
      if (!await assertTrainingRows(1)) { process.exitCode=1; throw Error('Expected one persisted completion'); }
    } else {
      console.log('Activate the mandatory signed update on the isolated QA server now');
      await flow('mandatory');
      await flow('installed',qa.install);
      console.log('Activate the signed recovery update on the isolated QA server now');
      await flow('recovery',qa.recovery);
    }
    writeFileSync(join(taskDir,'native-run.json'),JSON.stringify({
      platform, scenario, commit, version:qa.version, build:qa.build,runtime:qa.runtime,
      binarySha256:qa.binarySha256, phases:expectations,
      runId:process.env.GAFUS_TEST_RUN_ID, fingerprint:process.env.GAFUS_TEST_PLAN_FINGERPRINT,
      ...(scenario === 'training' ? { persistedCompletions:1 } : {}),
    },null,2)+'\n',{flag:'wx',mode:0o600});
    writeFileSync(report,JSON.stringify({ testResults:[{ name:platform+' Maestro',
      assertionResults:flows.map(({name})=>({ title:name,fullName:name,status:'passed' })),
    }] },null,2)+'\n',{flag:'wx',mode:0o600});
  } finally {
    try { if (pg) await pg.end(); }
    finally { rmdirSync(lock); }
  }
}

main().catch((error) => {
  console.error('MAESTRO_'+platform+' '+error.message);
  process.exitCode ||= 2;
});
