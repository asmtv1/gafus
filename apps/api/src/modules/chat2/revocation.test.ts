import { afterEach, describe, expect, it, vi } from 'vitest';
import { revokeLiveRoomSubscription } from './revocation.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const configure = (endpoint: string) => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CHAT2_API_ENABLED', 'enabled');
  vi.stubEnv('CHAT2_CENTRIFUGO_HTTP_API', endpoint);
  vi.stubEnv('CHAT2_CENTRIFUGO_API_KEY', 'synthetic-test-key');
};

describe('Chat2 production subscription revocation', () => {
  it('uses the exact private Compose broker endpoint, retaining authenticated revocation', async () => {
    configure('http://chat2-centrifugo:8000/api/publish');
    const request = vi.fn(async () => new Response(JSON.stringify({ result: {} }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    await expect(revokeLiveRoomSubscription('user-test', 'room-test')).resolves.toEqual({ skipped: false });
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('http://chat2-centrifugo:8000/api/unsubscribe');
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(String(options.body))).toEqual({user: 'user-test', channel: 'chat2:room-test'});
  });
  it.each([
    'https://evil.test/api/publish',
    'http://evil.test:8000/api/publish',
    'http://chat2-centrifugo:8001/api/publish',
    'http://chat2-centrifugo:8000/api/publish?redirect=true',
    'http://user:pass@chat2-centrifugo:8000/api/publish',
  ])('never sends private broker key to %s', async endpoint => {
    configure(endpoint);
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(revokeLiveRoomSubscription('user-test','room-test')).rejects.toThrow('CHAT2_UNSAFE_REVOKE_ENDPOINT');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects broker HTTP failure (does not silently keep an ex-member subscribed)', async () => {
    configure('http://chat2-centrifugo:8000/api/publish');
    vi.stubGlobal('fetch', vi.fn(async()=>new Response(null, {status:503})));
    await expect(revokeLiveRoomSubscription('user-test','room-test')).rejects.toThrow('CHAT2_REALTIME_REVOKE_FAILED');
  });
});
