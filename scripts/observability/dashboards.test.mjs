import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../../ci-cd/observability/uptrace/dashboards.v1.json',import.meta.url)));
test('twelve distinct panels and necessary on-call aliases are prepared',()=>{
  assert.equal(data.panels.length,12);
  assert.equal(new Set(data.panels.map(p=>p.id)).size,12);
  assert.equal(data.mobileOnCallAliases.length,8);
  assert.equal(data.alerts.length,15);
});
test('queries stay bounded; no user/device/exact identifiers in labels',()=>{
  assert.equal(data.status,'draft-awaiting-first-real-ingest');
  for(const p of data.panels)for(const q of p.queries) {
    assert.match(q.promql,/^[a-zA-Z0-9_.(),{}= !"\[\]*/+<>:-]+$/);
    assert.doesNotMatch(q.promql,/user_id|device_id|trace_id|email|raw_url|request_id|ip_address/i);
  }
  for(const alert of data.alerts) {
    assert.ok(alert.forMinutes>0&&alert.forMinutes<=15);
    assert.ok(['warning','critical'].includes(alert.severity));
  }
});
