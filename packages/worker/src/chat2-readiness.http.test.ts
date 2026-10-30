/** Actual worker HTTP liveness vs Chat2 readiness, loopback only. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { startHealthServer } from './health-server';
import { recordChat2PollSuccess, resetChat2PollReadiness } from './chat2-readiness';

let server: Server, url: string;
beforeAll(async () => {
  vi.stubEnv('WORKER_HEALTH_PORT','0');
  server = startHealthServer();
  if (!server.listening) await once(server,'listening');
  const a = server.address();
  if (!a || typeof a === 'string') throw Error('WORKER_LOCAL_HTTP_PORT_MISSING');
  url = `http://127.0.0.1:${a.port}`;
});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();});
afterEach(()=>{resetChat2PollReadiness();vi.unstubAllEnvs();});
const env = () => {
  vi.stubEnv('CHAT2_WORKER_ENABLED','enabled');
  vi.stubEnv('CHAT2_CENTRIFUGO_API_KEY','stage-only-opaque-key');
};
const privateGet = (token='stage-only-opaque-key') => fetch(url+'/internal/chat2/ready',{
  headers:{'X-Chat2-Readiness-Key':token},signal:AbortSignal.timeout(2500),
});
describe('worker Chat2 internal HTTP readiness (real TCP)',()=>{
  it('generic health stays 200 but missing worker tick is 503',async()=>{
    env();
    const basic = await fetch(url+'/health');
    expect(basic.status).toBe(200);
    const chat = await privateGet();
    expect(chat.status).toBe(503);
    expect(await chat.json()).toEqual({ready:false});
  });
  it('refuses guest or wrong key (no readiness disclosure)',async()=>{
    env();recordChat2PollSuccess();
    expect((await fetch(url+'/internal/chat2/ready')).status).toBe(404);
    expect((await privateGet('bad')).status).toBe(404);
    // Same JS code-unit count as the key but more UTF-8 bytes; do not crash.
    expect((await privateGet('é'+'t'.repeat('stage-only-opaque-key'.length-1))).status).toBe(404);
    expect((await fetch(url+'/health')).status).toBe(200);
  });
  it('requires recent successful tick, not stale or disabled mode',async()=>{
    env();recordChat2PollSuccess();
    expect((await privateGet()).status).toBe(200);
    recordChat2PollSuccess(Date.now()-12_000);
    expect((await privateGet()).status).toBe(503);
    recordChat2PollSuccess();
    vi.stubEnv('CHAT2_WORKER_ENABLED','disabled');
    expect((await privateGet()).status).toBe(503);
  });
});
