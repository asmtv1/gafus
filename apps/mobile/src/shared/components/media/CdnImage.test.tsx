// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { prefers, viewerId } = vi.hoisted(()=>({prefers:vi.fn(), viewerId: { value: "test-viewer" }}));
vi.mock("@/shared/lib/media/serverHealth",()=>({ prefersCloudruMedia: prefers }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: (pick: (state: { isAuthenticated: boolean; user: { id: string } }) => unknown) =>
    pick({ isAuthenticated: true, user: { id: viewerId.value } }),
}));
import { probeCdnOutage } from '@gafus/core-client/media-delivery';
vi.mock("expo-image", () => ({
  Image: ({ source, onError }: { source?: { uri: string }; onError: () => void }) => (
    <img data-testid="native-image-adapter" src={source?.uri} onError={onError} alt="test" />
  ),
}));
import { CdnImage, isSignedCloudruFallback } from "./CdnImage";
const cdnUrl =
  `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/asset/v1/image/m.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
const signed =
  "https://s3.cloud.ru/gafus-feed-private/posts/owner/post/full.webp?X-Amz-Signature=valid";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  prefers.mockResolvedValue(false);
  viewerId.value = 'test-viewer';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  prefers.mockReset();
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Mobile authorized Cloud.ru URL shape", () => {
  it("rejects unsigned and untrusted fallback links", () => {
    expect(isSignedCloudruFallback(signed)).toBe(true);
    for (const url of [
      "https://s3.cloud.ru/gafus-feed-private/media/v2/x/v1/image/s.webp",
      "https://s3.cloud.ru.evil.test/gafus-feed-private/x?X-Amz-Signature=abc",
      "http://s3.cloud.ru/gafus-feed-private/x?X-Amz-Signature=abc",
      "https://s3.cloud.ru/other-bucket/x?X-Amz-Signature=abc",
      "https://s3.cloud.ru/gafus-feed-private/x?X-Amz-Signature=abc#fragment",
    ]) expect(isSignedCloudruFallback(url)).toBe(false);
  });
});
describe("Mobile CdnImage automatic S3 recovery", () => {
  it("does not render previous account's private image on an account switch", async () => {
    const fallback = vi.fn(async () => ({ url: signed }));
    const valid = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/asset/v1/image/m.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
    await act(async () => {
      root.render(<CdnImage cdnUrl={valid} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.querySelector('img')?.getAttribute('src')).toBe(valid);
    // Leave the new session health check unresolved; no old URL may remain.
    prefers.mockImplementation(() => new Promise(() => {}));
    viewerId.value = 'another-viewer';
    await act(async () => root.render(<CdnImage cdnUrl={valid} requestFallback={fallback} />));
    expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
  });
  it("uses authorized S3 immediately when server marks Feed down", async () => {
    const serverSigned = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/asset2/v1/image/s.webp?md5=${'B'.repeat(22)}&expires=1999999999`;
    prefers.mockResolvedValue(true);
    const fallback = vi.fn(async () => ({ url: signed }));
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    await act(async () => {
      root.render(<CdnImage cdnUrl={serverSigned} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(prefers).toHaveBeenCalledWith("feed");
    expect(fallback).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(signed);
  });
  // Verify authorization failures on a fresh circuit, before the tests
  // which intentionally activate 504 failover for the same Feed service.
  it.each([403, 404])("never bypasses CDN %s", async (status) => {
    const fallback = vi.fn(async () => ({ url: signed }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );
    const failed = vi.fn();
    await act(async () =>
      root.render(<CdnImage cdnUrl={cdnUrl} requestFallback={fallback} onError={failed} />),
    );
    await act(async () => {
      host.querySelector("img")?.dispatchEvent(new Event("error"));
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(cdnUrl);
  });
  it("uses only per-media authorized S3 on a signed CDN 410", async () => {
    const fallback = vi.fn(async () => ({ url: signed }));
    const fetcher = vi.fn(async () => new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => {
      root.render(<CdnImage cdnUrl={cdnUrl} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      host.querySelector("img")?.dispatchEvent(new Event("error"));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(fetcher).toHaveBeenCalledWith(cdnUrl, expect.objectContaining({method:"HEAD"}));
    expect(fallback).toHaveBeenCalledOnce();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(signed);
  });
  it("never requests fallback for an unsigned or untrusted CDN URL, even on HTTP 410", async () => {
    const fallback = vi.fn(async () => ({ url: signed }));
    const fetcher = vi.fn(async () => new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetcher);
    const unsigned = "https://unknown.example/media/v2/asset/v1/image/s.webp";
    const failed = vi.fn();
    await act(async () => {
      root.render(<CdnImage cdnUrl={unsigned} requestFallback={fallback} onError={failed} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(fetcher).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });
  it("switches from CDN 504 to signed Cloud.ru S3 once", async () => {
    const fallback = vi.fn(async () => ({ url: signed }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 504 })),
    );
    await act(async () => root.render(<CdnImage cdnUrl={cdnUrl} requestFallback={fallback} />));
    await act(async () => {
      host.querySelector("img")?.dispatchEvent(new Event("error"));
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(signed);
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(fallback).toHaveBeenCalledOnce();
  });
  it("does not skip per-image 403 after an unrelated CDN 504 cooldown", async () => {
    const realSigned = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/asset3/v1/poster.webp?md5=${'B'.repeat(22)}&expires=1999999999`;
    const network = vi.fn(async () => new Response(null, { status: 504 }));
    vi.stubGlobal('fetch', network);
    expect(await probeCdnOutage(realSigned, { fetcher: network })).toBe(true);
    network.mockClear();
    network.mockResolvedValue(new Response(null, { status: 403 }));
    const fallback = vi.fn(async () => ({ url: signed }));
    const failed = vi.fn();
    await act(async () => {
      root.render(<CdnImage cdnUrl={realSigned} requestFallback={fallback} onError={failed} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(host.querySelector('img')?.getAttribute('src')).toBe(realSigned);
    await act(async () => {
      host.querySelector('img')?.dispatchEvent(new Event('error'));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(network).toHaveBeenCalledWith(realSigned, expect.objectContaining({ method: 'HEAD' }));
    expect(fallback).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });

});
