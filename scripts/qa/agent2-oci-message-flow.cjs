#!/usr/bin/env node
// Frozen built API JWT/ACL -> fresh PG outbox -> true Worker -> broker WebSocket
// -> GET/duplicate count -> worker stop -> legacy 503. Only synthetic fixtures.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const requireWeb = createRequire(resolve('apps/web-vite/package.json'));
const {Centrifuge} = requireWeb('centrifuge');
const WebSocket = requireWeb('ws');
class AllowedOriginSocket extends WebSocket {
  constructor(url,protocols){super(url,protocols,{origin:'http://127.0.0.1:5173',handshakeTimeout:5000});}
}
const namePattern = /^rf-a2-oci-(?:worker|api|proxy)-[0-9a-f]{12}$/;
const names = {
  api:process.env.GAFUS_AGENT2_OCI_API_CONTAINER,
  worker:process.env.GAFUS_AGENT2_OCI_WORKER_CONTAINER,
  proxy:process.env.GAFUS_AGENT2_OCI_PROXY_CONTAINER,
};
assert.equal(process.env.GAFUS_AGENT2_OCI_REAL_MESSAGE_FLOW,'1');
for(const [key,value] of Object.entries(names))assert.match(value??'',namePattern,`bad own ${key} container name`);
const fixtureCode=readFileSync('scripts/qa/agent2-oci-message-fixture.mjs','utf8');
const peerCode = `const fs=require('node:fs');
const v=JSON.parse(fs.readFileSync(0,'utf8'));
fetch('http://api:3001'+v.path,{method:v.method||'GET',
 headers:{...(v.token?{Authorization:'Bearer '+v.token}:{}),...(v.data?{'Content-Type':'application/json'}:{})},
 ...(v.data?{body:JSON.stringify(v.data)}:{}),signal:AbortSignal.timeout(6000)})
.then(async r=>{const body=await r.text();console.log(JSON.stringify({status:r.status,body:JSON.parse(body)}));})
.catch(e=>{console.error('AGENT2_API_INTERNAL_REQUEST_FAILED');process.exit(3)})`;
function runDocker(args,content,timeout=13000){
  return execFileSync('docker',args,{input:content,encoding:'utf8',timeout,maxBuffer:1024*1024});
}
function fixture(action,payload={}){
  const output=runDocker(['exec','-i','-e',`GAFUS_AGENT2_OCI_FIXTURE_ACTION=${action}`,names.api,'node','--input-type=module','-e',fixtureCode],JSON.stringify(payload),14000);
  return JSON.parse(output.trim());
}
function http(path,token,method='GET',data){
  const output=runDocker(['exec','-i',names.proxy,'node','-e',peerCode],JSON.stringify({path,token,method,data}),11000);
  return JSON.parse(output.trim());
}
function expectStatus(response,status,what){
  assert.equal(response.status,status,`${what}: received HTTP ${response.status}, code=${response.body?.code||'?'} (expected ${status})`);
  return response.body?.data;
}
async function eventually(fn,timeoutMs=10000,interval=225){
  const finish=Date.now()+timeoutMs;
  while(Date.now()<finish){ if(await fn())return;await new Promise(r=>setTimeout(r,interval));}
  throw Error('AGENT2_OCI_TIMEOUT_WAITING_FOR_EXPECTED_DELIVERY');
}
function wsStream(token,subToken,channel){
  const client=new Centrifuge('ws://127.0.0.1:58347/connection/websocket',{
    token,websocket:AllowedOriginSocket,timeout:5000,
  });
  const subscription=client.newSubscription(channel,{token:subToken});
  const subscribed=new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(Error('AGENT2_OCI_WS_SUBSCRIBE_TIMEOUT')),8500);
    subscription.on('subscribed',()=>{clearTimeout(t);resolve()});
    subscription.on('error',()=>{clearTimeout(t);reject(Error('AGENT2_OCI_WS_SUBSCRIBE_ERROR'))});
  });
  const publication=new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(Error('AGENT2_OCI_WS_PUBLISH_TIMEOUT')),13000);
    subscription.on('publication',evt=>{if(evt.data?.messageId){clearTimeout(t);resolve(evt.data.messageId)}});
    subscription.on('error',()=>{clearTimeout(t);reject(Error('AGENT2_OCI_WS_PUBLISH_ERROR'))});
  });
  subscription.subscribe();client.connect();
  return {client,subscribed,publication};
}
async function main(){
  const created=fixture('create');
  const {owner,member,outsider}=created.actors;
  for(const actor of [owner,member,outsider])assert.ok(actor.id&&actor.token);
  console.log('AGENT2_OCI_REAL_API_IMAGE_JWT_THREE_SYNTHETIC_ACTORS');
  expectStatus(http('/api/v1/chats'),401,'anonymous Chat2');
  const group=expectStatus(http('/api/v1/chats/groups',owner.token,'POST',{
    name:'Frozen OCI synthetic E2E',kind:'GROUP',visibility:'PRIVATE',description:'',
  }),201,'create group');
  const room=group.conversationId;
  assert.match(room,/^[a-zA-Z0-9_-]+$/);
  expectStatus(http(`/api/v1/chats/${room}/messages`,outsider.token),404,'outsider cannot read');
  expectStatus(http(`/api/v1/chats/${room}/realtime`,outsider.token),404,'outsider cannot subscribe');
  expectStatus(http(`/api/v1/chats/${room}/messages`,outsider.token,'POST',{
    clientMessageId:randomUUID(),text:'unauthorized',
  }),404,'outsider cannot send');
  const invited=http(`/api/v1/chats/${room}/invite`,owner.token,'POST',{userId:member.id});
  assert.ok([200,201].includes(invited.status),`invite status=${invited.status}`);
  expectStatus(http(`/api/v1/chats/${room}/messages`,member.token),200,'invited can read');
  console.log('AGENT2_OCI_REAL_ROOM_OUTSIDER_404_OWNER_MEMBER_ACL_PASS');
  const connection=expectStatus(http('/api/v1/chats/realtime/connect',member.token),200,'signed connect');
  const scope=expectStatus(http(`/api/v1/chats/${room}/realtime`,member.token),200,'signed channel');
  assert.match(connection.token,/^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(scope.token,/^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(scope.channel,`chat2:${room}`);
  const ws=wsStream(connection.token,scope.token,scope.channel);
  try{
    await ws.subscribed;
    console.log('AGENT2_OCI_REAL_API_SIGNED_CENTRIFUGO_SUBSCRIBED');
    const clientMessageId=randomUUID();
    const payload={clientMessageId,text:'frozen image real outbox delivery synthetic fixture'};
    const first=expectStatus(http(`/api/v1/chats/${room}/messages`,owner.token,'POST',payload),201,'first post');
    assert.match(first.id,/^[a-zA-Z0-9_-]+$/);
    console.log('AGENT2_OCI_REAL_API_POST_CREATED_OUTBOX');
    const observed=await ws.publication;
    assert.equal(observed,first.id,'real Worker WS payload must be message from actual API');
    console.log('AGENT2_OCI_TRUE_WORKER_OUTBOX_BROKER_WS_PUBLICATION_MATCH');
    const again=expectStatus(http(`/api/v1/chats/${room}/messages`,owner.token,'POST',payload),201,'idempotent post');
    assert.equal(again.id,first.id);
    await eventually(()=>{
      const row=fixture('counts',{room,messageId:first.id,clientMessageId});
      return row.messages===1 && row.outboxes===1 && row.delivered;
    },12500);
    console.log('AGENT2_OCI_REAL_PG_SINGLE_MESSAGE_SINGLE_OUTBOX_DELIVERED');
    const fresh=expectStatus(http(`/api/v1/chats/${room}/messages`,member.token),200,'fresh readback');
    assert.ok(Array.isArray(fresh));
    assert.ok(fresh.some(item=>item.id===first.id),'fresh GET must contain real published message');
    console.log('AGENT2_OCI_FRESH_AUTHORIZED_GET_MATCH_IDEMPOTENT_1');
  }finally{ws.client.disconnect();}
  const healthyLegacy=http('/api/v1/cynologist-chat');
  assert.equal(healthyLegacy.status,410,`healthy authorized cutover should be 410, got ${healthyLegacy.status}`);
  console.log('AGENT2_OCI_REAL_HEALTHY_AUTHORIZED_CUTOVER_410');
  // ONLY our self-named, disposable Worker OCI container. No other process.
  runDocker(['stop','-t','1',names.worker],undefined,13000);
  await eventually(()=>http('/api/v1/cynologist-chat').status===503,12500,400);
  console.log('AGENT2_OCI_STOP_OWN_WORKER_LEGACY_FAILCLOSED_503');
  expectStatus(http('/api/v1/chats'),401,'guest remains denied after worker stopped');
  console.log('AGENT2_OCI_FROZEN_REAL_USER_MESSAGE_E2E_PASS');
}
main().then(()=>process.exit(0)).catch(e=>{console.error('AGENT2_OCI_MESSAGE_FLOW_FAILURE:'+e.message);process.exit(1);});
