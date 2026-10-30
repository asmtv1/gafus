// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentMediaGallery } from "./MomentMediaGallery";

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(MomentMediaGallery, {
    postId: "post-1", count: 1,
  })));
  return {
    host,
    async toggle() {
      await act(async () => host.querySelector("button")?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Moment media widget on-demand security", () => {
  it("does not request signed URLs until opened and forgets them when closed", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({ id: "post-1",
      status: "published", attachments: [{
        id: "photo-1", kind: "photo", status: "ready",
        thumbUrl: "https://cdn.example/temporary?secret=123",
      }],
    }));
    const ui = await mount(fake);
    try {
      expect(fake).not.toHaveBeenCalled();
      await ui.toggle();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.host.querySelector("img")?.getAttribute("src")).toContain("secret=123");
      expect(ui.host.querySelector("img")?.getAttribute("referrerpolicy"))
        .toBe("no-referrer");
      await ui.toggle();
      expect(ui.host.querySelector("img")).toBeNull();
      await ui.toggle();
      expect(fake).toHaveBeenCalledTimes(2);
    } finally { await ui.cleanup(); }
  });

  it("denied media does not show images or cache links", async () => {
    const ui = await mount(vi.fn().mockResolvedValue(envelope(null, 403)));
    try {
      await ui.toggle();
      expect(ui.host.querySelector("img")).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Вложения недоступны");
    } finally { await ui.cleanup(); }
  });
});
