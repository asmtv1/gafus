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
