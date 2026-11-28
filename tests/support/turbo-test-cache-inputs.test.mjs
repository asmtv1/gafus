import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const turbo=JSON.parse(readFileSync(join(root,'turbo.json'),'utf8'));

test('test cache inputs include direct executable Web Vite configuration files',()=>{
  assert(turbo.tasks.test.inputs.includes('vite.config.*'),
    'A directly executed vite.config.test.mjs must invalidate the test cache');
  assert(turbo.tasks.test.inputs.includes('vitest.config.*'));
  assert(turbo.tasks.test.inputs.includes('src/**'));
  assert(turbo.globalDependencies.includes('tests/support/**'),
    'Shared test helpers must invalidate cached results');
  assert(turbo.globalDependencies.includes('tests/catalog/**'),
    'Catalog changes must invalidate cached results');
});

test('actual Turbo dry-run confirms direct Vite config files participate in web-vite test hash',()=>{
  const r=spawnSync('pnpm',['exec','turbo','run','test','--filter=@gafus/web-vite','--dry=json'],
    {cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  assert.equal(r.status,0,String(r.stderr||r.error));
  const plan=JSON.parse(r.stdout);
  const task=plan.tasks?.find(t=>t.taskId==='@gafus/web-vite#test');
  assert(task && task.command!=='<NONEXISTENT>','Actual web-vite test task is missing');
  const inputs=Object.keys(task.inputs||{});
  for(const name of ['vite.config.mjs','vite.config.test.mjs','src/shared/auth/AuthPanel.tsx'])
    assert(inputs.includes(name),'Web test cache missing input: '+name);
  assert.match(task.hash,/^[0-9a-f]{16}$/);
  assert(inputs.length>100,'Test cache denominator unexpectedly tiny');
});

test('actual Turbo build graph includes frontend entry/config, shared scripts and Prisma schema',()=>{
  const packages=['web-vite','admin-panel','trainer-panel','api','prisma'];
  const r=spawnSync('pnpm',['exec','turbo','run','build',
    ...packages.map(name=>'--filter=@gafus/'+name),'--dry=json'],
    {cwd:root,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  assert.equal(r.status,0,String(r.stderr||r.error));
  const tasks=new Map(JSON.parse(r.stdout).tasks.map(t=>[t.taskId,t]));
  const get=(pkg,task='build')=>{
    const t=tasks.get('@gafus/'+pkg+'#'+task);
    assert(t && t.command!=='<NONEXISTENT>',pkg+'#'+task+' missing');
    return t;
  };
  const requireInputs=(t,names)=>{
    for(const name of names) assert(Object.hasOwn(t.inputs,name),t.taskId+' missing input: '+name);
  };
  const shared=['../../scripts/observability/postbuild-vite-maps.mjs',
    '../../scripts/observability/seal-vite-sourcemaps.mjs'];
  requireInputs(get('web-vite'),['index.html','vite.config.mjs',
    '../admin-panel/src/admin-live/App.tsx','../../scripts/refactor/dev-api-config.mjs',...shared]);
  requireInputs(get('admin-panel'),['vite.config.mjs','src/admin-live/index.html',...shared]);
  requireInputs(get('trainer-panel'),['src/trainer-vite/live/vite.config.mjs',
    'src/trainer-vite/live/index.html',...shared]);
  assert.deepEqual(get('trainer-panel').outputs,['src/trainer-vite/live/dist/**']);
  assert(!Object.keys(get('trainer-panel').inputs).some(name=>name.startsWith('src/trainer-vite/live/dist/')),
    'Generated Trainer output must not feed its own build hash');
  requireInputs(get('api'),['tsup.config.ts']);
  requireInputs(get('prisma'),['schema.prisma']);
  requireInputs(get('prisma','prisma:generate'),['schema.prisma']);
  assert(get('prisma').dependencies.includes('@gafus/prisma#prisma:generate'));
  assert(get('api').dependencies.includes('@gafus/prisma#build'));
});
