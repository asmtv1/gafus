import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const yaml=require('yaml');
const root=new URL('../../', import.meta.url);
const read=name=>yaml.parse(readFileSync(new URL(name,root),'utf8'));
const command='pnpm --filter @gafus/types test';
const verify=(file,jobName)=>{
  const steps=read(file).jobs[jobName].steps;
  const step=steps.find(s=>s.name==='Build packages');
  assert.ok(step?.run, 'must explicitly compile packages');
  const lines=step.run.split('\n').map(x=>x.trim());
  assert.equal(lines.filter(x=>x===command).length,1,'exactly one mandatory Types test');
  const build=lines.findIndex(x=>x==='cd packages/types && pnpm build && cd ../..');
  const suite=lines.findIndex(x=>x===command);
  const dependent=lines.findIndex(x=>x==='cd packages/core && pnpm build && cd ../..');
  assert.ok(build>=0 && suite>build && dependent>suite, 'Types tests follow built declaration and precede Core build');
  assert.doesNotMatch(lines[suite],/&|\|\||--if-present|continue-on-error/);
  assert.equal(step['continue-on-error'], undefined);
  assert.equal(step.if, undefined);
  assert.equal(read(file).jobs[jobName]['continue-on-error'], undefined);
  return lines;
};
test('root main CI Types 87-test suite is blocking after its own build, before Core',()=>{
  const lines=verify('.github/workflows/ci-cd.yml','prepare-deps');
  assert.equal(lines.some(s=>/^\(cd packages\/types && pnpm build\) &/.test(s)),false,'do not lose failure in background');
});
test('single-container workflow Types acceptance is mandatory before Core/any image',()=>{
  verify('.github/workflows/build-single-container.yml','prepare-deps');
});
test('independent Vite candidate executes mandatory Types test after workspace dependencies',()=>{
  const steps=read('.github/workflows/refactor-vite-release.yml').jobs.verify.steps;
  const dep=steps.findIndex(s=>s.name==='Build all Vite workspace dependencies, not cached Mac dist');
  const tests=steps.findIndex(s=>s.name==='Run Types public contract and NodeNext regression tests (blocking)');
  const firstApp=steps.findIndex(s=>s.name==='Build production Vite assets');
  assert.ok(dep>=0 && tests>dep && firstApp>tests);
  assert.equal(steps[tests].run,command);
  assert.equal(steps[tests].if,undefined);
  assert.equal(steps[tests]['continue-on-error'],undefined);
});
