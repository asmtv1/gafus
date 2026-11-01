import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Hono } from 'hono';
import { mediaCdnProbeRoutes } from './media-cdn-probe.js';

// Exercise an actual loopback TCP HTTP request through the real Hono route.
// Only the upstream HEAD is simulated. This is NOT live CDN / S3 acceptance.
const nativeFetch = globalThis.fetch;
const signed = () => `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/object/v1/image/s.webp?md5=ABCDEFGHIJKLMNOPQRSTUV&expires=${Math.floor(Date.now()/1000)+100}`;
const app = new Hono();
app.use('*', async (c,next) => {
  if (c.req.header('x-local-actor') === 'allowed')
    c.set('user' as never,{id:'synthetic-local-viewer'} as never);
  await next();
});
app.route('/api/v1/media-cdn-probe', mediaCdnProbeRoutes);
let http: Server;
let base: string;
beforeAll(async () => {
  http = createServer(async (req, res) => {
    try {
      const response = await app.request(new Request(`${base}${req.url}`, {
        method: req.method, headers: req.headers as HeadersInit,
      }));
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  http.listen(0,'127.0.0.1');
  await once(http,'listening');
  const address=http.address();
  if (!address || typeof address === 'string') throw Error('LOCAL_HTTP_BIND_FAILED');
  base=`http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if(http) await new Promise<void>((resolve,reject) => http.close(e=>e?reject(e):resolve())); });
afterEach(() => vi.unstubAllGlobals());

describe('real loopback HTTP CDN probe isolation', () => {
  it('refuses guest and untrusted media before contacting any upstream', async () => {
    const upstream = vi.fn(); vi.stubGlobal('fetch',upstream);
    const guest = await nativeFetch(`${base}/api/v1/media-cdn-probe?url=${encodeURIComponent(signed())}`);
    expect(guest.status).toBe(401);
    const bad = await nativeFetch(`${base}/api/v1/media-cdn-probe?url=${encodeURIComponent('https://evil.test/private')}`,{
      headers:{'x-local-actor':'allowed'},
    });
    expect(bad.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([403,404,410,503,504])('returns true upstream %i over real HTTP, no body or storage grant',async status=>{
    const upstream = vi.fn(async () => new Response(null,{status}));
    vi.stubGlobal('fetch',upstream);
    const res = await nativeFetch(`${base}/api/v1/media-cdn-probe?url=${encodeURIComponent(signed())}`,{
      headers:{'x-local-actor':'allowed'},
    });
    expect(res.status).toBe(status);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledWith(expect.stringContaining('/media/v2/object/'),
      expect.objectContaining({method:'HEAD',credentials:'omit'}));
  });
});
