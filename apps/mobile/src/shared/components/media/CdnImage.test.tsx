// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-image", () => ({
  Image: ({ source, onError }: { source: { uri: string }; onError: () => void }) => (
    <img data-testid="native-image-adapter" src={source.uri} onError={onError} alt="test" />
  ),
}));
import { CdnImage } from "./CdnImage";
const cdnUrl =
  "https://feed.gafus.ru/posts/owner/post/attachments/item/full.webp?md5=valid&expires=1999999999";
const signed =
  "https://s3.cloud.ru/gafus-feed-private/posts/owner/post/full.webp?X-Amz-Signature=valid";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Mobile CdnImage automatic S3 recovery", () => {
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
});
