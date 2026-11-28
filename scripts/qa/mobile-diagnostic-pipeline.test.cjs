// Minimal source-level integration tests independent of native/device packages.
// Compile the real TS modules, stub only the platform and persistence boundaries.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname,'../..');
const loadSource = (relative, replacements = {}) => {
  const filename = path.join(root,relative);
  const mod = new Module(filename,module);
  mod.filename=filename;
  mod.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=mod.require.bind(mod);
  mod.require = id => {
    if(Object.hasOwn(replacements,id))return replacements[id];
    if(id.startsWith('.') && !id.endsWith('.json')) {
      const target=path.resolve(path.dirname(filename),id.replace(/\.js$/,'')+'.ts');
      if(fs.existsSync(target))return loadSource(path.relative(root,target),replacements);
    }
    return original(id);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
  }).outputText,filename);
  return mod.exports;
};
const typesPath='packages/types/src/contracts/';
const types={...loadSource(typesPath+'mobileTelemetry.ts'),
  ...loadSource(typesPath+'mobileDiagnosticCatalog.ts'),
  ...loadSource(typesPath+'mobileDiagnosticRoutes.ts')};
const queue=loadSource('apps/mobile/src/shared/lib/telemetry/mobileTelemetryQueue.ts',{'@gafus/types':types});
const context=loadSource('apps/mobile/src/shared/lib/telemetry/mobileDiagnosticContext.ts',{'@gafus/types':types});
const worker=loadSource('packages/worker/src/mobile-telemetry-export.ts',{'@gafus/types':types});
const diagnosticContracts=loadSource('packages/mobile-ota-server/src/diagnostics-contracts.ts');
const {createMobileTelemetryIngest}=loadSource('apps/api/src/modules/mobile-telemetry/ingest.ts',{
  '@gafus/types':types,
  '@gafus/mobile-ota-server/diagnostics-contracts':diagnosticContracts
});
const uuid=i=>'b6b9dc0d-7e53-4da4-8f20-'+i.toString(16).padStart(12,'0');
const event=()=>({schemaVersion:1,eventId:uuid(1),appStartId:uuid(2),platform:'ios',
  kind:'js_handled',severity:'ERROR',occurredAt:new Date().toISOString(),
  appVersion:'1.7.5',build:'101',runtime:'1.7.5',channel:'production',
  updateId:uuid(3),exceptionType:'TypeError'});
const source=types.mobileDiagnosticCatalog['TrainingDay:init_steps'];
const coded=()=>({...event(),errorCode:source.code,module:source.module,screen:source.screen,operation:source.operation});
const record=(e,release)=>worker.buildMobileOtlpLog({
  eventId:e.eventId,environment:'production',service:'gafus-mobile-ios',payload:e,attempts:0,release
}).resourceLogs[0].scopeLogs[0].logRecords[0];
const attributes=r=>Object.fromEntries(r.attributes.map(a=>[a.key,a.value.stringValue??a.value.intValue??a.value.boolValue]));

test('Hermes and native frames survive repeated normalization; private text removed',()=>{
  const raw=[
    'TypeError: token=secret user@example.com',
    'at loadCourse (address at index.ios.bundle:1:123456789)',
    'at async loadSteps (file:///Users/private/code.ts:14:123)',
    'at address at index.ios.bundle:1:987654321',
    'render@https://private.example/file:4:76',
    'at com.gafus.Camera.upload(Camera.kt:45)',
    'java.lang.Thread.run',
    'applicationDidBecomeActive (Gafus + 19160)'
  ].join('\n');
  const stack=types.sanitizeMobileStack(raw);
  assert.match(stack,/bundle:1:123456789/);
  assert.match(stack,/at anonymous \(bundle:1:987654321\)/);
  assert.match(stack,/at loadSteps \(bundle:14:123\)/);
  assert.match(stack,/native:45/);
  assert.equal(types.sanitizeMobileStack(stack),stack);
  assert.doesNotMatch(stack,/secret|private|user@|https:/);
  const parsed=types.parseMobileTelemetryEvent({...event(),stack});
  assert.equal(parsed.stackStatus,'captured');
  assert.deepEqual(types.parseMobileTelemetryEvent(parsed),parsed);
  assert.equal(types.parseMobileTelemetryEvent({...event(),stack:'secret'}).stackStatus,'sanitized_empty');
  assert.equal(types.parseMobileTelemetryEvent({...event(),stackStatus:'unavailable'}).stackStatus,'unavailable');
});

test('reporter sends only static codes and preserves severity and independent occurrences',async()=>{
  const calls=[];
  const reporter=loadSource('apps/mobile/src/shared/lib/error-reporting/reportClientError.ts',{
    '@gafus/types':types,
    '@/shared/lib/telemetry/mobileTelemetryClient':{enqueueMobileTelemetryError:async(error,opts)=>calls.push(opts)}
  });
  const error=new TypeError('private');
  await reporter.reportClientErrorAndWait(error,{issueKey:'TrainingDay',keys:{operation:'init_steps',userId:'secret'},severity:'warning'});
  await reporter.reportClientErrorAndWait(error,{issueKey:'TrainingDay',keys:{operation:'init_steps'}});
  await reporter.reportClientErrorAndWait(new Error('new'),{issueKey:'TrainingDay',keys:{operation:'init_steps'}});
  await reporter.reportClientErrorAndWait(new Error('unknown'),{issueKey:'secret@example.com'});
  assert.equal(calls.length,3);
  assert.equal(calls[0].errorCode,source.code);
  assert.equal(calls[0].severity,'WARN');
  assert.equal(calls[0].operation,source.operation);
  assert.equal(calls[2].errorCode,'JS_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(calls),/secret|userId/);
});

test('navigation context accepts exact templates only and limits age and size',()=>{
  context.recordDiagnosticNavigation(['(main)','training','[courseType]','[dayId]'],1000);
  context.recordDiagnosticNavigation(['(main)','training','private_user_id'],1100);
  context.recordDiagnosticNavigation(['(auth)','login'],1200);
  const snapshot=context.snapshotDiagnosticContext(1300);
  assert.equal(snapshot.routeScreen,'AUTH_LOGIN');
  assert.equal(snapshot.breadcrumbs.length,2);
  assert.doesNotMatch(JSON.stringify(snapshot),/private_user_id/);
  assert.equal(context.snapshotDiagnosticContext(2_000_000).breadcrumbs.length,0);
  assert.throws(()=>types.parseMobileTelemetryEvent({...event(),routeScreen:'PRIVATE_USER'}),/ROUTE_SCREEN/);
  assert.throws(()=>types.parseMobileTelemetryEvent({...event(),breadcrumbs:[{screen:'AUTH_LOGIN',ageMs:1,userId:'secret'}]}),/BREADCRUMB/);
});

test('queue, API acceptance and OTLP export preserve safe context and exact release fields',async()=>{
  const e={...coded(),stack:'at getSteps (address at index.ios.bundle:1:12345678)',
    installationId:uuid(4),routeScreen:'AUTH_LOGIN',breadcrumbs:[{screen:'AUTH_LOGIN',ageMs:12}]};
  const pending=queue.enqueueTelemetryEvent(queue.emptyTelemetryQueue(),e,Date.now());
  const batch=queue.nextTelemetryBatch(pending);
  let accepted;
  const ingest=createMobileTelemetryIngest({persistBatch:async({events})=>{
    accepted=events;return {accepted:events.map(x=>x.eventId),newlyInserted:events.length};
  }},{GAFUS_TELEMETRY_INGEST_ENABLED:'true',GAFUS_TELEMETRY_ENVIRONMENT:'production',GAFUS_TELEMETRY_PRODUCTION_APPROVED:'true'});
  const ack=await ingest.acceptBatch('Bearer '+'x'.repeat(43),{schemaVersion:1,events:batch});
  assert.equal(ack.newlyInserted,1);
  const r=record(accepted[0],{status:'ota',revision:15,sourceSha:'a'.repeat(40)});
  const a=attributes(r);
  assert.equal(a['gafus.error_code'],source.code);
  assert.equal(a['gafus.operation'],source.operation);
  assert.equal(a['gafus.module'],source.module);
  assert.equal(a['gafus.ota_revision'],'15');
  assert.equal(a['gafus.source_sha'],'a'.repeat(40));
  assert.equal(a['gafus.installation_id'],uuid(4));
  assert.match(a['exception.stacktrace'],/bundle:1:12345678/);
  assert.equal(queue.applyTelemetryAck(pending,ack.accepted).entries.length,0);
  await assert.rejects(ingest.acceptBatch('Bearer '+'x'.repeat(43),{schemaVersion:1,events:[{...e,screen:'PRIVATE'}]}));
});

test('fingerprint stable across release/installation and separates unknown/native sources',()=>{
  const a=attributes(record(coded()))['gafus.error_fingerprint'];
  const b=attributes(record({...coded(),updateId:uuid(99),installationId:uuid(80),build:'102'}))['gafus.error_fingerprint'];
  assert.equal(a,b);
  const x={...event(),errorCode:'JS_UNKNOWN',stack:'at first (bundle:1:34)'};
  const y={...x,stack:'at second (bundle:1:34)'};
  assert.notEqual(attributes(record(x))['gafus.error_fingerprint'],attributes(record(y))['gafus.error_fingerprint']);
  const session={...event(),kind:'session_start',severity:'INFO'};
  assert.equal(attributes(record(session))['gafus.error_fingerprint'],undefined);
  assert.equal(record(session).body.stringValue,'session_start');
});

test('queue evicts DEBUG before INFO/WARN/ERROR/FATAL',()=>{
  const now=Date.now();
  const entries=Array.from({length:queue.TELEMETRY_MAX_EVENTS},(_,i)=>({
    event:{...event(),eventId:uuid(i+10),severity:i===1?'DEBUG':'ERROR'},enqueuedAt:now,attempts:0
  }));
  const result=queue.enqueueTelemetryEvent({schemaVersion:1,entries,dropped:0},{...event(),severity:'FATAL'},now);
  assert.equal(result.entries.length,queue.TELEMETRY_MAX_EVENTS);
  assert.equal(result.dropped,1);
  assert.equal(result.entries.some(e=>e.event.severity==='DEBUG'),false);
  assert.equal(result.entries.some(e=>e.event.severity==='FATAL'),true);
});

test('server release lookup uses full verified native scope, not client revision',async()=>{
  let where;
  const repo=loadSource('packages/mobile-ota-server/src/diagnostics-spool-repository.ts',{
    '@gafus/types':types,
    '@gafus/prisma':{prisma:{mobileOtaRelease:{findFirst:async({where:w})=>{where=w;return {revision:12,sourceSha:'b'.repeat(40)};}},mobileNativeRelease:{findMany:async()=>[]}}}
  });
  const e=event();
  const result=await repo.resolveTelemetryRelease({...e,environment:'production'});
  assert.deepEqual(result,{status:'ota',revision:12,sourceSha:'b'.repeat(40)});
  assert.equal(where.updateId,e.updateId);
  assert.equal(where.nativeRelease.verified,true);
  assert.equal(where.nativeRelease.buildNumber,'101');
  assert.equal(where.nativeRelease.appVersion,'1.7.5');
});

test('invalid singleton cannot poison the queue indefinitely',()=>{
  const now=Date.now(), good={...event(),eventId:uuid(22),errorCode:'DISTINCT_FAILURE'};
  let state=queue.enqueueTelemetryEvent(queue.emptyTelemetryQueue(),event(),now);
  state=queue.enqueueTelemetryEvent(state,good,now);
  for(let i=0;i<3;i++)state=queue.markTelemetryRejected(state,event().eventId);
  assert.equal(state.dropped,1);
  assert.deepEqual(state.entries.map(x=>x.event.eventId),[good.eventId]);
});

test('HTTP 500 correlates with a server trace without copying route parameters',()=>{
  const api=loadSource('apps/mobile/src/shared/lib/api/apiDiagnostics.ts',{'@gafus/types':types,'expo-crypto':{randomUUID:require('node:crypto').randomUUID}});
  const id='a'.repeat(32);
  const http=api.buildMobileHttpDiagnostic({
    endpoint:'/api/v1/pets/privateId/vet-visits?token=secret',
    method:'GET',category:'server',startedAt:Date.now()-30,retried:true,
    response:new Response('{}',{status:500,headers:{'X-Trace-Id':id}})
  });
  assert.equal(http.endpointGroup,'PETS');
  assert.equal(http.serverTraceId,id);
  assert.equal(http.retryCount,1);
  assert.doesNotMatch(JSON.stringify(http),/privateId|secret/);
  const r=record({...event(),http});
  assert.equal(r.traceId,id);
  assert.equal(attributes(r)['http.response.status_code'],'500');
  assert.throws(()=>types.parseMobileTelemetryEvent({...event(),http:{...http,body:'secret'}}),/TELEMETRY_HTTP/);
});

test('private immutable source map resolves TypeScript and refuses a mismatched release',async()=>{
  const {createHash}=require('node:crypto');
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const maps=loadSource('packages/worker/src/mobile-telemetry-symbolication.ts');
  const scope={environment:'production',platform:'ios',runtime:'1.7.5',updateId:uuid(3),
    revision:15,sourceSha:'a'.repeat(40)};
  const bytes=Buffer.from(JSON.stringify({version:3,
    sources:['/Users/runner/private/apps/mobile/src/features/training/api.ts'],
    names:['loadSteps'],mappings:'AAAAA',sourcesContent:['VERY_PRIVATE_SOURCE_CONTENT']}));
  const sha256=hash(bytes);
  const manifest=Buffer.from(JSON.stringify({
    schemaVersion:1,private:true,retentionClass:'release-symbols',
    environment:scope.environment,platform:scope.platform,runtimeVersion:scope.runtime,
    updateId:scope.updateId,revision:scope.revision,sourceSha:scope.sourceSha,
    maps:[{filename:sha256+'.map',sha256,sizeBytes:bytes.length}]
  }));
  scope.symbolsRef='symbols-s3:'+hash(manifest);
  const reader=async key=>key.endsWith('manifest.json')?manifest:bytes;
  const map=await maps.loadMobileReleaseSourceMap(reader,scope);
  const symbolize=maps.createMobileSymbolicator(reader);
  const sample={...event(),platform:scope.platform,runtime:scope.runtime,updateId:scope.updateId,stack:'at t (bundle:1:0)'};
  const release={...scope,status:'ota'};
  assert.equal((await symbolize(sample,release,scope.environment,()=>false)).status,'unavailable');
  assert.equal((await symbolize(sample,release,scope.environment,()=>true)).status,'symbolicated');
  assert.equal((await symbolize(sample,release,scope.environment,()=>false)).status,'symbolicated');
  const result=maps.symbolicateMobileStack('at t (bundle:1:0)',map);
  assert.equal(result.status,'symbolicated');
  assert.match(result.stack,/apps\/mobile\/src\/features\/training\/api.ts:1:1/);
  assert.doesNotMatch(result.stack,/Users|runner|PRIVATE/);
  const r=record({...event(),stack:'at t (bundle:1:0)'});
  const withSymbols=worker.buildMobileOtlpLog({eventId:event().eventId,environment:'production',
    service:'gafus-mobile-ios',payload:{...event(),stack:'at t (bundle:1:0)'},attempts:0,symbolication:result})
    .resourceLogs[0].scopeLogs[0].logRecords[0];
  assert.match(attributes(withSymbols)['exception.stacktrace'],/api.ts:1:1/);
  assert.equal(attributes(withSymbols)['gafus.bundle_stacktrace'],'at t (bundle:1:0)');
  assert.match(attributes(r)['exception.stacktrace'],/bundle:1:0/);
  await assert.rejects(maps.loadMobileReleaseSourceMap(reader,{...scope,revision:16}),/MANIFEST_SCOPE/);
  await assert.rejects(maps.loadMobileReleaseSourceMap(async key=>key.endsWith('manifest.json')?manifest:Buffer.from('wrong map'),scope),/MAP_HASH/);
});

test('queue merges repeated unsent failures but never mutates a dispatched event ID',()=>{
  const now=Date.now(), first={...event(),stack:'at f (bundle:1:123)'};
  const second={...first,eventId:uuid(55)};
  let q=queue.enqueueTelemetryEvent(queue.emptyTelemetryQueue(),first,now);
  q=queue.enqueueTelemetryEvent(q,second,now+5);
  assert.equal(q.entries.length,1);
  assert.equal(q.entries[0].event.occurrences,2);
  assert.equal(q.entries[0].event.eventId,first.eventId);
  q=queue.markTelemetryDispatched(q,queue.nextTelemetryBatch(q));
  q=queue.enqueueTelemetryEvent(q,{...first,eventId:uuid(56)},now+10);
  assert.equal(q.entries.length,2);
  const attributesOf=attributes(record(q.entries[0].event));
  assert.equal(attributesOf['gafus.occurrences'],'2');
  assert.equal(attributesOf['grouping.fingerprint'],attributesOf['gafus.error_fingerprint']);
});

test('sampled histogram buffer and worker metrics are bounded and aggregate by operation only',()=>{
  const perf=loadSource('apps/mobile/src/shared/lib/telemetry/mobilePerformance.ts',{'@gafus/types':types});
  const buffer=perf.createMobilePerformanceBuffer(true);
  buffer.record('API_COURSES',40);
  buffer.record('API_COURSES',350);
  buffer.record('private-user-id',3);
  const samples=buffer.take();
  assert.equal(samples.length,1);
  assert.equal(samples[0].count,2);
  assert.equal(samples[0].sumMs,390);
  assert.equal(samples[0].buckets.reduce((a,b)=>a+b),2);
  const parsed=types.parseMobileTelemetryEvent({...event(),kind:'performance_summary',severity:'INFO',performance:samples});
  assert.deepEqual(parsed.performance,samples);
  assert.throws(()=>types.parseMobileTelemetryEvent({...parsed,performance:[{...samples[0],count:5}]}),/TELEMETRY_PERFORMANCE/);
  const workerPerf=loadSource('packages/worker/src/mobile-telemetry-performance.ts',{'@gafus/types':types});
  workerPerf.addMobilePerformance('ios',parsed.performance);
  const metrics=workerPerf.renderMobilePerformance('production').join('\n');
  assert.match(metrics,/operation="API_COURSES",le="50"} 1/);
  assert.match(metrics,/operation="API_COURSES",le="500"} 2/);
  assert.match(metrics,/duration_ms_sum\{[^}]*} 390/);
  assert.doesNotMatch(metrics,/private-user-id|installation_id|update_id/);
  assert.equal(record(parsed).body.stringValue,'performance_summary');
});

test('scope isolation preserves old OTA events on same native build but excludes incompatible binaries',()=>{
  const now=Date.now(),e=event();
  let state=queue.emptyTelemetryQueue();
  for(const x of [e,{...e,eventId:uuid(65),updateId:uuid(66),errorCode:'OTHER_FAILURE'},
    {...e,eventId:uuid(67),build:'100'},{...e,eventId:uuid(68),platform:'android'}])
    state=queue.enqueueTelemetryEvent(state,x,now);
  const scoped=queue.restrictTelemetryQueue(state,e);
  assert.equal(scoped.incompatible,2);
  assert.equal(scoped.state.dropped,2);
  assert.equal(scoped.state.entries.length,2);
  assert.ok(scoped.state.entries.some(row=>row.event.updateId===uuid(66)));
});

test('client health is strict, bounded and not grouped as an application error',()=>{
  const health={dropped:3,incompatible:2,storageReadFailures:1,storageWriteFailures:0,uploadFailures:2,invalidQueue:0,pending:4,oldestMs:600000};
  const e={...event(),kind:'telemetry_health',severity:'INFO',health};
  const parsed=types.parseMobileTelemetryEvent(e);
  assert.deepEqual(parsed.health,health);
  const a=attributes(record(parsed));
  assert.equal(a['gafus.telemetry_health.dropped'],'3');
  assert.equal(a['gafus.error_fingerprint'],undefined);
  assert.throws(()=>types.parseMobileTelemetryEvent({...e,health:{...health,token:'secret'}}),/TELEMETRY_HEALTH/);
  assert.throws(()=>types.parseMobileTelemetryEvent({...e,health:{...health,pending:501}}),/TELEMETRY_HEALTH/);
});

test('HTTP request without server response retains an independent correlation link',()=>{
  const api=loadSource('apps/mobile/src/shared/lib/api/apiDiagnostics.ts',{'@gafus/types':types,'expo-crypto':{randomUUID:require('node:crypto').randomUUID}});
  const one=api.newMobileTraceparent(),two=api.newMobileTraceparent();
  assert.ok(types.parseMobileTraceparent(one));assert.notEqual(one,two);
  const http=api.buildMobileHttpDiagnostic({endpoint:'/api/v1/auth/refresh',method:'POST',category:'timeout',
    startedAt:Date.now()-50,retried:false,clientTraceparent:one});
  const log=record({...event(),http});
  assert.equal(log.traceId,one.split('-')[1]);
  assert.equal(attributes(log)['gafus.client_trace_id'],one.split('-')[1]);
  assert.equal(attributes(log)['gafus.server_trace_id'],undefined);
});

test('multiple Hermes maps require exact bundle identity; embedded maps require native artifact hash',async()=>{
  const maps=loadSource('packages/worker/src/mobile-telemetry-symbolication.ts');
  const sha=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const id1='a'.repeat(32),id2='b'.repeat(32);
  const one=Buffer.from(JSON.stringify({version:3,sources:['src/a.ts'],names:['first'],mappings:'AAAAA'}));
  const two=Buffer.from(JSON.stringify({version:3,sources:['src/b.ts'],names:['second'],mappings:'AAAAA'}));
  const item=(id,bytes)=>({logicalBundle:'entry-'+id+'.hbc',filename:sha(bytes)+'.map',sha256:sha(bytes),sizeBytes:bytes.length});
  const scope={environment:'production',platform:'ios',runtime:'1.7.5',updateId:uuid(3),revision:0,
    sourceSha:'c'.repeat(40),nativeBuild:'101',nativeArtifactSha256:'d'.repeat(64)};
  const manifest=Buffer.from(JSON.stringify({schemaVersion:1,private:true,retentionClass:'release-symbols',
    environment:scope.environment,platform:scope.platform,runtimeVersion:scope.runtime,updateId:scope.updateId,
    sourceSha:scope.sourceSha,revision:0,nativeBuild:scope.nativeBuild,nativeArtifactSha256:scope.nativeArtifactSha256,
    maps:[item(id1,one),item(id2,two)]}));
  scope.symbolsRef='symbols-s3:'+sha(manifest);
  const reader=async key=>{assert.match(key,/\/embedded\/101\//);return key.endsWith('manifest.json')?manifest:key.endsWith(sha(one)+'.map')?one:two;};
  await assert.rejects(maps.loadMobileReleaseSourceMap(reader,scope),/AMBIGUOUS/);
  const stack=types.sanitizeMobileStack('at t (address at /private/entry-'+id2+'.hbc:1:0)');
  assert.equal(stack,'at t (bundle-'+id2+':1:0)');
  assert.equal(types.sanitizeMobileStack(stack),stack);
  const mapped=await maps.createMobileSymbolicator(reader)({...event(),stack},
    {...scope,status:'embedded',embeddedUpdateId:scope.updateId},'production');
  assert.equal(mapped.status,'symbolicated');
  assert.match(mapped.stack,/apps\/mobile\/src\/b.ts/);
  await assert.rejects(maps.loadMobileReleaseSourceMap(reader,{...scope,nativeArtifactSha256:'e'.repeat(64)},id2),/SCOPE/);
});

test('stress: bounded queue survives 1000 events, prioritizes fatal, and never exceeds batch size',()=>{
  const now=Date.now(),begin=performance.now();
  let q=queue.emptyTelemetryQueue();
  const stack=Array.from({length:48},(_,i)=>'at fn'+i+' (bundle:1:'+(123456+i)+')').join('\n');
  for(let i=1;i<=1000;i++){
    const e={...event(),eventId:uuid(1000+i),severity:i%100===0?'FATAL':'WARN',
      kind:i%100===0?'js_fatal':'js_handled',errorCode:'QA_LOAD',stack,
      appStartId:uuid(10000+i)};
    q=queue.enqueueNormalizedTelemetryEvent(q,types.parseMobileTelemetryEvent(e),now);
  }
  assert.equal(q.entries.length,500);
  assert.equal(q.dropped,500);
  assert.equal(q.entries.filter(x=>x.event.severity==='FATAL').length,10);
  assert.ok(JSON.stringify(q).length*2<=queue.TELEMETRY_MAX_BYTES);
  let batches=0;
  while(q.entries.length){
    const batch=queue.nextTelemetryBatch(q);
    assert.ok(batch.length>0&&batch.length<=50);
    assert.ok(JSON.stringify({schemaVersion:1,events:batch}).length*2<=queue.TELEMETRY_BATCH_BYTES);
    q=queue.applyTelemetryAck(q,batch.map(e=>e.eventId));batches++;
  }
  console.log('bounded queue stress 1000 events:',Math.round(performance.now()-begin),'ms, batches',batches);
});

test('sampled operation timing preserves successful values and original rejection',async()=>{
  const old=process.env.EXPO_PUBLIC_TELEMETRY_ENABLED,random=Math.random;
  let perf;
  try {
    process.env.EXPO_PUBLIC_TELEMETRY_ENABLED='true';
    Math.random=()=>0;
    perf=loadSource('apps/mobile/src/shared/lib/telemetry/mobilePerformance.ts',{'@gafus/types':types});
  } finally {
    Math.random=random;
    if(old===undefined)delete process.env.EXPO_PUBLIC_TELEMETRY_ENABLED;
    else process.env.EXPO_PUBLIC_TELEMETRY_ENABLED=old;
  }
  const value={ok:true};
  const failure=new Error('private details');
  assert.equal(await perf.measureMobileOperation('TRAINING_STEPS_LOAD',async()=>value),value);
  await assert.rejects(perf.measureMobileOperation('CHAT_SEND',async()=>{throw failure}),e=>e===failure);
  const samples=perf.mobilePerformance.take();
  assert.deepEqual(samples.map(s=>[s.metric,s.count]),[['TRAINING_STEPS_LOAD',1],['CHAT_SEND',1]]);
  assert.deepEqual(types.parseMobileTelemetryEvent({...event(),kind:'performance_summary',severity:'INFO',performance:samples}).performance,samples);
});

test('failure monitoring uses fixed domains, occurrence counts and separate environments',()=>{
  const metrics=loadSource('packages/worker/src/mobile-telemetry-failure-metrics.ts',{'@gafus/types':types});
  const buffer=metrics.createMobileFailureMetrics();
  buffer.add('production',{...coded(),severity:'ERROR',occurrences:4});
  buffer.add('production',{...event(),kind:'startup_failure',severity:'FATAL'});
  buffer.add('production',{...event(),kind:'native_crash',severity:'FATAL'});
  buffer.add('production',{...event(),errorCode:'PRIVATE_DYNAMIC_ID',severity:'ERROR'});
  buffer.add('production',{...coded(),severity:'WARN',occurrences:100});
  buffer.add('preview',{...coded(),severity:'ERROR',occurrences:9});
  const output=buffer.render('production').join('\n');
  assert.match(output,/platform="ios",domain="training"} 4/);
  assert.match(output,/platform="ios",domain="startup"} 1/);
  assert.match(output,/platform="ios",domain="native"} 1/);
  assert.match(output,/platform="ios",domain="other"} 1/);
  assert.doesNotMatch(output,/PRIVATE_DYNAMIC_ID|preview|installation_id|update_id/);
  assert.match(buffer.render('preview').join('\n'),/platform="ios",domain="training"} 9/);
  assert.equal(output.split('\n').filter(l=>l.startsWith('gafus_mobile_diagnostic_failure_occurrences_total{')).length,26);
});

test('data-ready tracker measures committed content once per foreground visit',()=>{
  const {createScreenDataReadyTracker}=loadSource('apps/mobile/src/shared/lib/telemetry/screenDataReadyTracker.ts');
  let now=100,active=true,next=0;
  const scheduled=new Map(),samples=[];
  const tracker=createScreenDataReadyTracker({
    now:()=>now, isActive:()=>active,
    requestFrame:cb=>{scheduled.set(++next,cb);return next;},
    cancelFrame:id=>scheduled.delete(id),
    record:ms=>samples.push(ms),
  });
  const frame=()=>{const callbacks=[...scheduled.values()];scheduled.clear();callbacks.forEach(cb=>cb());};
  tracker.begin();
  now=300;frame();
  assert.deepEqual(samples,[],'request completion alone cannot record');
  tracker.setReady(true);now=316;frame();
  assert.deepEqual(samples,[],'wait for content presentation');
  now=332;frame();
  assert.deepEqual(samples,[232]);
  tracker.setReady(false);tracker.setReady(true);frame();frame();
  assert.deepEqual(samples,[232],'polling/refetch cannot duplicate a completed visit');
  now=500;tracker.begin();now=516;frame();now=532;frame();
  assert.deepEqual(samples,[232,32],'cached data can be ready on re-entry');
  tracker.end();
  now=700;tracker.begin();tracker.setReady(false);frame();frame();
  assert.deepEqual(samples,[232,32],'loading/error transition cancels scheduled sample');
  tracker.setReady(true);frame();
  const stale=[...scheduled.values()];
  tracker.end();stale.forEach(cb=>cb());
  assert.deepEqual(samples,[232,32],'blur/unmount prevents stale callbacks');
  active=false;tracker.begin();tracker.setReady(true);frame();frame();
  assert.deepEqual(samples,[232,32],'background cannot produce a sample');
});

test('screen data-ready metrics are allowlisted, survive transport and have no route IDs',()=>{
  const perf=loadSource('apps/mobile/src/shared/lib/telemetry/mobilePerformance.ts',{'@gafus/types':types});
  const buffer=perf.createMobilePerformanceBuffer(true);
  const names=types.mobilePerformanceMetrics.filter(m=>/^SCREEN_.+_DATA_READY$/.test(m));
  assert.equal(names.length,22);
  for(const name of names)buffer.record(name,123);
  buffer.record('SCREEN_PRIVATE_ACCOUNT_DATA_READY',9);
  const samples=buffer.take();
  assert.equal(samples.length,22);
  const parsed=types.parseMobileTelemetryEvent({...event(),kind:'performance_summary',severity:'INFO',performance:samples});
  assert.deepEqual(parsed.performance,samples);
  assert.throws(()=>types.parseMobileTelemetryEvent({...parsed,performance:[{...samples[0],metric:'SCREEN_PRIVATE_ACCOUNT_DATA_READY'}]}),/TELEMETRY_PERFORMANCE/);
});

test('historical native terminations use explicit OS reason and never a current OTA/session',()=>{
  const {normalizeNativeTermination}=loadSource('apps/mobile/src/shared/lib/telemetry/nativeTerminationReports.ts',{'@gafus/types':types});
  const now=Date.now(),base=event();
  const input={id:base.eventId,code:'IOS_MEMORY_EXIT',timestampMs:now-120000,count:3,
    appVersion:base.appVersion,build:base.build,secret:'private path'};
  const result=normalizeNativeTermination(input,base,now);
  assert.equal(result.kind,'oom');
  assert.equal(result.severity,'FATAL');
  assert.equal(result.updateId,'unknown');
  assert.equal(result.appStartId,result.eventId);
  assert.equal(result.occurrences,3);
  assert.equal(result.stack,undefined);
  assert.doesNotMatch(JSON.stringify(result),/private path/);
  assert.equal(normalizeNativeTermination({...input,build:'999999'},base,now),undefined);
  assert.equal(normalizeNativeTermination({...input,code:'ANDROID_ANR_EXIT'},base,now),undefined);
  assert.equal(normalizeNativeTermination({...input,timestampMs:now+1},base,now),undefined);
  assert.equal(normalizeNativeTermination({...input,code:'IOS_HANG_DIAGNOSTIC',count:1},base,now).kind,'native_hang');
  assert.throws(()=>types.parseMobileTelemetryEvent({...base,updateId:'unknown'}),/TELEMETRY_UPDATE_ID/);
});
