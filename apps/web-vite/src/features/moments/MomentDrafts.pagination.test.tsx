// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentDrafts } from "./MomentDrafts";

const editor = (id: string, text: string) => ({
  id, text, status: "draft", version: 0, canEdit: true,
  attachments: [], pendingRevision: null,
  signedUrl: "PRIVATE_SIGNED_MEDIA",
});
const response = (data: unknown, code = 200) =>
  new Response(JSON.stringify({ success: code === 200, data, error: "SECRET_ERROR" }),
    { status: code });
let host: HTMLDivElement, root: Root, cache: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function flush() {
  await act(async () => { await new Promise(r => setTimeout(r, 35)); });
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")]
    .find(node => node.textContent?.includes(label));
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}

describe("WEB4 owner drafts cursor recovery", () => {
  it("loads further pages, preserves first on 503, retries once, deduplicates and redacts", async () => {
    let cursorRequests = 0;
    const network = vi.fn(async (path: string, options?: RequestInit) => {
      expect(options?.method).toBe("GET");
      if (path === "/api/v1/feed/status")
        return response({ enabled: true });
      if (path === "/api/v1/feed/me/pending-posts?pageSize=20")
        return response({ items: [editor("p1", "Первый")], nextCursor: "cursor2" });
      if (path === "/api/v1/feed/me/pending-posts?cursor=cursor2&pageSize=20") {
        cursorRequests += 1;
        return cursorRequests === 1 ? response(null, 503) : response({
          items: [editor("p1", "Первый"), editor("p2", "Второй")],
          nextCursor: null,
        });
      }
      throw Error("UNEXPECTED_PATH");
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(network));
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <MomentDrafts userId="owner" />
    </QueryClientProvider>));
    await flush();
    expect(host.textContent).toContain("Первый");
    await click("Ещё черновики");
    expect(host.textContent).toContain("Первый");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    await click("Повторить страницу черновиков");
    expect(cursorRequests).toBe(2);
    expect(host.textContent).toContain("Второй");
    expect(host.querySelectorAll("li.compact-card")).toHaveLength(2);
    expect(host.textContent).not.toContain("Ещё черновики");
    expect(host.innerHTML).not.toMatch(/PRIVATE_SIGNED_MEDIA|SECRET_ERROR/);
  });
  it("retires previous private draft pages on next-page 401", async () => {
    const network = vi.fn(async (path: string) => {
      if (path === "/api/v1/feed/status") return response({ enabled: true });
      if (path === "/api/v1/feed/me/pending-posts?pageSize=20")
        return response({ items: [editor("p1", "Секретный черновик")], nextCursor: "c2" });
      if (path === "/api/v1/feed/me/pending-posts?cursor=c2&pageSize=20")
        return response(null, 401);
      throw Error("UNEXPECTED_PATH");
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(network));
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <MomentDrafts userId="owner" />
    </QueryClientProvider>));
    await flush();
    expect(host.textContent).toContain("Секретный черновик");
    await click("Ещё черновики");
    expect(host.textContent).toContain("Доступ к черновикам закрыт");
    expect(host.textContent).not.toContain("Секретный черновик");
    expect(host.innerHTML).not.toContain("SECRET_ERROR");
  });

  it("deletes a persisted failed draft only after confirmation, revalidating the owner list", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let deleted = false;
    const network = vi.fn(async (path: string, opts?: RequestInit) => {
      if (path === "/api/v1/feed/status") return response({ enabled: true });
      if (path === "/api/v1/feed/me/pending-posts?pageSize=20") return response({
        items: deleted ? [] : [{ ...editor("p1", "Старый черновик"), status: "failed" }],
        nextCursor: null,
      });
      if (path === "/api/v1/feed/posts/p1" && opts?.method === "DELETE") {
        deleted = true;
        return response({ id: "p1" });
      }
      throw Error("UNEXPECTED_PATH");
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(network));
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <MomentDrafts userId="owner" />
    </QueryClientProvider>));
    await flush();
    await click("Удалить");
    expect(network.mock.calls.some(([, opts]) => opts?.method === "DELETE")).toBe(false);
    expect(host.textContent).toContain("Старый черновик");
    confirm.mockReturnValue(true);
    await click("Удалить");
    expect(network.mock.calls.filter(([, opts]) => opts?.method === "DELETE"))
      .toHaveLength(1);
    expect(host.textContent).not.toContain("Старый черновик");
    expect(host.textContent).toContain("Незавершённых публикаций нет");
    expect(host.querySelectorAll(".moment-drafts-heading h1")).toHaveLength(1);
    expect(host.querySelectorAll(".moment-drafts-toolbar > a.moment-drafts-create")).toHaveLength(1);
    expect(host.querySelector(".moment-drafts-create")?.getAttribute("href"))
      .toBe("/moments/new");
    expect(host.querySelectorAll(".moment-drafts-toolbar button.moment-drafts-refresh"))
      .toHaveLength(1);
    expect(host.querySelector(".moment-drafts-empty h2")?.textContent)
      .toContain("Незавершённых публикаций нет.");
    expect(host.querySelector(".moment-drafts-page a[href='/moments']")).toBeNull();

  });

  it("HTTP503 during draft deletion never hides existing server-owned draft", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const network = vi.fn(async (path: string, opts?: RequestInit) => {
      if (path === "/api/v1/feed/status") return response({ enabled: true });
      if (path === "/api/v1/feed/me/pending-posts?pageSize=20")
        return response({ items: [editor("p1", "Неудалённый черновик")], nextCursor: null });
      if (path === "/api/v1/feed/posts/p1" && opts?.method === "DELETE")
        return response(null, 503);
      throw Error("UNEXPECTED_PATH");
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(network));
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <MomentDrafts userId="owner" />
    </QueryClientProvider>));
    await flush();
    await click("Удалить");
    expect(host.textContent).toContain("Неудалённый черновик");
    expect(host.textContent).toContain("Удаление не подтверждено сервером");
    expect(host.innerHTML).not.toContain("SECRET_ERROR");
    expect(network.mock.calls.filter(([, opts]) => opts?.method === "DELETE"))
      .toHaveLength(1);
  });

});
