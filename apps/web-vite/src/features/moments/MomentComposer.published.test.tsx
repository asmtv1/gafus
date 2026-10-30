// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";

afterEach(() => vi.unstubAllGlobals());

it.each(["pending", "published"] as const)(
  "redirects a server-confirmed %s editor deep-link to the feed without an intermediate screen",
  async state => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const postId = "post-1";
  window.history.replaceState(null, "", "/moments/drafts/" + postId);
  const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
  const fake = vi.fn(async (path: string) => {
    if (path.endsWith("/status")) return envelope({ enabled: true });
    if (path.endsWith("/" + postId + "/editor")) return envelope({
      id: postId, status: state, version: 2,
      text: "Пост с двумя фотографиями", canEdit: false,
      attachments: [{ id: "media-1" }, { id: "media-2" }],
      pendingRevision: null,
    });
    throw Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fake);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
      createElement(MomentComposer, { userId: "viewer", draftId: postId }),
    )));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(window.location.pathname).toBe("/moments");
    expect(host.textContent).toBe("");
    expect(host.textContent).not.toContain("Публикация готова");
    expect(host.textContent).not.toContain("Обработка публикации");
    expect(host.textContent).not.toContain("Редактирование сейчас недоступно");
    expect(host.textContent).not.toContain("Удалить черновик");
    expect(fake.mock.calls.some(([path]) => path.endsWith("/poll") ||
      path.endsWith("/draft-poll"))).toBe(false);
  } finally {
    await act(async () => root.unmount());
    cache.clear(); host.remove();
    window.history.replaceState(null, "", "/moments");
  }
});
