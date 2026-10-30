/** Full real local Chat2 acceptance: synthetic DB/Redis/broker only.
 * No network mocking: actual Hono middleware, Prisma, worker and Centrifugo.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { app } from '../../app.js';
import { prisma } from '@gafus/prisma';
import { connection, pushQueue } from '@gafus/queues';
import { generateAccessToken } from '@gafus/auth/jwt';
import { startChat2OutboxWorker } from '../../../../../packages/worker/src/chat2-outbox-worker';
import { startHealthServer } from '../../../../../packages/worker/src/health-server';

const requireWeb=createRequire('/Users/asmtv1/Desktop/gafus-refactor/apps/web-vite/package.json');
const {Centrifuge}=requireWeb('centrifuge');
const Ws=requireWeb('ws');
const apiPort=58341;
const base=`http://127.0.0.1:${apiPort}/api/v1/chats`;
const poll=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let api:Server, worker:Server, stop:()=>void=()=>{};
const ids:string[]=[];
let owner='',member='',stranger='',room='';
let ownerJwt='',memberJwt='',strangerJwt='';
const fetchAuth=(jwt:string,path:string,method='GET',data?:object)=>fetch(base+path,{
  method, headers:{Authorization:`Bearer ${jwt}`, ...(data?{'Content-Type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{}), signal:AbortSignal.timeout(6000),
});
const json=async(r:Response)=>({status:r.status,body:await r.json() as {success?:boolean;code?:string;data?:any}});
const assertIsolation=async()=>{
  const expected='postgresql://asmtv1@127.0.0.1:55445/chat2_agent2_qa';
  if(process.env.DATABASE_URL!==expected ||process.env.REDIS_URL!=='redis://127.0.0.1:56339'||
      process.env.NODE_ENV!=='test'||process.env.GAFUS_CHAT2_FULL_ISOLATED_ACCEPTANCE!=='1'||
      process.env.CHAT2_CENTRIFUGO_HTTP_API!=='http://127.0.0.1:58339/api/publish')
    throw Error('CHAT2_FULL_ISOLATION_DENIED');
  const [{dir}]=await prisma.$queryRawUnsafe<{dir:string}[]>("select current_setting('data_directory') as dir");
  if(!dir?.includes('/.local-pg-scratch/agent2-chat2-full-')|| !dir.endsWith('/pg'))
    throw Error('CHAT2_FULL_PG_DATA_DIRECTORY_DENIED');
  if(await connection.ping()!=='PONG')throw Error('CHAT2_FULL_REDIS_DENIED');
  const health=await fetch('http://127.0.0.1:58339/health',{signal:AbortSignal.timeout(2000)});
  if(health.status!==200)throw Error('CHAT2_FULL_BROKER_UNREADY');
};
const waitFor=async(test:()=>Promise<boolean>,ms=6500)=>{
  const end=Date.now()+ms;
  while(Date.now()<end){if(await test())return;await poll(230)}
  throw Error('CHAT2_FULL_CONDITION_TIMED_OUT');
};
const startApi=async()=>{
  api=createServer(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks);
      const response=await app.request(new Request(`http://127.0.0.1:${apiPort}${req.url}`,{
        method:req.method,headers:req.headers as HeadersInit,
        ...(body.length?{body}:{}),
      }));
      response.headers.forEach((v,k)=>res.setHeader(k,v));
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch {res.writeHead(500);res.end();}
  });
  api.listen(apiPort,'127.0.0.1');
  await once(api,'listening');
};
beforeAll(async()=>{
  await assertIsolation();
  for(const label of ['owner','member','stranger']){
    const user=await prisma.user.create({data:{
      username:`agent2_chat2_${label}_${randomUUID().slice(0,8)}`,
      email:`agent2_${randomUUID()}@example.invalid`, password:'qa-no-login',
      registrationPending:false,
    },select:{id:true,username:true,role:true}});
    ids.push(user.id);
    const jwt=await generateAccessToken(user);
    if(label==='owner'){owner=user.id;ownerJwt=jwt}
    if(label==='member'){member=user.id;memberJwt=jwt}
    if(label==='stranger'){stranger=user.id;strangerJwt=jwt}
  }
  await startApi();
  worker=startHealthServer();
  await once(worker,'listening');
},45000);
afterAll(async()=>{
  stop();
  if(api)await new Promise<void>(r=>api.close(()=>r()));
  if(worker)await new Promise<void>(r=>worker.close(()=>r()));
  if(ids.length){await prisma.chat2Conversation.deleteMany({where:{createdById:owner}});
    await prisma.user.deleteMany({where:{id:{in:ids}}});}
  await prisma.$disconnect();
  await pushQueue.close();
  await connection.quit();
},45000);

describe('real isolated Hono → PostgreSQL outbox worker → signed Centrifugo websocket',()=>{
  it('authenticates actual fixtures and blocks unauthorized actor at the registered routes',async()=>{
    const anonymous=await json(await fetch(base));
    expect(anonymous.status).toBe(401);
    const created=await json(await fetchAuth(ownerJwt,'/groups','POST',{
      name:'Real isolated Chat2',kind:'GROUP',visibility:'PRIVATE',description:'',
    }));
    expect(created.status).toBe(201);
    room=created.body.data?.conversationId;
    expect(room).toMatch(/^[A-Za-z0-9_-]+$/);
    expect((await json(await fetchAuth(strangerJwt,`/${room}/messages`))).status).toBe(404);
    expect((await json(await fetchAuth(strangerJwt,`/${room}/realtime`))).status).toBe(404);
    expect((await json(await fetchAuth(strangerJwt,`/${room}/messages`,'POST',{
      clientMessageId:randomUUID(),text:'not allowed',
    }))).status).toBe(404);
    const invited=await json(await fetchAuth(ownerJwt,`/${room}/invite`,'POST',{userId:member}));
    expect([200,201]).toContain(invited.status);
    expect((await json(await fetchAuth(memberJwt,`/${room}/messages`))).status).toBe(200);
  });
  it('retains legacy 503 until actual authenticated worker heartbeat exists',async()=>{
    expect((await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat')).status).toBe(503);
    process.env.CHAT2_LEGACY_RETIRE_ENABLED='enabled';
    expect((await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat')).status).toBe(503);
    stop=startChat2OutboxWorker();
    console.log('CUTOVER_CHECK_BEGIN_WORKER');
    await waitFor(async()=>{
      const response=await fetch('http://127.0.0.1:58342/internal/chat2/ready',{
        headers:{'X-Chat2-Readiness-Key':process.env.CHAT2_CENTRIFUGO_API_KEY!},
      });
      return response.status===200;
    });
    console.log('CUTOVER_WORKER_READY_200');
    const readyApi=await fetch('http://127.0.0.1:58341/ready');
    const readyBroker=await fetch('http://127.0.0.1:58339/api/info',{
      method:'POST',headers:{'X-API-Key':process.env.CHAT2_CENTRIFUGO_API_KEY!,'Content-Type':'application/json'},body:'{}',
    });
    const legacy=await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat');
    console.log('CUTOVER_COMPONENT_STATUS',readyApi.status,readyBroker.status,legacy.status);
    await waitFor(async()=>(await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat')).status===410);
  });
  it('delivers actual authorized message via outbox to signed websocket; readback and retry are idempotent',async()=>{
    const connect=await json(await fetchAuth(memberJwt,'/realtime/connect'));
    const subscribe=await json(await fetchAuth(memberJwt,`/${room}/realtime`));
    expect(connect.status).toBe(200);
    expect(subscribe.status).toBe(200);
    const client=new Centrifuge(connect.body.data.wsUrl,{
      token:connect.body.data.token,websocket:Ws,
    });
    const sub=client.newSubscription(subscribe.body.data.channel,{token:subscribe.body.data.token});
    const publication=new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CHAT2_FULL_WS_EVENT_TIMEOUT')),8500);
      sub.on('publication',(evt:{data?:{messageId?:string}})=>{
        if(evt.data?.messageId){clearTimeout(timer);resolve(evt.data.messageId)}
      });
    });
    const subscribed=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CHAT2_FULL_WS_SUBSCRIBE_TIMEOUT')),7000);
      sub.on('subscribed',()=>{clearTimeout(timer);resolve()});
    });
    try{
      sub.subscribe();client.connect();await subscribed;
      const payload={clientMessageId:randomUUID(),text:'agent2 real fully isolated event'};
      const response=await json(await fetchAuth(ownerJwt,`/${room}/messages`,'POST',payload));
      expect(response.status).toBe(201);
      const messageId=response.body.data.id;
      const repeated=await json(await fetchAuth(ownerJwt,`/${room}/messages`,'POST',payload));
      expect(repeated.status).toBe(201);
      expect(repeated.body.data.id).toBe(messageId);
      expect(await prisma.chat2Message.count({where:{conversationId:room,clientMessageId:payload.clientMessageId}})).toBe(1);
      expect(await prisma.chat2OutboxEvent.count({where:{messageId}})).toBe(1);
      expect(await publication).toBe(messageId);
      await waitFor(async()=>Boolean((await prisma.chat2OutboxEvent.findFirst({where:{messageId}}))?.deliveredAt));
      const readback=await json(await fetchAuth(memberJwt,`/${room}/messages`));
      expect(readback.status).toBe(200);
      expect(readback.body.data.some((entry:{id:string})=>entry.id===messageId)).toBe(true);
    }finally{client.disconnect()}
  });
  it('worker stopped → stale or offline 503, and worker endpoint survives malformed auth header',async()=>{
    const Unicode='é'+'A'.repeat(process.env.CHAT2_CENTRIFUGO_API_KEY!.length-1);
    expect((await fetch('http://127.0.0.1:58342/internal/chat2/ready',{
      headers:{'X-Chat2-Readiness-Key':Unicode},
    })).status).toBe(404);
    expect((await fetch('http://127.0.0.1:58342/health')).status).toBe(200);
    stop();
    const result=await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat');
    expect(result.status).toBe(503);
    await poll(10500);
    expect((await fetch('http://127.0.0.1:58341/api/v1/cynologist-chat')).status).toBe(503);
    expect((await fetch('http://127.0.0.1:58342/health')).status).toBe(200);
  },25000);
});
