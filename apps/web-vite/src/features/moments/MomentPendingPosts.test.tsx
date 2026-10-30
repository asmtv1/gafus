// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentPendingPosts } from "./MomentPendingPosts";

const row = (id: string, status: "draft" | "pending" | "failed") => ({
  id, status, version: 1, text: `Черновик-${id}`,
  canEdit: true, attachments: [], pendingRevision: null,
});
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, error: "SECRET_INTERNAL_ERROR",
}), { status });
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(MomentPendingPosts, { userId: "owner-A" }))));
  const tick = async () => act(async () => { await new Promise(r => setTimeout(r, 35)); });
  await tick();
  return { host, cache, tick,
    async cleanup() { await act(async () => root.unmount()); cache.clear(); host.remove(); },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Next-compatible server pending publications on Moments feed", () => {
  it("restores saved draft/pending/failed posts through owner-only GET, no new create", async () => {
    const fetcher = vi.fn(async (path: string) => {
      expect(path).toBe("/api/v1/feed/me/pending-posts?pageSize=20");
      return envelope({ items: [row("a", "draft"), row("b", "pending"),
        row("c", "failed")], nextCursor: "cursor2" });
    });
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Черновик-a");
      expect(ui.host.textContent).toContain("Обрабатывается");
      expect(ui.host.textContent).toContain("Ошибка обработки");
      expect(ui.host.querySelector('a[href="/feed/create?edit=a"]')).not.toBeNull();
      expect(ui.host.querySelector('a[href="/feed/create?edit=b"]')).toBeNull();
      expect(ui.host.querySelector('a[href="/moments/drafts"]')).not.toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(ui.cache.getQueryData(["moments", "pending-posts", "owner-A"])))
        .not.toMatch(/SECRET_|PRIVATE_/);
    } finally { await ui.cleanup(); }
  });

  it("renders a card with server-acknowledged upload percent, not made-up processing progress", async () => {
    const fetcher = vi.fn(async () => envelope({ items: [
      { ...row("up", "pending"), text: "Фото для момента", attachments: [
        { id: "photo1", status: "ready" }, { id: "photo2", status: "reserved" },
      ] },
      { ...row("unknown", "pending"), attachments: [{ id: "bad", status: "failed" }] },
    ], nextCursor: null }));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Файлы загружены");
      expect(ui.host.textContent).toContain("50%");
      const numeric = ui.host.querySelector('[role="progressbar"][aria-valuenow="50"]');
      expect(numeric?.getAttribute("aria-label")).toBe("Доля загруженных вложений");
      const all = Array.from(ui.host.querySelectorAll('[role="progressbar"]'));
      expect(all).toHaveLength(2);
      expect(all[1]?.hasAttribute("aria-valuenow")).toBe(false);
      expect(ui.host.textContent).toContain("Обработка на сервере ещё продолжается");
      expect(ui.host.querySelectorAll("ul > li")).toHaveLength(2);
      expect(ui.host.querySelectorAll('a[href="/feed/create?edit=up"]')).toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("requires confirmation, prevents concurrent double delete, reloads pending list after ACK", async () => {
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    let deleted = false;
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const fetcher = vi.fn((path: string, req?: RequestInit) => {
      if (path === "/api/v1/feed/me/pending-posts?pageSize=20")
        return Promise.resolve(envelope({ items: deleted ? [] : [row("one", "draft")],
          nextCursor: null }));
      if (path === "/api/v1/feed/posts/one" && req?.method === "DELETE") {
        deleted = true;
        return pending;
      }
      throw Error("UNEXPECTED_API_" + path);
    });
    const ui = await mount(fetcher);
    try {
      const button = () => Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
        .find(b => b.textContent?.trim() === "Удалить");
      await act(async () => { button()?.click(); button()?.click(); });
      expect(fetcher.mock.calls.filter(([, req]) => req?.method === "DELETE"))
        .toHaveLength(1);
      expect(confirmed).toHaveBeenCalledTimes(1);
      await act(async () => finish(envelope({ id: "one" })));
      await ui.tick();
      expect(ui.host.textContent).not.toContain("Черновик-one");
      expect(fetcher.mock.calls.filter(([url]) => String(url).includes("pending-posts")))
        .toHaveLength(2);
    } finally { await ui.cleanup(); }
  });

  it("declining deletion makes no write, HTTP503 keeps pending and reports no false success", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let writeFails = false;
    const fetcher = vi.fn(async (path: string, req?: RequestInit) => {
      if (path.includes("pending-posts")) return envelope({
        items: [row("one", "failed")], nextCursor: null,
      });
      if (path.endsWith("/posts/one") && req?.method === "DELETE")
        return envelope(null, writeFails ? 503 : 200);
      throw Error("UNEXPECTED_API");
    });
    const ui = await mount(fetcher);
    try {
      const btn = () => Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
        .find(b => b.textContent?.trim() === "Удалить");
      await act(async () => btn()?.click());
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls.some(([, req]) => req?.method === "DELETE")).toBe(false);
      writeFails = true;
      confirm.mockReturnValue(true);
      await act(async () => btn()?.click());
      await ui.tick();
      expect(ui.host.textContent).toContain("Удаление не подтверждено сервером");
      expect(ui.host.textContent).toContain("Черновик-one");
      expect(ui.host.innerHTML).not.toContain("SECRET_INTERNAL_ERROR");
    } finally { await ui.cleanup(); }
  });

  it.each([401, 403, 404])("HTTP%s denies cached owner's drafts", async code => {
    const fetcher = vi.fn().mockResolvedValue(envelope(null, code));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).not.toContain("Черновик-one");
      expect(ui.host.querySelector("a[href^='/feed/create?edit=']")).toBeNull();
      expect(ui.host.textContent).not.toContain("SECRET_INTERNAL_ERROR");
      expect(fetcher.mock.calls.some(([, req]) => req?.method === "DELETE"))
        .toBe(false);
    } finally { await ui.cleanup(); }
  });
});
