import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPlaywrightJson } from './playwright-report-contract.mjs';
const name='learner completes training after fresh session';
const source=()=>({suites:[{title:'',specs:[{title:name,ok:true,tests:[{status:'expected',expectedStatus:'passed',results:[{status:'passed'}]}]}]}],errors:[]});
test('accepts only actual exact single passed named Playwright case',()=>{
 const r=verifyPlaywrightJson(source(),name);assert.equal(r.numPassedTests,1);assert.equal(r.testResults[0].assertionResults[0].fullName,name);
});
test('rejects missing and duplicate expected case',()=>{
 assert.throws(()=>verifyPlaywrightJson({suites:[]},name));
 const x=source();x.suites.push(x.suites[0]);assert.throws(()=>verifyPlaywrightJson(x,name));
});
test('rejects skipped, pending, failed, retried and test runner errors',()=>{
 for(const [field,value] of [['status','skipped'],['status','unexpected'],['expectedStatus','skipped']]){
  const r=source();r.suites[0].specs[0].tests[0][field]=value;assert.throws(()=>verifyPlaywrightJson(r,name));
 }
 const retry=source();retry.suites[0].specs[0].tests[0].results.push({status:'passed'});assert.throws(()=>verifyPlaywrightJson(retry,name));
 const error=source();error.errors.push({message:'runner died'});assert.throws(()=>verifyPlaywrightJson(error,name));
});
