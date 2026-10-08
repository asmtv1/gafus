import { describe, expect, it, vi } from 'vitest';
import { createGalleryInternalClient } from './internal';
import { createGalleryRequestVerifier } from '@gafus/gallery-storage/hmac';
const secret = 's'.repeat(32);
describe('signed transport retries', () => {
  it('retries an ambiguous callback with fresh valid nonces and unchanged attempt token', async () => {
    const seen = new Set<string>();
    const verify = createGalleryRequestVerifier({ secret, nonces: { consume: async n => { if (seen.has(n)) return false; seen.add(n); return true; } } });
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(init!);
      expect(await verify({method: init!.method!, path: new URL(String(url)).pathname, body: init!.body as string, headers: init!.headers as Record<string,string>})).toBe(true);
      if (requests.length === 1) throw Error('NETWORK');
      return Response.json({accepted:true,status:'publishing'});
    });
    const client = createGalleryInternalClient({baseUrl:'https://core.example',secret,fetch:fetcher as typeof fetch});
    expect(await client.completeUpload({uploadId:'u',attemptToken:'attempt',sourceETag:'a'.repeat(32),width:10,height:20})).toEqual({accepted:true,status:'publishing'});
    expect(requests).toHaveLength(2);
    expect(requests[0]!.body).toBe(requests[1]!.body);
    expect(seen.size).toBe(2);
  });
  it.each([429,503])('retries HTTP %s once and returns the bare core DTO', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('',{status})).mockResolvedValueOnce(Response.json({expiredUploads:0,reconciledJobs:0,recoveredCleanupJobs:0,processUploadIds:['u']}));
    const client = createGalleryInternalClient({baseUrl:'https://core.example',secret,fetch:fetcher});
    expect((await client.maintenance(10)).processUploadIds).toEqual(['u']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry an authorization failure or report success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('',{status:403}));
    const client = createGalleryInternalClient({baseUrl:'https://core.example',secret,fetch:fetcher});
    await expect(client.claimUpload('u')).rejects.toThrow('INTERNAL_HTTP_403');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
