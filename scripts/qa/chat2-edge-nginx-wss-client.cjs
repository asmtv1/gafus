#!/usr/bin/env node
/** Agent2 synthetic-only WSS client: real edge (TLS loopback), signed Centrifugo, private publish. */
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const Ws = require('ws');
const { Centrifuge } = require('centrifuge');

const target = 'wss://127.0.0.1:58355/connection/websocket';
const tlsOptions = { rejectUnauthorized: false, servername: 'gafus.ru', headers: {
  Host: 'gafus.ru', Origin: 'https://gafus.ru',
}};
function requireDisposable() {
  const env = process.env;
  assert.equal(env.GAFUS_AGENT2_EDGE_DISPOSABLE, '1');
  assert.match(env.GAFUS_AGENT2_SYNTHETIC_SITE ?? '', /^rf-a2-edge-site-[a-z0-9]{12}$/);
  assert.match(env.CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY ?? '', /^[0-9a-f]{64}$/);
  assert.match(env.CENTRIFUGO_HTTP_API_KEY ?? '', /^[0-9a-f]{64}$/);
}
const sign = (claims) => {
  const head = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${head}.${payload}`;
  return `${content}.${createHmac('sha256', process.env.CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY).update(content).digest('base64url')}`;
};
const withDeadline = (p, ms, marker) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(Error(marker)), ms)),
]);
async function checkMainSite() {
  const response = await withDeadline(new Promise((resolve, reject) => {
    const request=https.get('https://127.0.0.1:58355/',{
      headers:{Host:'gafus.ru'},rejectUnauthorized:false,servername:'gafus.ru',timeout:3000,
    }, res=>{
      const parts=[];res.on('data',b=>parts.push(b));
      res.on('end',()=>resolve({code:res.statusCode,body:Buffer.concat(parts).toString()}));
    });
    request.on('error',reject);request.on('timeout',()=>request.destroy(Error('SITE_TIMEOUT')));
  }),4500,'MAIN_SITE_TIMEOUT');
  assert.equal(response.code,200,'the real main-site proxy must remain available');
  assert.equal(response.body,'AGENT2_MAIN_SITE_OK');
  return true;
}
function wsHandshake(origin='https://gafus.ru') {
  return withDeadline(new Promise((resolve,reject)=>{
    const sock = new Ws(target,{...tlsOptions,headers:{...tlsOptions.headers,Origin:origin},handshakeTimeout:4000});
    let accepted=false;
    sock.on('upgrade',res=>{accepted=res.statusCode===101;});
    sock.once('open',()=>{sock.terminate();accepted?resolve(101):reject(Error('NOT_HTTP101'));});
    sock.once('unexpected-response',(_req,res)=>{const code=res.statusCode;res.destroy();resolve(code);});
    sock.once('error',err=>{if (!accepted)reject(Error(`WS_ERROR:${err.code||err.message}`));});
  }),5500,'WS_HANDSHAKE_TIMEOUT');
}
class EdgeSocket extends Ws {
  constructor(url, protocols){super(url,protocols,{...tlsOptions,handshakeTimeout:4000});}
}
async function publish(channel,messageId) {
  const code = `const key=process.env.CENTRIFUGO_HTTP_API_KEY;\n`+
    `fetch('http://chat2-centrifugo:8000/api/publish',{method:'POST',headers:{'X-API-Key':key,'Content-Type':'application/json'},`+
    `body:JSON.stringify({channel:${JSON.stringify(channel)},data:{messageId:${JSON.stringify(messageId)},source:'agent2-edge-qa'}}),signal:AbortSignal.timeout(4000)})`+
    `.then(async r=>{const p=await r.json();if(r.status!==200||p.error||!p.result)throw Error('PUBLISH_DENIED');console.log('BROKER_INTERNAL_PUBLISH_200')})`+
    `.catch(()=>process.exit(11));`;
  const result=execFileSync('docker',['exec','-e',`CENTRIFUGO_HTTP_API_KEY=${process.env.CENTRIFUGO_HTTP_API_KEY}`,
    process.env.GAFUS_AGENT2_SYNTHETIC_SITE,'node','-e',code],{timeout:8000,encoding:'utf8'});
  assert.match(result,/BROKER_INTERNAL_PUBLISH_200/);
}
async function checkDelivered() {
  const now=Math.floor(Date.now()/1000);
  const actor='agent2_edge_synthetic_member';
  const channel=`chat2:${randomUUID().replace(/-/g,'')}`;
  const jwt=sign({iss:'gafus-chat2',sub:actor,iat:now,exp:now+90});
  const subscribeJwt=sign({iss:'gafus-chat2',sub:actor,channel,iat:now,exp:now+90});
  const client=new Centrifuge(target,{token:jwt,websocket:EdgeSocket,timeout:4500});
  const subscription=client.newSubscription(channel,{token:subscribeJwt});
  const connected=new Promise((resolve,reject)=>{
    subscription.on('subscribed',resolve);
    subscription.on('error',e=>reject(Error('BROKER_SUBSCRIPTION_ERROR')));
    client.on('error',()=>{});
  });
  const expected=randomUUID();
  const event=new Promise((resolve,reject)=>{
    subscription.on('publication',data=>{
      if(data.data?.messageId===expected && data.data?.source==='agent2-edge-qa')resolve(data);
    });
    subscription.on('error',()=>reject(Error('BROKER_PUBLICATION_SUBSCRIPTION_ERROR')));
  });
  try {
    subscription.subscribe();client.connect();
    await withDeadline(connected,6500,'EDGE_WS_SUBSCRIBE_TIMEOUT');
    await publish(channel,expected);
    await withDeadline(event,6500,'EDGE_WS_EVENT_TIMEOUT');
    console.log('EDGE_REAL_WSS_101_SIGNED_SUBSCRIPTION_EVENT_PASS');
  } finally {client.disconnect();}
}
async function main(){
  requireDisposable();
  const mode=process.argv[2];
  if(mode==='before'){
    await checkMainSite();console.log('EDGE_MAIN_SITE_BEFORE_BROKER_200');
    const response = await wsHandshake().catch(e=>{throw Error(`BROKER_ABSENT_NEGATIVE_${e.message}`)});
    assert.notEqual(response,101,'broker missing must never claim WebSocket readiness');
    assert.notEqual(response,200,'WebSocket endpoint cannot be SPA fallback 200');
    console.log(`EDGE_BROKER_ABSENT_NOT_101_HTTP_${response}`);
  }else if(mode==='ready'){
    await checkMainSite();
    assert.equal(await wsHandshake(),101,'real TLS upgrade must pass through edge Nginx');
    console.log('EDGE_REAL_TLS_LOOPBACK_HTTP101_NOT_SPA200');
    const forbidden=await wsHandshake('https://not-allowed.invalid').catch(()=>0);
    assert.notEqual(forbidden,101,'Centrifugo must reject unapproved Origin from edge');
    console.log(`EDGE_FORBIDDEN_ORIGIN_REJECTED_${forbidden}`);
    await checkDelivered();
  }else throw Error('AGENT2_EDGE_MODE_REQUIRED');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(`AGENT2_EDGE_CLIENT_FAILURE:${e.message}`);process.exit(1);});
