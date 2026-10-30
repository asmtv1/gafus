// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { MomentPostMenu } from "./MomentPostMenu";

const post = (overrides: Record<string, unknown> = {}) => ({
  id: "post1", status: "published", canDelete: false,
  authorHidden: false, authorNotify: false,
  author: { id: "author1", name: "Анна", username: "anna",
    email: "PRIVATE_USER_EMAIL", avatarUrl: "SECRET_MEDIA" },
  ...overrides,
});
const ok = (data: unknown, status = 200) => new Response(
  JSON.stringify({ success: status < 300, data, error: "SECRET_SERVER_ERROR" }),
  { status },
);
let host: HTMLDivElement, root: Root, cache: QueryClient;
let network: ReturnType<typeof vi.fn<(url: string, opts?: RequestInit) => Promise<Response>>>;
const tick = async () => act(async () => {
  await new Promise(r => setTimeout(r, 40));
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, {
    id: "viewer1", role: "USER", username: "viewer",
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  network = vi.fn();
  vi.stubGlobal("fetch", network);
  window.history.replaceState(null, "", "/moments/post1");
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <MomentPostMenu userId="viewer1" postId="post1" username="anna" />
  </QueryClientProvider>));
  await tick();
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(node =>
    node.textContent?.trim() === label || node.getAttribute("aria-label") === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await tick();
}
describe("WEB4 Next post action menu owner-safe real Feed wire", () => {
  it("hide, undo, and notify use existing PATCH and independent GET confirmations", async () => {
    let hidden = false, notify = false;
    network.mockImplementation(async (url, opts) => {
      if (url === "/api/v1/feed/posts/post1" && opts?.method === "GET")
        return ok(post({ authorHidden: hidden, authorNotify: notify }));
      if (url === "/api/v1/feed/authors/author1/preferences" &&
          opts?.method === "PATCH") {
        const data = JSON.parse(String(opts.body)) as { hidden?: boolean; notify?: boolean };
        if (data.hidden !== undefined) hidden = data.hidden;
        if (data.notify !== undefined) notify = data.notify;
        return ok({ hidden, notify });
      }
      throw Error("UNEXPECTED_URL");
    });
    await mount();
    await click("Действия с публикацией");
    await click("Скрыть автора");
    expect(hidden).toBe(true);
    expect(host.textContent).toContain("Отменить скрытие автора");
    await click("Отменить скрытие автора");
    expect(hidden).toBe(false);
    await click("Уведомлять о постах");
    expect(notify).toBe(true);
    expect(host.textContent).toContain("Не уведомлять о постах");
    expect(host.innerHTML).not.toMatch(/PRIVATE_USER_EMAIL|SECRET_MEDIA/);
    expect(network.mock.calls.filter(([url]) =>
      url === "/api/v1/feed/posts/post1")).toHaveLength(4);
  });
  it("nonowner submits report via POST with validated ACK, never repeats automatically", async () => {
    network.mockImplementation(async (url, opts) => {
      if (url === "/api/v1/feed/posts/post1" && opts?.method === "GET")
        return ok(post());
      if (url === "/api/v1/feed/posts/post1/report" && opts?.method === "POST") {
        expect(JSON.parse(String(opts.body))).toEqual({ reason: "spam", comment: "" });
        return ok({ id: "report1" });
      }
      throw Error("UNEXPECTED_URL");
    });
    await mount();
    await click("Действия с публикацией");
    expect(host.textContent).not.toContain("Удалить публикацию");
    await click("Пожаловаться");
    await click("Отправить жалобу");
    expect(host.textContent).toContain("Жалоба отправлена");
    expect(network.mock.calls.filter(([url]) => url.endsWith("/report"))).toHaveLength(1);
  });
  it("not interested sends exactly one real feedback POST and verifies saved ACK", async () => {
    network.mockImplementation(async (url, opts) => {
      if (url === "/api/v1/feed/posts/post1" && opts?.method === "GET")
        return ok(post());
      if (url === "/api/v1/feed/posts/post1/feedback" && opts?.method === "POST") {
        expect(JSON.parse(String(opts.body))).toEqual({ kind: "not_interested" });
        return ok({ saved: true });
      }
      throw Error("UNEXPECTED_URL");
    });
    await mount();
    await click("Действия с публикацией");
    await click("Не интересно");
    expect(host.textContent).toContain("Эта публикация больше не будет появляться");
    expect(network.mock.calls.filter(([url]) =>
      url === "/api/v1/feed/posts/post1/feedback")).toHaveLength(1);
  });

  it("owner delete requires explicit confirm, DELETE ACK and fresh GET 404", async () => {
    let removed = false;
    network.mockImplementation(async (url, opts) => {
      if (url !== "/api/v1/feed/posts/post1") throw Error("UNEXPECTED_URL");
      if (opts?.method === "DELETE") {
        removed = true;
        return ok({ id: "post1" });
      }
      if (removed) return ok(null, 404);
      return ok(post({ canDelete: true }));
    });
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    await mount();
    await click("Действия с публикацией");
    expect(host.textContent).toContain("Удалить публикацию");
    expect(host.textContent).not.toContain("Пожаловаться");
    await click("Удалить публикацию");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(network.mock.calls.filter(([, opts]) => opts?.method === "DELETE"))
      .toHaveLength(1);
    expect(window.location.pathname).toBe("/moments");
    expect(host.innerHTML).not.toContain("SECRET_SERVER_ERROR");
  });
  it("503 report retains form, redacts backend and only deliberate retry writes again", async () => {
    let submitted = 0;
    network.mockImplementation(async (url, opts) => {
      if (url === "/api/v1/feed/posts/post1" && opts?.method === "GET")
        return ok(post());
      if (url === "/api/v1/feed/posts/post1/report" && opts?.method === "POST") {
        submitted += 1;
        return submitted === 1 ? ok(null, 503) : ok({ id: "report1" });
      }
      throw Error("UNEXPECTED_URL");
    });
    await mount();
    await click("Действия с публикацией");
    await click("Пожаловаться");
    await click("Отправить жалобу");
    expect(host.textContent).toContain("Не удалось подтвердить действие");
    expect(submitted).toBe(1);
    expect(host.querySelector('form[aria-label="Жалоба"]')).not.toBeNull();
    expect(host.innerHTML).not.toContain("SECRET_SERVER_ERROR");
    await tick();
    expect(submitted).toBe(1);
    await click("Отправить жалобу");
    expect(submitted).toBe(2);
    expect(host.textContent).toContain("Жалоба отправлена");
  });
  it("wrong delete ACK never navigates nor pretends published object was removed", async () => {
    let requested = 0;
    network.mockImplementation(async (url, opts) => {
      if (url !== "/api/v1/feed/posts/post1") throw Error("UNEXPECTED_URL");
      if (opts?.method === "DELETE") {
        requested += 1;
        return ok({ id: "DIFFERENT_POST" });
      }
      return ok(post({ canDelete: true }));
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    await mount();
    await click("Действия с публикацией");
    await click("Удалить публикацию");
    expect(requested).toBe(1);
    expect(window.location.pathname).toBe("/moments/post1");
    expect(host.textContent).toContain("Не удалось подтвердить действие");
    expect(host.textContent).toContain("Удалить публикацию");
  });
  it("403 permission read exposes no mutation menu, never leaks backend error", async () => {
    network.mockImplementation(async () => new Response(
      JSON.stringify({ success: false, error: "SECRET_BACKEND_STACK" }), { status: 403 },
    ));
    await mount();
    await click("Действия с публикацией");
    expect(host.textContent).toContain("Не удалось проверить доступ");
    expect(host.textContent).not.toContain("Удалить публикацию");
    expect(host.innerHTML).not.toContain("SECRET_BACKEND_STACK");
    expect(network.mock.calls).toHaveLength(1);
  });
});
