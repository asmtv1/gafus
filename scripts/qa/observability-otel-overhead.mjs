#!/usr/bin/env node
/** Measured instrumentation overhead, localhost-only, synthetic use-case spans.
 * NOT full API/DB throughput, NOT evidence of production latency.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  configureServerTelemetry, startCorrelatedSpan, withServerSpan,
  flushServerTelemetry, shutdownServerTelemetry,
} from '../../packages/logger/dist/serverTelemetry.js';
const execFileAsync = promisify(execFile);
const iterations = 1000;
const warmup = 80;
const duration = values => {
  const sorted = [...values].sort((a,b)=>a-b);
  const q = p => Math.round(sorted[Math.min(sorted.length-1, Math.ceil(p*sorted.length)-1)]*1000)/1000;
  return { p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1) };
};

async function child(sampling) {
  if (!['off','on'].includes(sampling)) throw Error('A2_BENCH_MODE_INVALID');
  if (sampling === 'on') {
    const url = process.env.A2_BENCH_LOCAL_OTLP;
    assert(/^http:\/\/127\.0\.0\.1:[0-9]+\/v1\/traces$/.test(url ?? ''));
    assert.equal(configureServerTelemetry('gafus-api', {
      OTEL_TRACES_SAMPLER_ARG:'1', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:url,
    }),true);
  }
  const data=[];
  const started = performance.now();
  for (let i=0;i<iterations+warmup;i++) {
    const t=performance.now();
    const parent=startCorrelatedSpan({service:'gafus-api',name:'a2.benchmark.http',
      kind:'server',operationId:'a2-obs-benchmark'});
    await withServerSpan(parent,async()=>{
      const nested=startCorrelatedSpan({service:'gafus-api',name:'a2.benchmark.application',
        kind:'internal',operationId:'a2-obs-benchmark'});
      nested.end();
      await Promise.resolve();
    });
    parent.end();
    if (i>=warmup) data.push(performance.now()-t);
  }
  const elapsedMs=performance.now()-started;
  if(sampling==='on') await flushServerTelemetry();
  const result={mode:sampling,iterations,warmup,elapsedMs:Math.round(elapsedMs),
    operationsPerSecond:Math.round(iterations/elapsedMs*1000),
    ...duration(data),rssMiB:Math.round(process.memoryUsage().rss/1048576)};
  await shutdownServerTelemetry();
  process.stdout.write(JSON.stringify(result)+'\n');
}

async function main() {
  const received={spans:0,requests:0};
  const sink=createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/v1/traces')return void res.writeHead(404).end();
    const chunks=[];
    let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>2_000_000){res.writeHead(413).end();return;}chunks.push(chunk);}
    try {
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      received.requests++;
      for(const r of body.resourceSpans??[])for(const scope of r.scopeSpans??[])received.spans+=(scope.spans??[]).length;
      res.writeHead(200,{'Content-Type':'application/json'}).end('{}');
    } catch {res.writeHead(400).end();}
  });
  await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
  try {
    const url='http://127.0.0.1:'+sink.address().port+'/v1/traces';
    const windows={off:[],on:[]};
    const self=resolve(process.argv[1]);
    // Alternating fixed order, separate Node processes, excludes initialization.
    for(const mode of ['off','on','off','on','off','on']) {
      const {stdout}=await execFileAsync(process.execPath,[self,'--child',mode],{
        cwd:resolve('.'),env:{...process.env,A2_BENCH_LOCAL_OTLP:url},timeout:30000,maxBuffer:100000,
      });
      const result=JSON.parse(stdout.trim());
      assert.equal(result.mode,mode);
      assert.equal(result.iterations,iterations);
      windows[mode].push(result);
    }
    assert(received.spans>0 && received.requests>0,
      'OTLP exporter failed to deliver to actual localhost receiver');
    const median=arr=>[...arr].sort((a,b)=>a-b)[1];
    const baseline=median(windows.off.map(x=>x.p95Ms));
    const instrumented=median(windows.on.map(x=>x.p95Ms));
    const report={runPrefix:'a2-obs-',scope:'microbenchmark synthetic async spans only; not HTTP, SQL or production',
      warmup,iterations,windowOrder:['off','on','off','on','off','on'],windows,
      medianP95OffMs:baseline,medianP95OnMs:instrumented,
      relativeP95ChangePercent:Math.round(((instrumented/baseline)-1)*10000)/100,
      otlpAcceptedRequests:received.requests,otlpAcceptedSpans:received.spans,
      sampling:'0 vs 1',performanceSlo:'PENDING_REAL_API_STAGING',checks:'PASS'};
    await mkdir('artifacts',{recursive:true});
    await writeFile('artifacts/a2-obs-otel-overhead.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log('A2_LOCAL_TELEMETRY_MICRO_OVERHEAD_MEASURED',JSON.stringify({
      medianP95OffMs:baseline,medianP95OnMs:instrumented,
      relativeP95ChangePercent:report.relativeP95ChangePercent,
      otlpAcceptedSpans:received.spans}));
  } finally {await new Promise(resolve=>sink.close(resolve));}
}
if(process.argv[2]==='--child') await child(process.argv[3]);
else if(process.argv.length===2 && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
else throw Error('A2_TELEMETRY_BENCH_INVALID_USAGE');
