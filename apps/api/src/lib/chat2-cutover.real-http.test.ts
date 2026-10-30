/** Real TCP HTTP to the actual registered Hono legacy chat routes.
 * Replacement network calls are deterministic local fakes; never production.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { app } from '../app.js';
const rawFetch = globalThis.fetch;
const routes = [
  ['/api/v1/cynologist-chat', 'GET'],
  ['/api/v1/cynologist-chat/messages', 'POST'],
  ['/api/v1/community-chat', 'GET'],
  ['/api/v1/community-chat/rooms', 'POST'],
  ['/api/v1/stream-chat/webhook', 'POST'],
  ['/api/v1/stream-chat/webhook/event', 'POST'],
] as const;
const env = {
  CHAT2_LEGACY_RETIRE_ENABLED: 'enabled', CHAT2_API_ENABLED: 'enabled',
  CHAT2_WORKER_ENABLED: 'enabled', CHAT2_PRIVATE_MEDIA_ENABLED: 'enabled',
  CHAT2_CENTRIFUGO_TOKEN_SECRET: 'a'.repeat(40),
  CHAT2_CENTRIFUGO_API_KEY: 'b'.repeat(24),
  CHAT2_PUBLIC_WS_URL: 'wss://gafus.ru/connection/websocket',
  CHAT2_CENTRIFUGO_HTTP_API: 'http://chat2-centrifugo:8000/api/publish',
};
let server: Server, base: string;
beforeAll(async () => {
  server = createServer(async (req,res) => {
    try {
      const response = await app.request(new Request(`${base}${req.url}`, {
        method: req.method, headers: req.headers as HeadersInit,
      }));
      response.headers.forEach((v,k)=>res.setHeader(k,v));
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500);res.end(); }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const a = server.address();
  if (!a || typeof a === 'string') throw Error('LOOPBACK_REQUIRED');
  base=`http://127.0.0.1:${a.port}`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve=>server.close(()=>resolve())); });
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs(); });
const setEnv = () => { for(const [k,v] of Object.entries(env)) vi.stubEnv(k,v); };
const probe = (mode: 'ready'|'worker-dead'|'broker-denied'|'api-dead') => {
  const fetcher = vi.fn(async (input: string | URL) => {
    const url=String(input);
    if (url === 'http://127.0.0.1:3001/ready')
      return new Response(JSON.stringify({status:'ready'}),{status:mode==='api-dead'?503:200});
    if (url === 'http://worker:3003/internal/chat2/ready')
      return new Response(JSON.stringify({ready:true}),{status:mode==='worker-dead'?503:200});
    if (url === 'http://chat2-centrifugo:8000/api/info')
      return new Response(JSON.stringify({result:{nodes:[]}}),{status:mode==='broker-denied'?401:200});
    throw Error('ISOLATION_GUARD: unexpected external fetch');
  });
  vi.stubGlobal('fetch',fetcher);
  return fetcher;
};
const check = async(status:number,code:string) => {
  for(const [route,method] of routes){
    const res=await rawFetch(`${base}${route}`,{method});
    expect(res.status,`${method} ${route}`).toBe(status);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await res.json()).code).toBe(code);
  }
};
describe('Hono registered legacy chat routes over real loopback TCP',()=>{
  it('never emits 410 while first-install staging is active',async()=>{
    setEnv();vi.stubEnv('CHAT2_LEGACY_RETIRE_ENABLED','disabled');
    const remote=probe('ready');
    await check(503,'CHAT2_CUTOVER_NOT_READY');
    expect(remote).not.toHaveBeenCalled();
  });
  it('fails closed when worker is dead despite enabled flags and healthy broker',async()=>{
    setEnv();probe('worker-dead');await check(503,'CHAT2_CUTOVER_NOT_READY');
  });
  it('fails closed when API readiness is unavailable',async()=>{
    setEnv();probe('api-dead');await check(503,'CHAT2_CUTOVER_NOT_READY');
  });
  it('fails closed when broker authentication is rejected despite healthy HTTP',async()=>{
    setEnv();probe('broker-denied');await check(503,'CHAT2_CUTOVER_NOT_READY');
  });
  it('only complete simulated dependency readiness permits legacy 410',async()=>{
    setEnv();const remote=probe('ready');await check(410,'LEGACY_CHAT_RETIRED');
    expect(remote).toHaveBeenCalled();
  });
});
