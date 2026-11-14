#!/usr/bin/env node
/** Deterministic, predeclared three-window comparison, not cherry-picked runs. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function compareWindows(baselines, candidates, maxRegressionPercent = 20) {
  assert.equal(baselines.length, 3, 'exactly three predeclared windows required');
  assert.equal(candidates.length, 3, 'exactly three predeclared windows required');
  const all = [...baselines, ...candidates];
  for (const run of all) {
    assert.equal(run.environment, 'loopback-only');
    assert.equal(run.targets.length, 2);
    assert.equal(run.measured.errors, 0, 'any HTTP failure is a failed load window');
    assert.equal(run.measured.capacityDropRate, 0, 'no local load generator drops');
    assert(run.measured.successes >= 100);
    assert(run.measured.perTarget.every(t => t.successes >= 40));
    assert(Number.isFinite(run.measured.p95Ms) && run.measured.p95Ms > 0);
    assert(Number.isFinite(run.measured.p99Ms) && run.measured.p99Ms >= run.measured.p95Ms);
    assert.deepEqual(run.params, baselines[0].params, 'profiles must be identical');
    assert.deepEqual(run.targets, baselines[0].targets, 'topology must be identical');
  }
  const medianRun = runs => [...runs].sort((a,b) => a.measured.p95Ms - b.measured.p95Ms)[1];
  const baseline = structuredClone(medianRun(baselines));
  const candidate = structuredClone(medianRun(candidates));
  const changeP95Percent = Number(((candidate.measured.p95Ms / baseline.measured.p95Ms - 1) * 100).toFixed(2));
  const comparator = {
    baselineRunId: baseline.runId,
    changeP95Percent,
    p99BaselineMs: baseline.measured.p99Ms,
    p99CandidateMs: candidate.measured.p99Ms,
    thresholdPercent: maxRegressionPercent,
    pass: changeP95Percent <= maxRegressionPercent,
    interpretation: 'same code, before and after disposable PG restore; NOT code-version A/B',
  };
  const aggregation = {
    method: 'predeclared-median-p95-of-three',
    baselineP95Ms: baselines.map(x=>x.measured.p95Ms),
    candidateP95Ms: candidates.map(x=>x.measured.p95Ms),
    baselineP99Ms: baselines.map(x=>x.measured.p99Ms),
    candidateP99Ms: candidates.map(x=>x.measured.p99Ms),
    baselineRunIds: baselines.map(x=>x.runId),
    candidateRunIds: candidates.map(x=>x.runId),
  };
  candidate.comparator = comparator;
  baseline.aggregation = aggregation;
  candidate.aggregation = aggregation;
  return { baseline, candidate, comparator, aggregation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [baseRoot, candRoot, number] = process.argv.slice(2);
    assert(baseRoot && candRoot && number === '3', 'usage: script <baseline-dir> <candidate-dir> 3');
    const load = async (root) => Promise.all([1,2,3].map(async number =>
      JSON.parse(await readFile(join(root, `window-${number}`, 'summary.json'), 'utf8'))));
    const result = compareWindows(await load(baseRoot), await load(candRoot));
    for (const [root, data] of [[baseRoot,result.baseline],[candRoot,result.candidate]]) {
      await mkdir(root,{recursive:true});
      await writeFile(join(root,'summary.json'),JSON.stringify(data,null,2)+'\n');
    }
    console.log(JSON.stringify({ comparator: result.comparator, windows: result.aggregation },null,2));
    if (!result.comparator.pass) process.exitCode=2;
  } catch(e) {
    console.error('A2_LOAD_WINDOWS_UNVERIFIED', e.message);
    process.exitCode=2;
  }
}
