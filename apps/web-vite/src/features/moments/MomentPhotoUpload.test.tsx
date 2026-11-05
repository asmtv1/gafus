// @vitest-environment jsdom
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async(_original:File,edges:Record<string,number>)=>
    Object.fromEntries(Object.entries(edges).map(([name,edge])=>[
      name,{file:new File([new Uint8Array(128)],name+".webp",{type:"image/webp"}),
        width:edge,height:Math.round(edge*.75)},
    ]))),
}));
vi.mock("../../shared/media/browserVideoPoster", () => ({
  prepareBrowserVideoPoster: vi.fn(async () =>
    new File([new Uint8Array(128)], "poster.webp", { type: "image/webp" })),
}));
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentPhotoUpload } from "./MomentPhotoUpload";
import type { MomentEditor } from "./momentComposerApi";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const editor: MomentEditor = {
  id: "post-1", version: 1, status: "draft", text: "",
  canEdit: true, attachmentCount: 0,
  pendingRevision: { status: "draft", text: "Фото к уроку", attachmentIds: [] },
};
const ticket = {
  uploadId: "upload-1", postId: "post-1", mediaId: "media-1",
  kind: "photo", status: "ready",
  postUrl: null, postFields: null, urlExpiresAt: null,
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core unavailable",
  }), { status });
}
async function mount(
  fetcher: ReturnType<typeof vi.fn>, current: MomentEditor = editor,
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const saved: MomentEditor[] = [];
  const busy: boolean[] = [];
  await act(async () => root.render(createElement(QueryClientProvider, {
    client: cache,
  }, createElement(MomentPhotoUpload, {
    editor: current,
    onSaved: next => saved.push(next),
    onBusy: value => busy.push(value),
  }))));
  return {
    host, saved, busy,
    async select(type = "image/webp", name = "pet.webp") {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      const selected = new File([type.startsWith("video/") ? new Uint8Array(2048) : "short-file"], name, { type });
      Object.defineProperty(input, "files", { configurable: true, value: [selected] });
      await act(async () => input.dispatchEvent(
        new Event("change", { bubbles: true }),
      ));
    },
    async click() {
      const button = Array.from(host.querySelectorAll("button"))
        .find(item => item.textContent?.includes("Загрузить фото"));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("Moments photo editor", () => {
  it("preserves Core revision and never publishes unless author explicitly chooses", async () => {
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/uploads")
        ? ticket
        : { ...editor, attachments: [], version: 2,
          pendingRevision: {
            status: "draft", text: "Фото к уроку", attachmentIds: ["media-1"],
          } },
    )));
    const ui = await mount(fake);
    try {
      await ui.select();
      await ui.click();
      expect(ui.saved).toHaveLength(1);
      expect(ui.busy).toEqual([true, false]);
      expect(ui.saved[0]?.pendingRevision?.attachmentIds).toEqual(["media-1"]);
      expect(fake.mock.calls.map(call => call[0])).toEqual([
        "/api/v1/feed/posts/post-1/uploads",
        "/api/v1/feed/posts/post-1/revisions",
      ]);
      expect(fake.mock.calls.some(call => call[0].endsWith("/publish"))).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it("lost revision response reuses confirmed media ID and revision UUID", async () => {
    let saves = 0;
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/uploads") ? ticket
        : ++saves === 1 ? null : { ...editor, attachments: [], version: 2,
          pendingRevision: { status: "draft", text: "Фото к уроку",
            attachmentIds: ["media-1"] },
        }, path.endsWith("/revisions") && saves === 1 ? 503 : 200,
    )));
    const ui = await mount(fake);
    try {
      await ui.select();
      await ui.click();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось завершить загрузку");
      await ui.click();
      const reserves = fake.mock.calls.filter(call => call[0].endsWith("/uploads"));
      const revisions = fake.mock.calls.filter(call => call[0].endsWith("/revisions"));
      expect(reserves).toHaveLength(1);
      expect(revisions).toHaveLength(2);
      expect(JSON.parse(String(revisions[0]?.[1]?.body)))
        .toEqual(JSON.parse(String(revisions[1]?.[1]?.body)));
      expect(ui.saved).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("video selection uses same Core-only revision and never auto-publishes", async () => {
    // This test checks revision/CAS, so its synthetic MP4 is explicitly
    // approved by a fake worker instead of requiring a real video codec.
    vi.stubGlobal("VideoDecoder", class {});
    vi.stubGlobal("VideoEncoder", class {});
    vi.stubGlobal("Worker", class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      terminate() { /* fake worker */ }
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: {kind:"reusable"} } as MessageEvent)); }
    });
    const videoTicket = {
      ...ticket, kind: "video",
    };
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/uploads") ? videoTicket : {
        ...editor, attachments: [], version: 2,
        pendingRevision: { text: "Фото к уроку",
          attachmentIds: ["media-1"], status: "draft" },
      },
    )));
    const ui = await mount(fake);
    try {
      await ui.select("video/mp4", "walk.mp4");
      expect(ui.host.textContent).toContain("Загрузить видео");
      expect(ui.host.textContent).toContain("120 секунд");
      const button = Array.from(ui.host.querySelectorAll("button"))
        .find(value => value.textContent?.includes("Загрузить видео"));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.saved).toHaveLength(1);
      expect(ui.saved[0]?.pendingRevision?.attachmentIds).toEqual(["media-1"]);
      const writes = fake.mock.calls.filter(call => call[0].endsWith("/uploads"));
      expect(JSON.parse(String(writes[0]?.[1]?.body))).toMatchObject({
        kind: "video", declaredMime: "video/mp4",
      });
      expect(fake.mock.calls.some(call => call[0].endsWith("/publish"))).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it("does not expose picker for a submitted/published draft", async () => {
    const fake = vi.fn();
    const ui = await mount(fake, { ...editor, status: "pending" });
    try {
      expect(ui.host.querySelector('input[type="file"]')).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
});
