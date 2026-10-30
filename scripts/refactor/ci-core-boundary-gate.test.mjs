import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {parse} = require('yaml');
const root = new URL('../../', import.meta.url);
const workflow = parse(readFileSync(new URL('.github/workflows/ci-cd.yml',root),'utf8'));
const project = JSON.parse(readFileSync(new URL('package.json',root),'utf8'));

test('CI build-apps runs mandatory uncached pnpm Core boundaries BEFORE all direct turbo and mobile tasks',()=>{
  const job = workflow.jobs?.['build-apps'];
  assert.ok(job, 'build-apps job must exist');
  const steps = job.steps;
  const install = steps.findIndex(x=>x.name==='Install dependencies (optimized)');
  const gateIndices = steps.map((step,i)=>step.run?.trim()==='pnpm check:core-boundaries'?i:-1).filter(i=>i!==-1);
  assert.equal(gateIndices.length,1,'exactly one strict Core boundary step required');
  const gate = gateIndices[0];
  const nextBuild = steps.findIndex(x=>x.name==='Build, test, typecheck apps');
  const mobile = steps.findIndex(x=>x.name==='Mobile typecheck and unit tests (blocking)');
  assert.ok(install>=0 && gate>install && nextBuild>gate && mobile>gate,'gate must run after dependencies and before build + Mobile');
  const step = steps[gate];
  assert.equal(step.if,undefined,'no PR/develop/main bypass or cache condition');
  assert.equal(step['continue-on-error'],undefined,'do not ignore boundary failure');
  assert.equal(step.id,undefined,'no conditional output skip');
  assert.equal(step['working-directory'],undefined,'must use repository root');
  assert.equal(job['continue-on-error'],undefined,'job must fail on gate failure');
  assert.equal(job.if,undefined,'build-apps must run on PR, develop and main');
  assert.doesNotMatch(step.run,/\|\||;|\btrue\b|continue|--if-present|\bexit 0\b/,'fail-closed command');
  assert.equal(steps[nextBuild].run.includes('pnpm turbo run build test typecheck'),true,'verify original root-script bypass stays gated');
  assert.equal(typeof project.scripts['check:core-boundaries'],'string','script must exist at root');
  assert.match(project.scripts['check:core-boundaries'],/check:core-server-boundary/);
  assert.match(project.scripts['check:core-boundaries'],/check:web-core-boundary/);
  assert.match(project.scripts['check:core-boundaries'],/check-types-logger-imports/);
});

test('negative CI fixtures: conditional, nonblocking, cached-after-build or wrong command cannot pass',()=>{
  const original=workflow.jobs['build-apps'].steps;
  const index=original.findIndex(x=>x.run?.trim()==='pnpm check:core-boundaries');
  assert.ok(index>0);
  const valid = (steps) => {
    const gate=steps.filter(x=>x.run?.trim()==='pnpm check:core-boundaries');
    const i=steps.indexOf(gate[0]);
    return gate.length===1 && i>steps.findIndex(x=>x.name==='Install dependencies (optimized)') &&
      i<steps.findIndex(x=>x.name==='Build, test, typecheck apps') &&
      !gate[0].if && !gate[0]['continue-on-error'];
  };
  assert.equal(valid(original),true);
  const mutate=(patch)=>original.map((x,i)=>i===index?{...x,...patch}:x);
  assert.equal(valid(mutate({if:'github.ref == \'refs/heads/main\''})),false);
  assert.equal(valid(mutate({'continue-on-error':true})),false);
  assert.equal(valid([...original.slice(0,index),...original.slice(index+1)]),false);
  const moved=[...original];const [step]=moved.splice(index,1);
  moved.push(step);
  assert.equal(valid(moved),false);
  assert.equal(valid(mutate({run:'pnpm turbo run build test typecheck'})),false);
});
