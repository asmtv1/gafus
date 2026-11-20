#!/usr/bin/env node
// Minimal safe Docker Compose QA lifecycle. Only generated, labeled, local resources.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = resolve(import.meta.dirname, '../..');
const [, , operation, id] = process.argv;
const base = join(ROOT, '.qa/testing');
const valid = (v) => /^qa-[a-zA-Z0-9-]{8,90}$/.test(v);
const run = (args, env = process.env) => {
  const r = spawnSync('docker', args, { cwd: ROOT, encoding:'utf8', env, timeout: 120000 });
  if (r.status !== 0) throw Error('docker ' + args.join(' ') + ': ' + (r.stderr || r.stdout || 'daemon unavailable'));
  return r.stdout.trim();
};
const secret = () => randomBytes(18).toString('hex');
const compose = join(ROOT, 'tests/support/compose.yaml');
function start() {
  const runId = id || 'qa-' + randomUUID();
  if (!valid(runId)) throw Error('Invalid QA run ID');
  const project = 'qa-gafus-' + runId.slice(3).toLowerCase();
  const dir = join(base, runId);
  if (existsSync(join(dir, 'compose.json'))) throw Error('QA run already initialized');
  mkdirSync(dir, { recursive:true, mode:0o700 });
  const vars = { QA_PG_USER:'qa_' + randomBytes(4).toString('hex'),
    QA_PG_PASSWORD: secret(), QA_PG_DB:'qa_' + randomBytes(7).toString('hex'),
    QA_REDIS_PASSWORD: secret(), QA_PG_IMAGE:'postgres:15.15-alpine',
    QA_PG_VOLUME_TARGET:'/var/lib/postgresql/data' };
  const envfile = join(dir, 'compose.env');
  writeFileSync(envfile, Object.entries(vars).map(([k,v])=>k+'='+v).join('\n')+'\n', {mode:0o600});
  chmodSync(envfile,0o600);
  const args = ['compose','--project-name',project,'--file',compose,'--env-file',envfile];
  try {
    run(['info','--format','{{.ServerVersion}}']);
    run([...args, 'up','-d','--wait'], {...process.env,...vars});
    const pgPort = Number(run([...args,'port','postgres','5432']).split(':').at(-1));
    const redisPort = Number(run([...args,'port','redis','6379']).split(':').at(-1));
    if (![pgPort,redisPort].every((x) => Number.isInteger(x) && x > 1024 && x <= 65535)) throw Error('Missing mapped local ports');
    const output = { runId, project, pgPort, redisPort, engine:'postgresql15+redis7', state:'running' };
    writeFileSync(join(dir,'compose.json'), JSON.stringify(output,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(output));
  } catch(e) {
    try { run([...args,'down','--volumes','--remove-orphans'],{...process.env,...vars}); } catch {}
    // No credentials or empty temporary staging directories after a failed setup.
    try { rmSync(dir, { recursive:true, force:true }); } catch {}
    throw e;
  }
}
function stop() {
  if (!id || !valid(id)) throw Error('down needs exact QA run ID');
  const dir=join(base,id);
  const receipt=join(dir,'compose.json');
  const envfile=join(dir,'compose.env');
  if (!existsSync(receipt) || !existsSync(envfile)) throw Error('No registered local QA stack');
  const data=JSON.parse(readFileSync(receipt,'utf8'));
  const expected='qa-gafus-'+id.slice(3).toLowerCase();
  if (data.project!==expected) throw Error('Refusing to remove foreign Docker project');
  const vars=Object.fromEntries(readFileSync(envfile,'utf8').trim().split('\n').map(s=>s.split('=')));
  run(['compose','--project-name',expected,'--file',compose,'--env-file',envfile,
    'down','--volumes','--remove-orphans'],{...process.env,QA_PG_IMAGE:'postgres:15.15-alpine',
    QA_PG_VOLUME_TARGET:'/var/lib/postgresql/data',...vars});
  data.state='stopped';
  writeFileSync(receipt,JSON.stringify(data,null,2)+'\n',{mode:0o600});
  console.log('Removed local QA stack '+id);
}
try {
  if (operation==='up') start();
  else if (operation==='down') stop();
  else throw Error('Usage: node scripts/qa/test-env.mjs up [qa-uuid] | down qa-uuid');
} catch(e) { console.error('QA_ENV_ERROR: '+e.message); process.exitCode=2; }
