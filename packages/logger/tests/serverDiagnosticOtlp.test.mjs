import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ServerDiagnosticOtlp, configureServerDiagnosticOtlp, enqueueServerDiagnosticOtlp, shutdownServerDiagnosticOtlp, serverDiagnosticOtlpStats } from '../dist/serverDiagnosticOtlp.js';
const endpoint = 'https://api.uptrace.dev/v1/logs', dsn = 'TEST_NONPROD_CREDENTIAL_123';
const event = (extra = {}) => JSON.stringify({
    level: 'error', service: 'gafus-api', event: 'api.synthetic_error', errorCode: 'CANARY_EXPECTED',
    operationId: '6a81cd2d-326b-425b-a83a-b58a24109a52', ...extra,
});
const ack = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
describe('Server diagnostic OTLP transport', () => {
    it('allows fixed schema only, 1 event per input and no private content in OTLP', async () => {
        const requests = [];
        const f = async (url, init) => {
            requests.push({ url: String(url), headers: init?.headers, body: String(init?.body) });
            return ack();
        };
        const t = new ServerDiagnosticOtlp('gafus-api', endpoint, dsn, f);
        assert.equal(t.enqueue(event()), true);
        assert.equal(t.enqueue(event({ email: 'secret@example.com' })), false);
        assert.equal(t.enqueue(event({ event: 'contact.secret@example.com' })), false);
        assert.equal(t.enqueue(event({ service: 'gafus-worker' })), false);
        assert.equal(t.enqueue(event({ level: 'debug' })), false);
        await t.flush();
        assert.equal(t.stats().accepted, 1);
        assert.equal(t.stats().queued, 0);
        assert.equal(requests.length, 1);
        const request = requests[0];
        assert.equal(request.url, endpoint);
        const wire = JSON.parse(request.body);
        assert.equal(wire.resourceLogs[0].resource.attributes.find((a) => a.key === 'deployment.environment.name').value.stringValue, 'preview');
        assert.equal(wire.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue, 'api.synthetic_error');
        assert.equal(request.body.includes('secret@example.com'), false);
        assert.equal(request.body.includes(dsn), false);
        assert.deepEqual(request.headers, { 'content-type': 'application/json', 'uptrace-dsn': dsn });
    });
    it('keeps a retryable export in queue and eventually ACKs it', async () => {
        let call = 0;
        const t = new ServerDiagnosticOtlp('gafus-api', endpoint, dsn, (async () => {
            call++;
            return call === 1 ? new Response('unavailable', { status: 503 }) : ack();
        }));
        assert.equal(t.enqueue(event()), true);
        await t.flush();
        assert.equal(t.stats().queued, 1);
        assert.equal(t.stats().retries, 1);
        await t.flush();
        assert.equal(t.stats().queued, 0);
        assert.equal(t.stats().accepted, 1);
    });
    it('a malformed successful response is never a proven ACK', async () => {
        const t = new ServerDiagnosticOtlp('gafus-api', endpoint, dsn, (async () => new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } })));
        t.enqueue(event());
        await t.flush();
        assert.equal(t.stats().queued, 1);
        assert.equal(t.stats().retries, 1);
    });
    it('401 suspends delivery and preserves already queued errors', async () => {
        const t = new ServerDiagnosticOtlp('gafus-api', endpoint, dsn, (async () => new Response('', { status: 401 })));
        t.enqueue(event());
        await t.flush();
        assert.equal(t.stats().authSuspended, true);
        assert.equal(t.stats().queued, 1);
        assert.equal(t.enqueue(event()), true);
        assert.equal(t.stats().queued, 2);
    });
    it('large bursts never exceed bounded memory', () => {
        const t = new ServerDiagnosticOtlp('gafus-api', endpoint, dsn);
        for (let i = 0; i < 600; i++)
            t.enqueue(event());
        assert.equal(t.stats().queued, 512);
        assert.equal(t.stats().dropped, 88);
    });
    it('runtime disabled by default, production requires explicit approval', async () => {
        assert.equal(configureServerDiagnosticOtlp('gafus-api', {}), false);
        assert.equal(configureServerDiagnosticOtlp('gafus-api', {
            GAFUS_UPTRACE_LOGS_ENABLED: 'true', GAFUS_TELEMETRY_ENVIRONMENT: 'production',
            OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: endpoint, UPTRACE_DSN: dsn,
        }), false);
        assert.equal(serverDiagnosticOtlpStats(), null);
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => ack());
        try {
            assert.equal(configureServerDiagnosticOtlp('gafus-api', {
                GAFUS_UPTRACE_LOGS_ENABLED: 'true', GAFUS_TELEMETRY_ENVIRONMENT: 'preview',
                OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: endpoint, UPTRACE_DSN: dsn,
            }), true);
            enqueueServerDiagnosticOtlp(event());
            assert.equal(serverDiagnosticOtlpStats()?.queued, 1);
            await shutdownServerDiagnosticOtlp();
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
});


it('oversized partial ack is unknown and retryable, not an event loss',async()=>{
 const sink=new ServerDiagnosticOtlp('gafus-api',endpoint,dsn,
   (async()=>new Response('{"partialSuccess":{"rejectedLogRecords":99}}',
    {status:200,headers:{'content-type':'application/json'}})));
 sink.enqueue(event());
 await sink.flush();
 assert.equal(sink.stats().queued,1);
 assert.equal(sink.stats().retries,1);
 assert.equal(sink.stats().dropped,0);
});
it('graceful shutdown drains multiple bounded export batches',async()=>{
 const originalFetch=globalThis.fetch;
 const batches=[];
 globalThis.fetch=(async (_url,options)=>{
  const records=JSON.parse(String(options?.body))
    .resourceLogs[0].scopeLogs[0].logRecords;
  batches.push(records.length);
  return ack();
 });
 try{
  assert.equal(configureServerDiagnosticOtlp('gafus-api',{
   GAFUS_UPTRACE_LOGS_ENABLED:'true',GAFUS_TELEMETRY_ENVIRONMENT:'preview',
   OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:endpoint,UPTRACE_DSN:dsn,
  }),true);
  for(let n=0;n<65;n++)enqueueServerDiagnosticOtlp(event());
  await shutdownServerDiagnosticOtlp();
  assert.deepEqual(batches,[24,24,17]);
  assert.equal(serverDiagnosticOtlpStats(),null);
 }finally{
  globalThis.fetch=originalFetch;
  await shutdownServerDiagnosticOtlp();
 }
});

it('sends only validated safe code-offset stack frames to OTLP log attributes',async()=>{
 const calls=[];
 const sink=new ServerDiagnosticOtlp('gafus-api',endpoint,dsn,(async(_url,opts)=>{
  calls.push(JSON.parse(String(opts.body)));
  return ack();
 }));
 assert.equal(sink.enqueue(event({stackFrames:'at getOrder (code:167:11)\nat Service.write (code:27:2)'})),true);
 assert.equal(sink.enqueue(event({stackFrames:'at getOrder (file:///Users/private?token=SECRET:12:2)'})),false);
 assert.equal(sink.enqueue(event({stackFrames:'at getOrder (code:9999999:2)'})),false);
 await sink.flush();
 const record=calls[0].resourceLogs[0].scopeLogs[0].logRecords[0];
 assert.equal(record.attributes.find(x=>x.key==='gafus.safe_stack_frames').value.stringValue,
  'at getOrder (code:167:11)\nat Service.write (code:27:2)');
 assert.doesNotMatch(JSON.stringify(calls),/Users|private|SECRET|file:\/\//);
});
