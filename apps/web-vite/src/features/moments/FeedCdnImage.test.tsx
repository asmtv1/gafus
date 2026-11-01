// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedCdnImage } from "./FeedCdnImage";

// Feed V2 uses query-based signatures and versioned image/s.webp paths.
// Older md5(...)/posts/... paths are untrusted and must fail closed.
const signed = () => "https://quepraquiecebquomiel.begetcdn.cloud/" +
  "media/v2/asset/v1/image/s.webp?md5=ABCDEFGHIJKLMNOPQRSTUV" +
  `&expires=${Math.floor(Date.now()/1000)+120}`;
const cloudru = "https://s3.cloud.ru/private-feed/posts/owner/" +
  "post/attachments/asset/thumb.webp?X-Amz-Signature=test";
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
async function exercise(cdnStatus: number, fallback = cloudru) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith("/api/v1/media-cdn-probe?url=")) return new Response(null, { status: cdnStatus });
    if (url === "/api/v1/feed/media/asset/fallback") return ok({
      url: fallback, source: "cloudru", expiresAt: new Date(Date.now() + 90_000).toISOString(),
    });
    throw Error("UNEXPECTED_NETWORK");
  });
  vi.stubGlobal("fetch", fetcher);
  const el = document.createElement("div"); document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(<FeedCdnImage url={signed()} mediaId="asset" variant="thumb" alt="Фото"/>));
  await act(async () => {
    el.querySelector("img")?.dispatchEvent(new Event("error"));
    await new Promise(resolve => setTimeout(resolve, 35));
  });
  return { el, fetcher, async finish() { await act(async () => root.unmount()); el.remove(); } };
}
afterEach(() => vi.unstubAllGlobals());
describe("Feed CDN image 410/5xx recovery", () => {
  it.each([403,404])("never uses private storage on a CDN %i", async status => {
    const ctx = await exercise(status);
    try {
      expect(ctx.fetcher).toHaveBeenCalledTimes(1);
      expect(ctx.el.querySelector("img")).toBeNull();
      expect(ctx.el.textContent).toContain("Изображение недоступно");
    } finally { await ctx.finish(); }
  });
  it.each([410,504])("rechecks access and renders authorized Cloud.ru media after CDN %i", async status => {
    const ctx = await exercise(status);
    try {
      expect(ctx.fetcher).toHaveBeenCalledTimes(2);
      expect(ctx.fetcher.mock.calls[1]?.[0]).toBe("/api/v1/feed/media/asset/fallback");
      expect(ctx.el.querySelector("img")?.getAttribute("src")).toBe(cloudru);
    } finally { await ctx.finish(); }
  });
  it.each([401,403,404])("does not disclose Cloud.ru after 410 when the API denies grant with %i", async status => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith("/api/v1/media-cdn-probe?url=")) return new Response(null, { status: 410 });
      if (url === "/api/v1/feed/media/asset/fallback") return new Response(
        JSON.stringify({ success: false, error: "DENIED" }), { status },
      );
      throw Error("UNEXPECTED_NETWORK");
    });
    vi.stubGlobal("fetch", fetcher);
    const el = document.createElement("div"); document.body.append(el);
    const root = createRoot(el);
    try {
      await act(async () => root.render(<FeedCdnImage url={signed()} mediaId="asset" variant="thumb" alt="Фото"/>));
      await act(async () => {
        el.querySelector("img")?.dispatchEvent(new Event("error"));
        await new Promise(resolve => setTimeout(resolve, 35));
      });
      // CDN probe and guarded origin grant are sequential async hops.
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2),
        { timeout: 1500 });
      await act(async () => { await Promise.resolve(); });
      expect(el.querySelector("img")).toBeNull();
      expect(el.textContent).toContain("Изображение недоступно");
      expect(el.innerHTML).not.toContain("s3.cloud.ru");
    } finally { await act(async () => root.unmount()); el.remove(); }
  });
  it("rejects unsigned Cloud.ru fallback replies", async () => {
    const ctx = await exercise(503, "https://s3.cloud.ru/private-feed/image.jpg");
    try {
      expect(ctx.el.querySelector("img")).toBeNull();
      expect(ctx.el.textContent).toContain("Изображение недоступно");
    } finally { await ctx.finish(); }
  });
});
