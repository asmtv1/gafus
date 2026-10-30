import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {parse}=require('yaml');
const root=new URL('../../',import.meta.url);
const read=(file)=>readFileSync(new URL(file,root),'utf8');
const workflows=['.github/workflows/ci-cd.yml','.github/workflows/build-single-container.yml','.github/workflows/refactor-vite-release.yml'];
const recipes={
  'ci-cd/docker/Dockerfile-api-optimized':'@gafus/api...',
  'ci-cd/docker/Dockerfile-worker-optimized':'@gafus/worker...',
  'ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency':'@gafus/api...',
  'ci-cd/docker/Dockerfile-api':'@gafus/api...',
  'ci-cd/docker/Dockerfile-prisma-optimized':'@gafus/prisma',
  'ci-cd/docker/Dockerfile-bull-board-optimized':'@gafus/bull-board...',
};
function assertProperRecipe(file,filter){
  const src=read(file);
  assert.match(src,new RegExp(`RUN pnpm exec turbo run build --filter='${filter.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  assert.doesNotMatch(src,/\bpnpm (?:run )?build\s+--filter/,`never invoke root gated scripts inside partial Docker context (${file})`);
  if(filter.includes('api...')||filter.includes('worker...')){
    assert.match(src,/RUN pnpm exec turbo run build --filter=/);
    if(file!=='ci-cd/docker/Dockerfile-api'){
      assert.match(src,/COPY ci-cd\/docker\/check-runtime-package-exports\.mjs \/app\/check-runtime-package-exports\.mjs/);
      assert.match(src,new RegExp(`RUN node /app/check-runtime-package-exports\\.mjs (?:api|worker)`));
      const [command]=src.match(/RUN pnpm exec turbo run build[^\n]*/)||[];
      assert.ok(command && command.includes('--filter='));
    }
  }
}
test('every production and QA Dockerfile avoids unsafe root pnpm build --filter, keeps graph',()=>{
  for(const [file,filter] of Object.entries(recipes))assertProperRecipe(file,filter);
  assert.match(read('ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency'),/--concurrency=2/);
});
test('independent CI entrypoints enforce boundary before first workspace build, without skipping/errors',()=>{
  for(const file of workflows){
    const yaml=parse(read(file));
    const job=file.endsWith('refactor-vite-release.yml')?'verify':'prepare-deps';
    const steps=yaml.jobs[job].steps;
    const installs=steps.map((step,i)=>/pnpm install --frozen-lockfile/.test(step.run||'')?i:-1).filter(i=>i>=0);
    assert.ok(installs.length,'locked install required before gate');
    const gate=steps.findIndex(step=>step.run==='pnpm check:core-boundaries');
    assert.ok(gate>Math.max(...installs),`${file}: gate after install`);
    const firstBuild=steps.findIndex(step=>/Build packages|Build all Vite workspace dependencies/.test(step.name||''));
    assert.ok(firstBuild>gate,`${file}: gate before first build`);
    assert.equal(steps[gate].if,undefined);
    assert.equal(steps[gate]['continue-on-error'],undefined);
    assert.equal(yaml.jobs[job]['continue-on-error'],undefined);
  }
  const main=parse(read(workflows[0]));
  const builds=main.jobs['build-apps'].steps;
  const bound=builds.findIndex(x=>x.run==='pnpm check:core-boundaries');
  assert.ok(bound>0 && bound<builds.findIndex(x=>x.name==='Build, test, typecheck apps'));
});
test('CI bare pnpm build --filter cannot bypass the mandatory job gate',()=>{
  for(const file of workflows){
    const src=read(file);
    assert.doesNotMatch(src,/\bpnpm build --filter(=|\s)/);
  }
});
test('runtime image validation keeps frozen 9/49 mandatory and extends to manifest-discovered subscription-read exports',()=>{
  const verify=read('ci-cd/docker/check-runtime-package-exports.mjs');
  for(const name of ['core-client','achievements','consent','mobile-intro','notifications','feature-flags','admin-rewarded-ads','tracking','admin-reengagement','subscription-read-server'])
    assert.match(verify,new RegExp(name));
  assert.match(verify,/legacyPackages\.length !== 9 \|\| legacyExportsChecked !== 49/);
  assert.match(verify,/packages\.length !== 10 \|\| exportsChecked !== 50/);
  assert.match(verify,/if \(legacyPackages\.includes\(name\)\) legacyExportsChecked\+\+/);
  const required = ['core-client','achievements-server','consent-server','mobile-intro-server','notifications-server','feature-flags-server','admin-rewarded-ads-server','tracking-server','admin-reengagement-server','subscription-read-server'];
  const latestExportCount = required.reduce((sum, pkg) =>
    sum + Object.keys(JSON.parse(read(`packages/${pkg}/package.json`)).exports).length, 0);
  const legacyExportCount = required.slice(0,9).reduce((sum,pkg)=>
    sum + Object.keys(JSON.parse(read(`packages/${pkg}/package.json`)).exports).length,0);
  assert.equal(legacyExportCount,49,'frozen legacy exports must not regress');
  assert.ok(latestExportCount>legacyExportCount,'extracted subscription-read package must contribute compiled exports');
  assert.match(verify,/assertFile\(jsPath/);
  assert.match(verify,/assertFile\(resolve\(moduleDir, types\)/);
  assert.match(verify,/createRequire\(realpathSync\('\/app\/node_modules\/@gafus\/core\/package.json'\)\)/);
  assert.doesNotMatch(verify,/await import\(specifier\)|require\(specifier\)/);
  for(const file of ['ci-cd/docker/Dockerfile-api-optimized.dockerignore','ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency.dockerignore','ci-cd/docker/Dockerfile-worker-optimized.dockerignore']){
    const source=read(file);
    assert.match(source,/^\*\*$/m);
    assert.match(source,/!ci-cd\/docker\/check-runtime-package-exports\.mjs/);
    assert.match(source,/\*\*\/\.env/m);
    assert.match(source,/\*\*\/node_modules/);
    assert.match(source,/\*\*\/\*\.test\.\*/);
    assert.match(source,/\*\*\/tests\/\*\*/);
    assert.doesNotMatch(source,/!scripts\/\*\*/);
  }
  assert.doesNotMatch(read('.dockerignore'),/!apps\/web-vite\/dist/, 'root .dockerignore must be unchanged by this packet');
});
// Verify fixture mutation would be rejected; gate must be unconditional.
test('negative fixtures: missing and non-blocking boundary step are rejected',()=>{
  const yaml=parse(read(workflows[0]));
  const steps=yaml.jobs['prepare-deps'].steps;
  const index=steps.findIndex(x=>x.run==='pnpm check:core-boundaries');
  assert.ok(index>0);
  const valid=(list)=>{const i=list.findIndex(x=>x.run==='pnpm check:core-boundaries');return i>0 && !list[i].if && !list[i]['continue-on-error'] && i<list.findIndex(x=>x.name==='Build packages');};
  assert.equal(valid(steps),true);
  assert.equal(valid([...steps.slice(0,index),...steps.slice(index+1)]),false);
  const variant=(p)=>steps.map((s,i)=>i===index?{...s,...p}:s);
  assert.equal(valid(variant({if:'github.ref == "refs/heads/main"'})),false);
  assert.equal(valid(variant({'continue-on-error':true})),false);
});
