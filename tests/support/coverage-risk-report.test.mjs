import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {measureIstanbulSource,checkSummaryCounters,measureRiskCoverage,verifyRiskCoverageReceipt} from './coverage-risk-report.mjs';
const src=(path,covered=1)=>({path,statementMap:{0:{start:{line:1}},1:{start:{line:2}}},s:{0:covered,1:0},
  branchMap:{0:{locations:[{},{}]}},b:{0:[covered,0]}});
const stats=(total,covered)=>({total,covered,pct:Number((100*covered/total).toFixed(2))});
test('source counters count distinct real statement lines and branch slots, not UI percent',()=>{
  const source=src('/source.ts');
  assert.deepEqual(measureIstanbulSource(source),{lines:{total:2,covered:1},branches:{total:2,covered:1}});
  checkSummaryCounters(measureIstanbulSource(source),{lines:stats(2,1),branches:stats(2,1)});
  assert.throws(()=>checkSummaryCounters(measureIstanbulSource(source),{lines:{total:0,covered:0,pct:100},branches:stats(2,1)}),/MISMATCH/);
  assert.throws(()=>checkSummaryCounters(measureIstanbulSource(source),{lines:{total:2,covered:1,pct:100},branches:stats(2,1)}),/MISMATCH/);
});
test('zero or malformed branch denominators cannot be reported as full coverage',()=>{
  const raw=src('/source.ts');raw.branchMap={};raw.b={};
  assert.throws(()=>measureIstanbulSource(raw),/EMPTY/);
  const corrupt=src('/source.ts');corrupt.s[0]=-1;
  assert.throws(()=>measureIstanbulSource(corrupt),/COUNTER/);
  const missing=src('/source.ts');delete missing.s[0];
  assert.throws(()=>measureIstanbulSource(missing),/EMPTY|INCOMPLETE|MISSING/);
});
test('complete source manifest + LCOV + Istanbul JSON + receipt are required; mutations fail closed',()=>{
  const root=mkdtempSync(join(tmpdir(),'gafus-coverage-risk-contract-'));
  try{
    const names=['packages/subscription-payment-server/src/a.ts','packages/subscription-payment-server/src/b.ts'];
    const folder=join(root,'measured','core');mkdirSync(folder,{recursive:true});
    const all={};const base={};const summary={total:{lines:stats(4,2),branches:stats(4,2)}};
    let lcov='';
    for(const name of names){
      const full=join(root,name);mkdirSync(join(root,'packages/subscription-payment-server/src'),{recursive:true});
      writeFileSync(full,'export const x = 1;\nexport const y = 2;\n');
      all[full]=src(full);
      summary[full]={lines:stats(2,1),branches:stats(2,1)};
      base[name]={lines:{total:2,covered:1},branches:{total:2,covered:1},
        sourceSha256:createHash('sha256').update(readFileSync(full)).digest('hex')};
      lcov+=`TN:\nSF:../subscription-payment-server/src/${name.split('/').at(-1)}\nLF:2\nLH:1\nBRF:2\nBRH:1\nend_of_record\n`;
    }
    const baseline={schema:1,head:'fake-local-head',kind:'local-dirty-worktree-measured-baseline-not-release-threshold',
      dbMode:'fake',providerMode:'fake',targets:{payment:{groups:{core:names},unmeasured:['real provider','other modules']}},sources:base};
    const store=(n,obj)=>writeFileSync(join(folder,n),typeof obj==='string'?obj:JSON.stringify(obj));
    store('coverage-summary.json',summary);store('coverage-final.json',all);store('lcov.info',lcov);
    const v=measureRiskCoverage(root,'payment',join(root,'measured'),baseline);
    assert.deepEqual(v.totals,{lines:{total:4,covered:2,pct:50},branches:{total:4,covered:2,pct:50}});
    const receipt=join(root,'coverage-risk.json');writeFileSync(receipt,JSON.stringify(v));
    assert.deepEqual(verifyRiskCoverageReceipt(root,'payment',join(root,'measured'),receipt,baseline),v);
    const forged=structuredClone(summary);forged[names.map(x=>join(root,x))[0]].lines.pct=100;
    store('coverage-summary.json',forged);
    assert.throws(()=>measureRiskCoverage(root,'payment',join(root,'measured'),baseline),/MISMATCH/);
    store('coverage-summary.json',summary);
    const omitted=structuredClone(all);delete omitted[join(root,names[0])];store('coverage-final.json',omitted);
    assert.throws(()=>measureRiskCoverage(root,'payment',join(root,'measured'),baseline),/MISSING_OR_UNEXPECTED_SOURCE/);
    store('coverage-final.json',all);
    store('lcov.info',lcov.replace('BRH:1','BRH:2'));
    assert.throws(()=>measureRiskCoverage(root,'payment',join(root,'measured'),baseline),/LCOV_MISMATCH/);
    store('lcov.info',lcov);
    writeFileSync(join(root,names[0]),'export const changed=1;');
    assert.throws(()=>verifyRiskCoverageReceipt(root,'payment',join(root,'measured'),receipt,baseline),/RECEIPT_DRIFT/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
