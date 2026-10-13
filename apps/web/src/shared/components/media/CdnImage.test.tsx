// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { prefers } = vi.hoisted(()=>({prefers:vi.fn()}));
vi.mock("@/shared/lib/media/serverHealth",()=>({ prefersCloudruMedia: prefers }));
import { CdnImage } from "./CdnImage";
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';

let host: HTMLDivElement;
let root: Root;
const source = "https://cdn.gafus.test/photos/ready.webp?md5=valid&expires=1999999999";
beforeEach(() => {
  prefers.mockResolvedValue(false);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  prefers.mockReset();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("signed CDN image fallback in Web", () => {
  it("uses authorized S3 immediately on server outage status, without CDN attempt", async () => {
    const serverSigned = `https://gallery-dev.gafus.ru/albums/a/b/photos/c/thumb.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
    const s3 = "https://s3.cloud.ru/gafus-gallery-private/asset?X-Amz-Signature=fresh";
    prefers.mockResolvedValue(true);
    const fallback = vi.fn(async () => ({ url: s3 }));
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    await act(async () => {
      root.render(<CdnImage source={serverSigned} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(prefers).toHaveBeenCalledWith("gallery");
    expect(fallback).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(s3);
  });
  it("never calls fallback after a confirmed 403 or 404", async () => {
    for (const status of [403, 404]) {
      const fallback = vi.fn(async () => ({ url: "https://s3.cloud.ru/example" }));
      const failed = vi.fn();
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
      await act(async () => root.render(<CdnImage key={status} source={source}
        requestFallback={fallback} onError={failed} />));
      await act(async () => {
        host.querySelector("img")?.dispatchEvent(new Event("error"));
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/media-cdn-probe?url='),
        expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
      );
      expect(failed).toHaveBeenCalledTimes(1);
      expect(host.querySelector("img")?.getAttribute("src")).toBe(source);
    }
  });
  it("starts subsequent signed Gallery images directly on fresh S3 links after 504", async () => {
    const signedSource = `https://gallery-dev.gafus.ru/albums/owner/album/photos/item/full.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 504 })));
    expect(await probeCdnOutage(signedSource, { fetcher: fetch })).toBe(true);
    vi.mocked(fetch).mockClear();
    const fallback = vi.fn(async () => ({ url: 'https://s3.cloud.ru/gallery-private/image?X-Amz-Signature=fresh' }));
    await act(async () => {
      root.render(<CdnImage source={signedSource} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://s3.cloud.ru/gallery-private/image?X-Amz-Signature=fresh');
  });
  it("switches to a short-lived signed S3 link on CDN 503, only once", async () => {
    const s3 = "https://s3.cloud.ru/gafus-gallery-private/test?X-Amz-Signature=valid";
    const fallback = vi.fn(async () => ({ url: s3 }));
    const failed = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await act(async () => root.render(<CdnImage source={source} requestFallback={fallback} onError={failed} />));
    await act(async () => {
      host.querySelector("img")?.dispatchEvent(new Event("error"));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(s3);
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(fallback).toHaveBeenCalledOnce();
  });
});
