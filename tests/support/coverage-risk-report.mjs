/** Fail-closed source coverage: denominator and branch hits originate in V8 Istanbul JSON, never UI percentages. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
const sha = value => createHash('sha256').update(value).digest('hex');
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const checkCount = (value,name) => {
  if(!Number.isSafeInteger(value)||value<0)throw Error('COVERAGE_INVALID_COUNTER '+name);
  return value;
};
export function measureIstanbulSource(raw) {
  if(!raw || !raw.statementMap || !raw.s || !raw.b || !raw.branchMap ||
     typeof raw.path !== 'string')throw Error('COVERAGE_MISSING_ISTANBUL_SOURCE');
  const statementIds=Object.keys(raw.statementMap);
  const branchIds=Object.keys(raw.branchMap);
  if(!statementIds.length || !branchIds.length ||
     statementIds.length!==Object.keys(raw.s).length ||
     branchIds.length!==Object.keys(raw.b).length)
    throw Error('COVERAGE_EMPTY_OR_INCOMPLETE_SOURCE_COUNTERS');
  const lines=new Map();
  for(const id of statementIds){
    if(!own(raw.s,id))throw Error('COVERAGE_MISSING_STATEMENT_HITS');
    const line=raw.statementMap[id]?.start?.line;
    if(!Number.isSafeInteger(line)||line<=0)throw Error('COVERAGE_INVALID_STATEMENT_MAP');
    const hits=checkCount(raw.s[id],'statement');
    lines.set(line,Math.max(lines.get(line)||0,hits));
  }
  const branches=[];
  for(const id of branchIds){
    const counts=raw.b[id];
    if(!Array.isArray(counts)||!counts.length ||
       counts.length!==raw.branchMap[id]?.locations?.length)
       throw Error('COVERAGE_INVALID_BRANCH_MAP');
    for(const count of counts)branches.push(checkCount(count,'branch'));
  }
  if(lines.size===0 || branches.length===0)throw Error('COVERAGE_ZERO_DENOMINATOR');
  return {lines:{total:lines.size,covered:[...lines.values()].filter(v=>v>0).length},
          branches:{total:branches.length,covered:branches.filter(v=>v>0).length}};
}
export function checkSummaryCounters(rawCounters,summary) {
  if(!summary || typeof summary!=='object')throw Error('COVERAGE_SUMMARY_ABSENT');
  for(const kind of ['lines','branches']){
    const a=rawCounters[kind],b=summary[kind];
    if(!b||a.total<=0||!Number.isSafeInteger(b.total)||!Number.isSafeInteger(b.covered)||
      b.total!==a.total || b.covered!==a.covered ||
      typeof b.pct!=='number'||!Number.isFinite(b.pct)||
      Math.abs(b.pct-100*a.covered/a.total)>0.025)
      throw Error('COVERAGE_SUMMARY_COUNTER_OR_PERCENTAGE_MISMATCH '+kind);
  }
}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'));}
function checkLcov(lcov, groupRoot, root, expected){
  const chunks=lcov.split('end_of_record').map(x=>x.trim()).filter(Boolean);
  const actual=[];
  for(const item of chunks){
    const fields=Object.fromEntries(item.split('\n').filter(x=>/^(SF|LF|LH|BRF|BRH):/.test(x)).map(x=>[x.slice(0,x.indexOf(':')),x.slice(x.indexOf(':')+1)]));
    if(!fields.SF)throw Error('COVERAGE_LCOV_SOURCE_ABSENT');
    const full=resolve(groupRoot,fields.SF);
    const rel=relative(root,full);
    if(!expected.has(rel)||actual.some(x=>x.path===rel))throw Error('COVERAGE_LCOV_FOREIGN_OR_DUPLICATE_SOURCE '+rel);
    for(const label of ['LF','LH','BRF','BRH'])if(!/^\d+$/.test(fields[label]||''))throw Error('COVERAGE_LCOV_COUNTER_MISSING '+label);
    actual.push({path:rel,lines:{total:Number(fields.LF),covered:Number(fields.LH)},
      branches:{total:Number(fields.BRF),covered:Number(fields.BRH)}});
  }
  if(actual.length!==expected.size)throw Error('COVERAGE_LCOV_FILE_COUNT_DRIFT');
  return new Map(actual.map(x=>[x.path,x]));
}
export function verifyRiskCoverageToolchain(root,domain,baseline) {
  const workspace={payment:'packages/core',worker:'packages/worker'}[domain];
  const expected=baseline.runnerVersions?.[domain];
  if(!workspace || !expected || expected.vitest!=='4.1.0' || expected.coverageV8!=='4.1.0')
    throw Error('COVERAGE_RISK_PROVIDER_BASELINE_UNPINNED');
  const requireFromWorkspace=createRequire(join(root,workspace,'package.json'));
  const actual={vitest:requireFromWorkspace('vitest/package.json').version,
    coverageV8:requireFromWorkspace('@vitest/coverage-v8/package.json').version};
  if(actual.vitest!==expected.vitest || actual.coverageV8!==expected.coverageV8)
    throw Error('COVERAGE_RISK_VITEST_V8_VERSION_DRIFT '+JSON.stringify(actual));
  return actual;
}
export function measureRiskCoverage(root,domain,coverageDir,baseline) {
  const def=baseline?.targets?.[domain];
  if(baseline?.schema!==1||!def||!def.groups||!Array.isArray(def.unmeasured)||def.unmeasured.length<2)
    throw Error('COVERAGE_RISK_BASELINE_OR_DOMAIN_MISSING');
  const domainRoot={payment:'packages/core',worker:'packages/worker'};
  const groupRoots={core:'packages/core',subscriptions:'packages/subscription-payment-server',worker:'packages/worker'};
  if(!domainRoot[domain])throw Error('COVERAGE_RISK_UNKNOWN_DOMAIN');
  const sourceFiles=Object.values(def.groups).flat();
  if(sourceFiles.length<1 || new Set(sourceFiles).size!==sourceFiles.length ||
    sourceFiles.some(p=>!/^packages\/[a-z0-9-]+\/src\/[A-Za-z0-9/._-]+\.ts$/.test(p)))
    throw Error('COVERAGE_RISK_SOURCE_MANIFEST_INVALID');
  const files=[];
  for(const [group,expectedFiles] of Object.entries(def.groups)){
    const folder=join(coverageDir,group);
    const summary=readJson(join(folder,'coverage-summary.json'));
    const raw=readJson(join(folder,'coverage-final.json'));
    const lcov=readFileSync(join(folder,'lcov.info'),'utf8');
    if(!lcov.trim()||!groupRoots[group])throw Error('COVERAGE_RISK_MISSING_LCOV_OR_GROUP');
    const targetSet=new Set(expectedFiles);
    const expectedPaths=expectedFiles.map(x=>join(root,x));
    const observedKeys=Object.keys(raw).sort(),summaryKeys=Object.keys(summary).filter(x=>x!=='total').sort();
    if(JSON.stringify(observedKeys)!==JSON.stringify(expectedPaths.slice().sort()) ||
       JSON.stringify(summaryKeys)!==JSON.stringify(expectedPaths.slice().sort()))
       throw Error('COVERAGE_RISK_MISSING_OR_UNEXPECTED_SOURCE '+group);
    const lcovData=checkLcov(lcov,join(root,groupRoots[group]),root,targetSet);
    const totals={lines:{total:0,covered:0},branches:{total:0,covered:0}};
    for(const rel of expectedFiles){
      const abs=join(root,rel);
      if(raw[abs].path!==abs)throw Error('COVERAGE_RISK_WRONG_SOURCE_MAP '+rel);
      const counters=measureIstanbulSource(raw[abs]);
      checkSummaryCounters(counters,summary[abs]);
      const lcovRow=lcovData.get(rel);
      if(!lcovRow)throw Error('COVERAGE_RISK_SOURCE_ABSENT_IN_LCOV '+rel);
      for(const metric of ['lines','branches']){
        if(lcovRow[metric].total!==counters[metric].total || lcovRow[metric].covered!==counters[metric].covered)
          throw Error('COVERAGE_RISK_LCOV_MISMATCH '+rel+' '+metric);
        totals[metric].total+=counters[metric].total;
        totals[metric].covered+=counters[metric].covered;
      }
      const currentHash=sha(readFileSync(abs));
      const base=baseline.sources?.[rel];
      if(!base || !base.lines || !base.branches || !base.sourceSha256)throw Error('COVERAGE_RISK_BASELINE_MISSING_SOURCE '+rel);
      files.push({path:rel,group,sourceSha256:currentHash,baselineSourceSha256:base.sourceSha256,
        lines:counters.lines,branches:counters.branches,
        baseline:{lines:base.lines,branches:base.branches},
        delta:{lines:counters.lines.covered-base.lines.covered,
          branches:counters.branches.covered-base.branches.covered},
      });
    }
    checkSummaryCounters(totals,summary.total);
  }
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const totals={lines:{total:0,covered:0},branches:{total:0,covered:0}};
  for(const file of files)for(const metric of ['lines','branches']){
    totals[metric].total+=file[metric].total;totals[metric].covered+=file[metric].covered;
  }
  for(const metric of ['lines','branches'])totals[metric].pct=Number((totals[metric].covered*100/totals[metric].total).toFixed(2));
  return {schema:1,kind:'coverage-risk-source-baseline',status:'measured-not-gated',domain,
    baselineHead:baseline.head,baselineKind:baseline.kind,baselineFingerprint:sha(JSON.stringify(baseline)),
    sourceMode:domain==='payment'
      ? 'paymentService TypeScript imported through a coverage-only adapter; Apple state and subscription transition source V8 mapping'
      : 'Worker TypeScript exercised by the original isolated SQL Vitest test; external media-server repository (built dist) excluded',
    databaseMode:baseline.dbMode,providerMode:baseline.providerMode,
    totals,files,unmeasured:def.unmeasured};
}
export function verifyRiskCoverageReceipt(root,domain,coverageDir,receiptFile,baseline) {
  if(baseline.runnerVersions)verifyRiskCoverageToolchain(root,domain,baseline);
  const recorded=readJson(receiptFile);
  const calculated=measureRiskCoverage(root,domain,coverageDir,baseline);
  if(JSON.stringify(recorded)!==JSON.stringify(calculated))throw Error('COVERAGE_RISK_RECEIPT_DRIFT');
  return calculated;
}

/** Historical measurements may be compared only for identical source and denominator.
 * Missing/invalid historical records remain errors; changed code is not a coverage regression
 * measurement. Current receipts are always independently verified. */
export function compareHistoricalRiskCoverage(files, previous, current, previousPath) {
  if (current.previousBaseline?.file !== previousPath || previous.head !== current.head)
    throw Error('invalid explicit previous coverage baseline');
  const sums={lines:{total:0,covered:0},branches:{total:0,covered:0}};
  const changed=[];
  const sourceDeltas=files.map(f=>{
    const prior=previous.sources?.[f.path];
    const baseline=current.sources?.[f.path];
    if(!prior || !baseline || !/^[a-f0-9]{64}$/.test(prior.sourceSha256||'') ||
       prior.sourceSha256!==baseline.sourceSha256)
      throw Error('invalid historical baseline source: '+f.path);
    for(const k of ['lines','branches']){
      const old=prior[k], expected=baseline[k];
      if(!Number.isInteger(old?.total)||old.total<=0||!Number.isInteger(old?.covered)||
         old.covered<0||old.covered>old.total||old.total!==expected?.total)
        throw Error('invalid historical baseline counters: '+f.path+' '+k);
      sums[k].total+=old.total;sums[k].covered+=old.covered;
    }
    const reasons=[];
    if(prior.sourceSha256!==f.sourceSha256) reasons.push('source-changed');
    if(['lines','branches'].some(k=>prior[k].total!==f[k].total)) reasons.push('denominator-changed');
    if(reasons.length) changed.push({path:f.path,reasons});
    return {path:f.path,lines:{...prior.lines,deltaCovered:f.lines.covered-prior.lines.covered},
      branches:{...prior.branches,deltaCovered:f.branches.covered-prior.branches.covered}};
  });
  for(const k of ['lines','branches']) sums[k].pct=sums[k].total>0?
    Number((100*sums[k].covered/sums[k].total).toFixed(2)):null;
  if(changed.length) return {source:previousPath,status:'not-comparable',historicalTotals:sums,changed};
  return {source:previousPath,status:'comparable',totals:sums,sourceDeltas};
}
