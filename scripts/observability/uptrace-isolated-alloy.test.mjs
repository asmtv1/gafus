import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../../ci-cd/observability/uptrace/alloy.nonprod-isolated.alloy',import.meta.url),'utf8');
const shield=readFileSync(new URL('../../ci-cd/observability/uptrace/alloy.nonprod-ack-gateway.alloy',import.meta.url),'utf8');
test('Nonprod Alloy graph is isolated from Prod/YC and all scrape names are fixed',()=>{
 assert.doesNotMatch(config,/monitoring\.api\.cloud\.yandex|YC_MONITORING|gafus-postgres|gafus-redis|host\.docker\.internal|api:3001|worker:3004/);
 assert.match(config,/127\.0\.0\.1:54318/);
 assert.match(config,/127\.0\.0\.1:59241/);
 assert.match(config,/GAFUS_NONPROD_UPTRACE_DSN/);
 assert.doesNotMatch(config,/\bUPTRACE_DSN\b(?!")/);
 assert.match(config,/action = "labelkeep"/);
 assert.match(config,/^otelcol\.storage\.file "nonprod"/m);
 assert.match(config,/storage = otelcol\.storage\.file\.nonprod\.handler/);
 assert.match(config,/wal \{/);
});
test('bounded persistent queue and retry always protect upstream ingest',()=>{
 assert.match(config,/queue_size = 128/);
 assert.match(config,/num_consumers = 1/);
 assert.match(config,/fsync = true/);
 assert.match(config,/max_request_body_size = "512KiB"/);
 assert.match(config,/read_timeout = "10s"/);
 assert.match(config,/on_start = true/);
 assert.match(config,/on_rebound = true/);
 assert.match(config,/max_elapsed_time = "30m"/);
 assert.match(config,/block_on_overflow = true/);
 assert.doesNotMatch(config,/0\.0\.0\.0:/);
});

test('ACK gateway candidate routes OTLP and Prometheus exclusively via loopback',()=>{
 assert.match(shield,/endpoint = "http:\/\/127\.0\.0\.1:54319"/);
 assert.match(shield,/url = "http:\/\/127\.0\.0\.1:54319\/api\/v1\/prometheus\/write"/);
 assert.match(shield,/x-gafus-ack-gateway-token/);
 assert.match(shield,/GAFUS_NONPROD_ACK_GATEWAY_TOKEN/);
 assert.match(shield,/storage = otelcol\.storage\.file\.nonprod\.handler/);
 assert.match(shield,/wal \{/);
 assert.doesNotMatch(shield,/api\.uptrace\.dev|GAFUS_NONPROD_UPTRACE_DSN|YC_MONITORING|monitoring\.api\.cloud\.yandex/);
 assert.doesNotMatch(shield,/0\.0\.0\.0:/);
});
