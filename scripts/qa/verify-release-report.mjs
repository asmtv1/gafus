#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, commit, platform, build, runtime, revision, updateId] = process.argv.slice(2);
const requireCondition = (condition, message) => { if (!condition) throw Error(message); };
try {
  requireCondition(dir && /^[a-f0-9]{40}$/.test(commit), 'Report directory and release SHA are required');
  const plan = JSON.parse(readFileSync(join(dir,'plan.json'),'utf8'));
  const summary = JSON.parse(readFileSync(join(dir,'summary.json'),'utf8'));
  const { fingerprint, runId, ...core } = plan;
  const digest = createHash('sha256').update(JSON.stringify(core)).digest('hex');
  requireCondition(plan.commit === commit && summary.commit === commit &&
    fingerprint === digest && summary.fingerprint === digest && summary.runId === runId,
  'Report belongs to a different source or plan');
  requireCondition(plan.profile === 'full' && summary.profile === 'full' &&
    plan.sourceClean === true && summary.sourceClean === true && plan.selection.mode === 'unfiltered' && !plan.base && !plan.package && !plan.platform && !plan.scenario &&
    plan.tasks.length > 0 && plan.workspaceGaps?.length === 0 &&
    summary.workspaceGaps?.length === 0 && summary.code === 0 &&
    plan.tasks.length === summary.expectedTasks && plan.tasks.length === summary.receivedTasks &&
    plan.tasks.length === summary.outcomes.length,
  'Full report incomplete or failed');
  const key = ({ id, platform, part }) => JSON.stringify([id,platform,part]);
  const outcomes = new Map(summary.outcomes.map((row) => [key(row),row]));
  const tasks = new Set(plan.tasks.map(key));
  requireCondition(tasks.size === plan.tasks.length && outcomes.size === tasks.size &&
    [...tasks].every((id)=>outcomes.get(id)?.status === 'passed'),
  'Required check missing, skipped, or failed');
  if (platform) {
    requireCondition(['android','ios'].includes(platform) && build && /^\d+\.\d+\.\d+$/.test(runtime) &&
      /^[1-9][0-9]*$/.test(revision) && /^[a-f0-9-]{36}$/.test(updateId), 'Invalid OTA release identity');
    const expected = ['qa-runtime',runtime,build,runtime,revision,updateId,commit].join('/');
    requireCondition(summary.nativeRuns?.some((run)=>run.platform === platform && run.scenario === 'ota' &&
      run.runId === runId && run.fingerprint === digest && run.commit === commit &&
      run.version === runtime && run.build === build && run.runtime === runtime &&
      run.phases.some((phase)=>['installed','recovery'].includes(phase.id) && phase.identity === expected)),
    'OTA platform, installed build, runtime, revision or update ID differs');
  }
  console.log('Full test report verified for '+commit);
} catch (error) {
  console.error('TEST_RELEASE_REPORT_INCOMPLETE: '+error.message);
  process.exitCode = 2;
}
