// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeleteConnected } from "./AccountDeleteConnected";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const settled = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 12));
  });
const btn = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((x) =>
    x.textContent?.includes(text),
  );
async function click(text: string) {
  await act(async () => btn(text)?.click());
  await settled();
}
async function fill(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(id)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/profile/delete-account");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "owner", role: "USER" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  cache.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const envelope = (status: number, success: boolean, data: unknown = null) =>
  new Response(JSON.stringify({ success, data, error: success ? undefined : "Неверный код" }), {
    status,
  });
async function mount(
  email: string | null = "synthetic-owner@example.test",
  profileStatus = 200,
  wrongOwner = false,
) {
  const existing = globalThis.fetch;
  // Minimal own-account preflight, independent of avatar/CDN signing. Raw
  // private email never reaches the deletion screen or React Query cache.
  const profileFetch = vi.fn(async (url: string, opts: RequestInit) => {
    if (url === "/api/v1/user/account/deletion-preflight")
      return envelope(profileStatus, profileStatus === 200, {
        id: wrongOwner ? "foreign" : "A",
        username: "owner",
        hasEmail: typeof email === "string" && !!email.trim(),
      });
    return existing(url, opts);
  });
  vi.stubGlobal("fetch", profileFetch);
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <AccountDeleteConnected ownerId="A" username="owner" />
      </QueryClientProvider>,
    ),
  );
  await settled();
  return profileFetch;
}

describe("Connected Hono account deletion — synthetic actor only, no production writes", () => {
  it("ADMIN cannot start a deceptive self-deletion challenge or email lookup", async () => {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "owner", role: "ADMIN" });
    const requests = await mount();
    expect(host.textContent).toContain("Самостоятельное удаление доступно только обычному пользователю");
    expect(btn("Отправить код на email")).toBeUndefined();
    expect(btn("Удалить навсегда")).toBeUndefined();
    expect(requests).not.toHaveBeenCalled();
  });
  it("Next no-email gate: missing email shows change-email link and never sends deletion code", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const profile = await mount(null);
    expect(profile).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("сначала укажите email");
    expect(host.querySelector('a[href="/profile/change-email"]')).not.toBeNull();
    expect(btn("Отправить код на email")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("invalid/foreign email GET fails closed without code POST or leaking private email", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const profile = await mount("foreign-secret@example.test", 200, true);
    expect(profile).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Запрос кода заблокирован");
    expect(host.textContent).not.toContain("foreign-secret@example.test");
    expect(btn("Отправить код на email")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("403 profile check never implies no email; cannot send deletion POST", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await mount("synthetic-owner@example.test", 403);
    expect(host.textContent).toContain("Запрос кода заблокирован");
    expect(btn("Отправить код на email")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("GET only until explicit request; then exactly one POST code", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(200, true));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(host.textContent).toContain("Удаление аккаунта");
    expect(fetcher).not.toHaveBeenCalled();
    await click("Отправить код на email");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/user/account/deletion-code");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(btn("Продолжить")).not.toBeUndefined();
    expect(btn("Удалить навсегда")).toBeUndefined();
  });
  it("rejects an invalid code and requires username+checkbox before delete", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(200, true));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await click("Отправить код на email");
    await fill("#account-delete-code", "12");
    await click("Продолжить");
    expect(btn("Удалить навсегда")).toBeUndefined();
    await fill("#account-delete-code", "123456");
    await click("Продолжить");
    expect(btn("Удалить навсегда")?.disabled).toBe(true);
    await fill("#account-delete-username", "different");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    expect(btn("Удалить навсегда")?.disabled).toBe(true);
    await fill("#account-delete-username", "owner");
    expect(btn("Удалить навсегда")?.disabled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not repeat an unknown delete ACK or claim account deleted", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelope(200, true))
      .mockRejectedValueOnce(new TypeError("Network lost after commit"));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await click("Отправить код на email");
    await fill("#account-delete-code", "123456");
    await click("Продолжить");
    await fill("#account-delete-username", "owner");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await click("Удалить навсегда");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/user/account/delete");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).code).toBe("123456");
    expect(host.textContent).toContain("Результат удаления неизвестен");
    expect(btn("Удалить навсегда")).toBeUndefined();
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).not.toBeUndefined();
  });
  it("successful typed+confirmed 200 deletes cached private data and exits to login", async () => {
    const fetcher = vi.fn().mockImplementation(async () => envelope(200, true));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await click("Отправить код на email");
    await fill("#account-delete-code", "123456");
    await click("Продолжить");
    await fill("#account-delete-username", "owner");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await click("Удалить навсегда");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe("/login");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBeUndefined();
  });
  it("A→B→A during a pending destructive challenge irreversibly retires the session", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(200, true));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await click("Отправить код на email");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "other", role: "USER" });
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "owner", role: "USER" });
    });
    await settled();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(btn("Продолжить")).toBeUndefined();
    expect(btn("Удалить навсегда")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stale principal blocks all POSTs", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "other", role: "USER" });
    await mount();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
