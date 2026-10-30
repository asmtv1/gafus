import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat2PollIsFresh, recordChat2PollSuccess, resetChat2PollReadiness,
  hasChat2ReadinessKey, probeChat2BrokerAuth, chat2BrokerPublishUrl } from './chat2-readiness';

afterEach(() => { resetChat2PollReadiness(); vi.unstubAllEnvs(); });
const setup = () => {
  vi.stubEnv('CHAT2_WORKER_ENABLED','enabled');
  vi.stubEnv('CHAT2_CENTRIFUGO_API_KEY','k'.repeat(24));
  vi.stubEnv('CHAT2_CENTRIFUGO_HTTP_API','http://chat2-centrifugo:8000/api/publish');
  vi.stubEnv('NODE_ENV','production');
};
describe('Chat2 worker outbox freshness is not generic worker liveness', () => {
  it('never accepts start, disabled mode, stale or future heartbeat', () => {
    setup();
    expect(chat2PollIsFresh(60_000)).toBe(false);
    recordChat2PollSuccess(30_000);
    expect(chat2PollIsFresh(30_001)).toBe(true);
    expect(chat2PollIsFresh(40_001)).toBe(false);
    expect(chat2PollIsFresh(29_999)).toBe(false);
    vi.stubEnv('CHAT2_WORKER_ENABLED','disabled');
    expect(chat2PollIsFresh(30_001)).toBe(false);
    resetChat2PollReadiness();
    expect(chat2PollIsFresh(30_001)).toBe(false);
  });
  it('publish and readiness share the private broker URL allowlist',()=>{
    setup();
    expect(chat2BrokerPublishUrl('http://chat2-centrifugo:8000/api/publish')?.hostname).toBe('chat2-centrifugo');
    for(const url of ['https://evil.invalid/api/publish', 'http://evil.invalid/api/publish',
      'http://chat2-centrifugo:8001/api/publish',
      'http://chat2-centrifugo:8000/api/publish?leak=1'])
      expect(chat2BrokerPublishUrl(url)).toBeNull();
  });
  it('requires a real secret matching in constant time', () => {
    setup();
    expect(hasChat2ReadinessKey('k'.repeat(24))).toBe(true);
    expect(hasChat2ReadinessKey('x'.repeat(24))).toBe(false);
    expect(hasChat2ReadinessKey('k'.repeat(23))).toBe(false);
    expect(hasChat2ReadinessKey(['k'.repeat(24)])).toBe(false);
    // 24 JS code units but 25 UTF-8 bytes; this previously threw RangeError.
    expect(hasChat2ReadinessKey('é' + 'k'.repeat(23))).toBe(false);
  });
  it('requires authenticated read-only broker API/info, not health', async () => {
    setup();
    const mock = vi.fn(async () => new Response(JSON.stringify({result:{nodes:[]}}),{status:200}));
    expect(await probeChat2BrokerAuth(mock)).toBe(true);
    const [target,init] = mock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.pathname).toBe('/api/info');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect((init.headers as Record<string,string>)['X-API-Key']).toBe('k'.repeat(24));
  });
  it.each([401,403,404,503])('broker HTTP %i is not ready',async status=>{
    setup();
    expect(await probeChat2BrokerAuth(vi.fn(async()=>new Response(null,{status})))).toBe(false);
  });
  it('rejects broker API error, timeout, or untrusted HTTPS host', async () => {
    setup();
    expect(await probeChat2BrokerAuth(vi.fn(async()=>new Response(JSON.stringify({error:{code:100}}),{status:200})))).toBe(false);
    expect(await probeChat2BrokerAuth(vi.fn(async()=>{throw Error('timed out')}))).toBe(false);
    vi.stubEnv('CHAT2_CENTRIFUGO_HTTP_API','https://evil.invalid/api/publish');
    const unreachable = vi.fn();
    expect(await probeChat2BrokerAuth(unreachable)).toBe(false);
    expect(unreachable).not.toHaveBeenCalled();
  });
});
