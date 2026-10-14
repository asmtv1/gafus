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
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';
vi.mock("expo-image", () => ({
  Image: ({ source, onError }: { source?: { uri: string }; onError: () => void }) => (
    <img data-testid="native-image-adapter" src={source?.uri} onError={onError} alt="test" />
  ),
}));
import { CdnImage } from "./CdnImage";
const cdnUrl =
  `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/posts/owner/post/attachments/item/full.webp`;
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
describe("Mobile CdnImage automatic S3 recovery", () => {
  it("does not render previous account's private image on an account switch", async () => {
    const fallback = vi.fn(async () => ({ url: signed }));
    const valid = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/posts/owner/post/attachments/item/full.webp`;
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
    const serverSigned = `https://garaquachegasourn.begetcdn.cloud/md5(${'B'.repeat(22)},1999999999)/posts/a/b/attachments/c/thumb.webp`;
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
  it("bypasses Feed CDN for another image during a confirmed 504 cooldown", async () => {
    const realSigned = `https://garaquachegasourn.begetcdn.cloud/md5(${'B'.repeat(22)},1999999999)/posts/owner/post/attachments/item/poster.webp`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 504 })));
    expect(await probeCdnOutage(realSigned, { fetcher: fetch })).toBe(true);
    vi.mocked(fetch).mockClear();
    const fallback = vi.fn(async () => ({ url: signed }));
    await act(async () => {
      root.render(<CdnImage cdnUrl={realSigned} requestFallback={fallback} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(host.querySelector('img')?.getAttribute('src')).toBe(signed);
  });

});
