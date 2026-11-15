import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installServerErrorSink,emitServerErrorSignal,safeServerErrorFrames} from '../dist/diagnosticSink.js';
import {UnifiedLogger} from '../dist/UnifiedLogger.js';

test('logger bridge reports only safe error classes, never secret stack/message',()=>{
 const rows=[];
 installServerErrorSink(row=>rows.push(row));
 try {
   emitServerErrorSignal('error',new TypeError('Bearer PRIVATE-JWT user@example.com'));
   const hostile=new Error('https://private.example?token=SECRET');
   hostile.name='Contact-private-user@example.com';
   emitServerErrorSignal('error',hostile);
   emitServerErrorSignal('fatal',hostile);
   assert.deepEqual(rows.map(({level,errorCode})=>({level,errorCode})),[
    {level:'error',errorCode:'TYPE_ERROR'},
    {level:'error',errorCode:'LOGGER_ERROR'},
    {level:'fatal',errorCode:'LOGGER_FATAL'},
   ]);
   assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|Bearer|Contact|private.example|example.com|SECRET/);
 } finally {installServerErrorSink(null);}
});
test('existing UnifiedLogger.error/fatal reach the bridge with no raw metadata',()=>{
 const rows=[];
 installServerErrorSink(row=>rows.push(row));
 // Production stdout logging stays unchanged, but we must not
 // include raw message, stack, meta or user ID in the NEW OTLP bridge.
 const logger=new UnifiedLogger({
   appName:'web',environment:'test',level:'debug',enableConsole:false,
   context:'telemetry-test',
 });
 try {
   logger.error('SYNTHETIC_TEST_ERROR',new RangeError('synthetic'));
   logger.fatal('SYNTHETIC_TEST_FATAL',new ReferenceError('synthetic'));
   assert.deepEqual(rows.map(({level,errorCode})=>({level,errorCode})),[
    {level:'error',errorCode:'RANGE_ERROR'},
    {level:'fatal',errorCode:'LOGGER_FATAL'},
   ]);
 } finally {installServerErrorSink(null);}
});
test('broken diagnostic sink cannot break business logger',()=>{
 installServerErrorSink(()=>{throw new Error('sink unavailable');});
 try{assert.doesNotThrow(()=>emitServerErrorSignal('error',new Error('unavailable')));}
 finally{installServerErrorSink(null);}
});

test('server stack sanitizer retains only verified function offsets',()=>{
 const err=new TypeError('Authorization: Bearer PRIVATE_TEST_TOKEN user@private.example');
 err.stack='TypeError: Bearer PRIVATE_TEST_TOKEN user@private.example\n'+
  '    at getOrder (/Users/asmtv1/Work/private/foo/order.ts:167:11)\n'+
  '    at Service.write (https://api.example/private?token=PRIVATE:27:2)\n'+
  '    at 123badname (/Users/private/server.js:123:2)\n'+
  '    at otherFunction (file:///Users/personal/private.ts:500:9)';
 const safe=safeServerErrorFrames(err);
 assert.equal(safe,'at getOrder (code:167:11)\nat Service.write (code:27:2)\nat otherFunction (code:500:9)');
 assert.doesNotMatch(safe,/PRIVATE|Bearer|example|Users|api\.example|private|Authorization|token|@|\/|:SECRET/i);
 const rows=[];
 installServerErrorSink(row=>rows.push(row));
 try{
  emitServerErrorSignal('error',err);
  assert.equal(rows[0].stackFrames,safe);
  assert.equal(rows[0].errorCode,'TYPE_ERROR');
 }finally{installServerErrorSink(null);}
});
