import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat2CanRetireLegacy } from './chat2-legacy-retirement.js';

const ready = {
  CHAT2_LEGACY_RETIRE_ENABLED: 'enabled',
  CHAT2_API_ENABLED: 'enabled', CHAT2_WORKER_ENABLED: 'enabled',
  CHAT2_PRIVATE_MEDIA_ENABLED: 'enabled',
  CHAT2_CENTRIFUGO_TOKEN_SECRET: 'a'.repeat(40),
  CHAT2_CENTRIFUGO_API_KEY: 'b'.repeat(24),
  CHAT2_PUBLIC_WS_URL: 'wss://gafus.ru/connection/websocket',
  CHAT2_CENTRIFUGO_HTTP_API: 'http://chat2-centrifugo:8000/api/publish',
};
const http = (overrides: Record<string, number | object> = {}) => vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const value = overrides[url] ?? (url.includes('/internal/chat2/ready') ? { ready: true } :
    url.endsWith('/ready') ? { status: 'ready' } : { result: { nodes: [] } });
  const status = typeof value === 'number' ? value : 200;
  return new Response(JSON.stringify(typeof value === 'number' ? { error: 'TEST_FAILURE' } : value), { status });
});
afterEach(() => vi.restoreAllMocks());
describe('legacy 410 cutover requires live replacement readiness', () => {
  it('fails closed before opt-in and for disabled/misconfigured API, worker, media, broker', async () => {
    const request = http();
    for (const change of [
      { CHAT2_LEGACY_RETIRE_ENABLED: 'disabled' },
      { CHAT2_API_ENABLED: 'disabled' }, { CHAT2_WORKER_ENABLED: 'disabled' },
      { CHAT2_PRIVATE_MEDIA_ENABLED: 'disabled' },
      { CHAT2_PUBLIC_WS_URL: 'ws://localhost/connection/websocket' },
      { CHAT2_CENTRIFUGO_HTTP_API: 'https://example.invalid/api/publish' },
    ]) expect(await chat2CanRetireLegacy({ ...ready, ...change }, request)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'API dead', path: '/ready', result: 503 },
    { name: 'API stale', path: '/ready', result: { status: 'not ready' } },
    { name: 'worker dead', path: '/internal/chat2/ready', result: 503 },
    { name: 'worker stale', path: '/internal/chat2/ready', result: { ready: false } },
    { name: 'broker auth denied', path: '/api/info', result: 401 },
    { name: 'broker misleading healthy HTTP', path: '/api/info', result: { error: { code: 100 } } },
  ])('blocks 410 with $name', async ({ path, result }) => {
    const target = path === '/ready' ? 'http://127.0.0.1:3001/ready' :
      path === '/api/info' ? 'http://chat2-centrifugo:8000/api/info' :
      'http://worker:3003/internal/chat2/ready';
    expect(await chat2CanRetireLegacy(ready, http({ [target]: result }))).toBe(false);
  });
  it('fails closed when any dependency times out or never responds', async () => {
    const failed = http();
    failed.mockImplementation(async () => { throw new DOMException('Timeout', 'TimeoutError'); });
    expect(await chat2CanRetireLegacy(ready, failed)).toBe(false);
    expect(await chat2CanRetireLegacy(ready, vi.fn(() => new Promise<Response>((_, reject) => {
      setTimeout(() => reject(Error('timeout')), 5);
    })))).toBe(false);
  });
  it('returns 410 grant only with API /ready, fresh worker and authorized broker info', async () => {
    const request = http();
    expect(await chat2CanRetireLegacy(ready, request)).toBe(true);
    const paths = request.mock.calls.map(([url]) => String(url));
    expect(paths).toEqual([
      'http://127.0.0.1:3001/ready',
      'http://worker:3003/internal/chat2/ready',
      'http://chat2-centrifugo:8000/api/info',
    ]);
    const worker = request.mock.calls[1]?.[1];
    const broker = request.mock.calls[2]?.[1];
    expect(worker?.headers).toMatchObject({ 'X-Chat2-Readiness-Key': ready.CHAT2_CENTRIFUGO_API_KEY });
    expect(broker?.headers).toMatchObject({ 'X-API-Key': ready.CHAT2_CENTRIFUGO_API_KEY });
  });
});
