// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentMediaReorder } from "./MomentMediaReorder";
import type { MomentEditor } from "./momentComposerApi";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const editor: MomentEditor = {
  id: "post-1", status: "draft", version: 2,
  text: "", canEdit: true, attachmentCount: 0,
  pendingRevision: {
    text: "С фото", status: "draft", attachmentIds: ["photo-1", "video-1"],
  },
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core unavailable",
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>,
  current: MomentEditor = editor, disabled = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const results: MomentEditor[] = [];
  const busy: boolean[] = [];
  await act(async () => root.render(createElement(QueryClientProvider,
    { client: cache },
    createElement(MomentMediaReorder, {
      editor: current, disabled,
      onBusy: status => busy.push(status),
      onSaved: value => results.push(value),
    }))));
  return {
    host, busy, results,
    async click() {
      const button = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Переместить вложение 1 вниз"]',
      );
      expect(button).not.toBeNull();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Moment media reorder UI", () => {
  it("reorders references with Core ACK but never deletes storage media", async () => {
    const fake = vi.fn().mockResolvedValue(response({
      id: editor.id, status: "draft", version: 3, text: "",
      canEdit: true, attachments: [],
      pendingRevision: {
        text: "С фото", status: "draft",
        attachmentIds: ["video-1", "photo-1"],
      },
    }));
    const ui = await mount(fake);
    try {
      await ui.click();
      expect(ui.results).toHaveLength(1);
      expect(ui.results[0]?.pendingRevision?.attachmentIds)
        .toEqual(["video-1", "photo-1"]);
      expect(ui.busy).toEqual([true, false]);
      expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/revisions");
      expect(JSON.parse(fake.mock.calls[0][1].body)).toMatchObject({
        clientRequestId: UUID, text: "С фото", expectedVersion: 2,
        attachmentIds: ["video-1", "photo-1"],
      });
      expect(fake.mock.calls).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("Core conflict does not visually reorder until server confirms", async () => {
    const fake = vi.fn().mockResolvedValue(response(null, 409));
    const ui = await mount(fake);
    try {
      await ui.click();
      expect(ui.results).toHaveLength(0);
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось подтвердить порядок");
      expect(ui.busy).toEqual([true, false]);
    } finally { await ui.cleanup(); }
  });

  it("does not offer reorder to a pending or inaccessible draft", async () => {
    const fake = vi.fn();
    const ui = await mount(fake, { ...editor, canEdit: false });
    try {
      expect(ui.host.querySelector("button")).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("disabled reorder blocks actions during media upload", async () => {
    const fake = vi.fn();
    const ui = await mount(fake, editor, true);
    try {
      expect(ui.host.querySelectorAll("button")).toHaveLength(4);
      expect([...ui.host.querySelectorAll("button")]
        .every(button => button.disabled)).toBe(true);
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
});
