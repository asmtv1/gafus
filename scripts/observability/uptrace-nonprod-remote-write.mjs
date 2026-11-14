#!/usr/bin/env node
/**
 * Isolated single-sample Prometheus remote_write smoke for Uptrace Nonprod.
 * Fixed series with no per-user/session/trace labels. Raw Snappy protobuf
 * (not Snappy framed stream) per Prometheus remote write 1.0.
 * DSN is read only from the dedicated 0600 Nonprod secret file.
 */
import {pathToFileURL} from 'node:url';
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';
const ENDPOINT='https://api.uptrace.dev/api/v1/prometheus/write';
const NAME='gafus_nonprod_prom_rw_canary';
function uvarint(value) {
 let n=BigInt(value);
 if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('UNSAFE_VARINT');
 const out=[];
 while(n>=128n){out.push(Number(n&127n)|128);n>>=7n;}
 out.push(Number(n));return Buffer.from(out);
}
const field=(index,wire)=>uvarint((index<<3)|wire);
const lenField=(index,bytes)=>Buffer.concat([field(index,2),uvarint(bytes.length),bytes]);
const textField=(index,str)=>lenField(index,Buffer.from(str,'utf8'));
const label=(name,value)=>lenField(1,Buffer.concat([textField(1,name),textField(2,value)]));
const sample=(now)=> {
 const val=Buffer.allocUnsafe(8);
 val.writeDoubleLE(1,0);
 return lenField(2,Buffer.concat([field(1,1),val,field(2,0),uvarint(now)]));
};
export function writeRequest(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<1_700_000_000_000||now>3_000_000_000_000)
   throw Error('CANARY_TIME_INVALID');
 const timeseries=Buffer.concat([
  label('__name__',NAME),
  label('environment','preview'),
  label('job','gafus-nonprod-canary'),
  sample(now),
 ]);
 return lenField(1,timeseries);
}
export function snappyLiteral(bytes) {
 // Only literal snappy tags, not COPY blocks. Small synthetic payload.
 if(!Buffer.isBuffer(bytes)||bytes.length>65535)throw Error('SNAPPY_CANARY_SIZE');
 const length=bytes.length, header=uvarint(length);
 const tag=length<=60?Buffer.from([(length-1)<<2]):Buffer.from([
   0xf0, (length-1)&255,
 ]);
 // 0xf0 = (59+1) << 2; for 1 byte length encoding up to 256.
 const fixedTag=length<=60?tag:length<=256?tag:Buffer.from([
   0xf4,(length-1)&255,((length-1)>>8)&255,
 ]);
 return Buffer.concat([header,fixedTag,bytes]);
}
export async function sendRemoteWrite({now=Date.now(),fetchImpl=fetch,dsn}={}) {
 if(!dsn)dsn=await readCanaryDsn();
 const compressed=snappyLiteral(writeRequest(now));
 const response=await fetchImpl(ENDPOINT,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
  headers:{
   'content-type':'application/x-protobuf',
   'content-encoding':'snappy',
   'x-prometheus-remote-write-version':'0.1.0',
   'uptrace-dsn':dsn,
  },
  body:compressed,
 });
 return {project:9383,metric:NAME,httpStatus:response.status,accepted:response.ok};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 sendRemoteWrite().then(result=>{
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.accepted)process.exitCode=3;
 }).catch(()=>{console.error('NONPROD_REMOTE_WRITE_UNAVAILABLE');process.exitCode=4;});
}
