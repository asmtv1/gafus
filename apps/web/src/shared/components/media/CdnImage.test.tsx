// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CdnImage } from "./CdnImage";

let host: HTMLDivElement;
let root: Root;
const source = "https://cdn.gafus.test/photos/ready.webp?md5=valid&expires=1999999999";
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("signed CDN image fallback in Web", () => {
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
