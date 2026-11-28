import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import YAML from 'yaml';

const base=new URL('../../ci-cd/observability/uptrace/',import.meta.url);
function load(name) {
 const source=readFileSync(new URL(name,base),'utf8');
 const doc=YAML.parseDocument(source,{uniqueKeys:true,strict:true});
 assert.equal(doc.errors.length,0);
 return doc.toJS();
}
const files=['gafus-nonprod-telemetry.v2.yml','gafus-production-operations.v2.yml','gafus-mobile-health.v2.yml'];
const safeMetric=/^[a-zA-Z_][a-zA-Z0-9_]{2,95}$/;
const safeAlias=/^[a-z][a-z0-9_]{1,55}$/;
for(const file of files) {
 test(file+' is a strict Uptrace-v2-shaped privacy-bounded YAML',()=>{
  const d=load(file);
  assert.equal(d.schema,'v2');
  assert.match(d.version,/^v\d\d\.\d\d\.\d\d$/);
  assert.equal(typeof d.name,'string');
  assert.ok(d.name.startsWith('GAFUS: '));
  assert.ok(d.setup_link.startsWith('https://uptrace.dev/'));
  assert.ok(d.tags.includes('prom'));
  assert.ok(d.grid_sections.length>=3);
  assert.equal(new Set(d.grid_sections.map(s=>s.title)).size,d.grid_sections.length);
  for(const section of d.grid_sections){
   assert.ok(section.items?.length);
   for(const item of section.items){
    assert.equal(typeof item.title,'string');
    assert.ok(item.metrics?.length>0 && item.query?.length>0);
    const aliases=new Set();
    for(const metric of item.metrics){
     const match=/^([a-zA-Z_][a-zA-Z0-9_]{2,95}) as \$([a-z][a-z0-9_]{1,55})$/.exec(metric);
     assert.ok(match,'invalid MQL metric alias: '+metric);
     assert.match(match[1],safeMetric);
     assert.match(match[2],safeAlias);
     aliases.add(match[2]);
    }
    for(const clause of item.query){
     assert.doesNotMatch(clause,/(?:user_id|userId|phone|email|ip_address|device_id|access_token|password|url_path|account_id)/i);
     for(const [,alias] of clause.matchAll(/\$([a-z][a-z0-9_]{1,55})/g))
       assert.ok(aliases.has(alias),'undeclared MQL alias: '+alias);
    }
   }
  }
  for(const rule of d.metric_monitors??[]) {
   assert.equal(rule.status,'paused','unvalidated alert must NOT page people');
   assert.ok(['threshold','anomaly','outlier','forecast'].includes(rule.type));
   assert.ok(rule.num_eval_points>0 && rule.num_eval_points<=15);
  }
 });
}
test('production draft covers 12 domains with independent iOS/Android metrics',()=>{
 const d=load('gafus-production-operations.v2.yml');
 assert.equal(d.grid_sections.length,12);
 const ios=d.grid_sections.find(x=>x.title.includes('iOS'));
 const android=d.grid_sections.find(x=>x.title.includes('Android'));
 assert.ok(ios?.items.some(item=>item.query.some(q=>q.includes('service="gafus-mobile-ios"'))));
 assert.ok(android?.items.some(item=>item.query.some(q=>q.includes('service="gafus-mobile-android"'))));
});
