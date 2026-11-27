import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const load=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const inventory=load('tests/catalog/inventory.json');
const groups=load('tests/catalog/workspace-advisory-groups.json').groups;
const byName=new Map(inventory.workspaces.map(w=>[w.name,w]));
function command(args,timeout=30000){
 const result=spawnSync(args[0],args.slice(1),{cwd:root,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,String(result.stderr||result.error));
 return result.stdout;
}
test('all 12 owner routes are explicit unit-only, never turbo test scripts',()=>{
 assert.equal(inventory.summary.workspaces,67);
 assert.equal(inventory.summary.withTestScript,55);
 assert.equal(inventory.summary.withAdvisoryUnitScript,12);
 assert.equal(inventory.summary.withAnyTestRoute,67);
 assert.equal(groups.length,12);
 for(const g of groups){
   const w=byName.get(g.name);
   assert(w?.advisoryUnitOnly===true,'not advisory: '+g.name);
   const pkg=load(w.path+'/package.json');
   assert.equal(pkg.scripts.test,undefined,'turbo test gate silently expanded: '+g.name);
   assert.equal(pkg.scripts['test:unit'],
     'node ../../scripts/qa/workspace-gap-advisory.mjs --run --package '+g.name);
 }
});
test('test-system CI plan excludes the new unit-only packages while unit package selection works',()=>{
 const text=command(['node','scripts/qa/test-system.mjs','plan','--profile','ci','--plan-only']);
 const path=/PLAN (\S+\.json) fingerprint=/.exec(text)?.[1];
 assert(path,'CI plan path missing');
 const ci=load(path);
 for(const g of groups)
   assert(!ci.tasks.some(t=>t.id==='workspace.unit.'+g.name),
     'new advisory package accidentally added to CI: '+g.name);
 const unitText=command(['node','scripts/qa/test-system.mjs','plan','--profile','unit',
   '--package','@gafus/queues','--plan-only']);
 const unitPath=/PLAN (\S+\.json) fingerprint=/.exec(unitText)?.[1];
 assert(unitPath,'unit plan missing');
 const unit=load(unitPath);
 assert.equal(unit.tasks.length,1);
 assert.deepEqual(unit.tasks[0].command,['pnpm','--filter','@gafus/queues','test:unit']);
});
test('Turbo dry-run contains only NONEXISTENT placeholders for the 12 advisory package test tasks',()=>{
 const data=JSON.parse(command(['pnpm','exec','turbo','run','test','--dry=json'],60000));
 const names=new Set(groups.map(g=>g.name));
 const found=data.tasks.filter(t=>t.task==='test'&&names.has(t.package));
 assert.equal(found.length,12);
 for(const task of found)assert.equal(task.command,'<NONEXISTENT>',task.taskId);
 const real=data.tasks.filter(t=>t.task==='test'&&t.command!=='<NONEXISTENT>');
 assert.equal(real.length,55,'legacy Turbo task count changed');
});
