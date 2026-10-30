// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { MomentsCatalog } from "./MomentsCatalog";
import type { HiddenAuthorsSyntheticTransport } from "./hiddenAuthorsReadApi";
import { ApiError } from "../../shared/api/client";
const author = (id = "A") => ({
  id,
  username: "anna",
  name: "Анна",
  avatarUrl: "SECRET_SIGNED_URL",
  email: "PRIVATE_EMAIL",
  role: "ADMIN",
});
const page = (items: unknown[] = [], nextCursor: string | null = null) => ({
  items,
  nextCursor,
  serverNow: "2026-10-18T12:00:00.000Z",
});
const later = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => (resolve = ok));
  return { promise, resolve };
};
let cache: QueryClient, host: HTMLElement, root: Root;
let status: ReturnType<typeof vi.fn<HiddenAuthorsSyntheticTransport["status"]>>;
let list: ReturnType<typeof vi.fn<HiddenAuthorsSyntheticTransport["list"]>>;
let wire: HiddenAuthorsSyntheticTransport;
const tick = async () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 20));
  });
async function mount(
  enabled = true, transport: HiddenAuthorsSyntheticTransport | null = wire, owner = "owner",
) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MomentsCatalog
          userId={owner}
          showHiddenAuthorsOptIn={enabled}
          hiddenAuthorsSyntheticTransport={transport ?? undefined}
        />
      </QueryClientProvider>,
    ),
  );
  await tick();
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await tick();
}
async function open() {
  await mount();
  await click("Скрытые авторы (макет)");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner", username: "owner", role: "USER" });
  status = vi.fn(async () => ({ enabled: true }));
  list = vi.fn(async () => page([author()]));
  wire = { fixtureKind: "AG2_HIDDEN_AUTHORS_OWNER_SYNTHETIC_GET_ONLY", status, list };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify({
            success: true,
            data:
              path === "/api/v1/feed/status"
                ? { enabled: true, smartEnabled: false }
                : { items: [], nextCursor: null, serverNow: "2026-10-18T12:00:00.000Z" },
          }),
          { status: 200 },
        ),
    ),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState(null, "", "/moments");
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("WEB-URL-021 Moments hidden-author real optin entry synthetic", () => {
  it("HM01 off: no entry or private fetch", async () => {
    await mount(false);
    expect(host.textContent).not.toContain("Скрытые авторы (макет)");
    expect(list).not.toHaveBeenCalled();
  });
  it("HM02 without synthetic transport: entry is visible, no private fixture read", async () => {
    await mount(true, null);
    expect(host.textContent).toContain("Скрытые авторы (макет)");
    expect(list).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
  it("HM03 path owner->entry->status->hidden->back without mutation", async () => {
    await open();
    expect(status).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledExactlyOnceWith(null);
    expect(host.textContent).toContain("Анна");
    expect(host.textContent).toContain("@anna");
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|avatarUrl|ADMIN/);
    expect(host.textContent).not.toContain("Показывать в «Моментах»");
    await click("К «Моментам»");
    expect(host.textContent).not.toContain("Анна");
  });
  it("HM04 disabled status prevents hidden-author read", async () => {
    status.mockResolvedValueOnce({ enabled: false });
    await open();
    expect(list).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Моменты» сейчас недоступны");
  });
  it("HM05 pending status does not fetch list", async () => {
    const deferred = later<unknown>();
    status.mockReturnValueOnce(deferred.promise);
    await open();
    expect(host.textContent).toContain("Проверяем доступность «Моментов»");
    expect(list).not.toHaveBeenCalled();
    await act(async () => deferred.resolve({ enabled: true }));
    await tick();
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("HM06 no hidden authors, empty state", async () => {
    list.mockResolvedValueOnce(page());
    await open();
    expect(host.textContent).toContain("Скрытых авторов пока нет");
  });
  it("HM07 error bounded and explicit refetch", async () => {
    list.mockRejectedValueOnce(Error("PRIVATE_STACK"));
    await open();
    expect(host.textContent).toContain("Не удалось загрузить скрытых авторов");
    expect(host.textContent).not.toContain("PRIVATE_STACK");
    await click("Повторить чтение");
    expect(host.textContent).toContain("Анна");
  });
  it("HM08 status error bounded + manual retry", async () => {
    status.mockRejectedValueOnce(Error("PRIVATE_STATUS"));
    await open();
    expect(list).not.toHaveBeenCalled();
    await click("Повторить проверку");
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("HM09 next page keeps unique author IDs", async () => {
    list.mockImplementation(async (cursor) =>
      cursor
        ? page([author(), { ...author("B"), username: "bob", name: "Боб" }])
        : page([author()], "next1"),
    );
    await open();
    await click("Ещё авторы");
    expect(list).toHaveBeenCalledWith("next1");
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(2);
  });
  it("HM10 late status A-B-A cannot fetch private list", async () => {
    const d = later<unknown>();
    status.mockReturnValueOnce(d.promise);
    await open();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "other" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner" }));
    await act(async () => d.resolve({ enabled: true }));
    await tick();
    expect(list).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("HM11 late private page after logout not shown", async () => {
    const d = later<unknown>();
    list.mockReturnValueOnce(d.promise);
    await open();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "other" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner" }));
    await act(async () => d.resolve(page([author()])));
    await tick();
    expect(host.textContent).not.toContain("Анна");
  });
  it("HM12 repeated same-principal details retain list", async () => {
    await open();
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "owner",
        username: "new-name",
        role: "USER",
      }),
    );
    expect(host.textContent).toContain("Анна");
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("HM13 503 on next page keeps earlier authors and explicit retry", async () => {
    let attempts = 0;
    list.mockImplementation(async (cursor) =>
      cursor === null
        ? page([author()], "next1")
        : ++attempts === 1
          ? Promise.reject(new ApiError(503, "PRIVATE_TRANSIENT_PAGE_STACK"))
          : page([{ ...author("B"), username: "bob", name: "Боб" }], null),
    );
    await open();
    await click("Ещё авторы");
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(1);
    expect(host.textContent).toContain("Следующая страница недоступна");
    await click("Повторить страницу авторов");
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(2);
    expect(host.textContent).not.toContain("Следующая страница недоступна");
    expect(attempts).toBe(2);
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next1", "next1"]);
    expect(status).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(2);
    expect(host.textContent?.match(/Анна/g)).toHaveLength(1);
    expect(host.textContent).not.toContain("PRIVATE_TRANSIENT_PAGE_STACK");
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к списку скрытых авторов."],
    [404, "Список скрытых авторов недоступен."],
  ] as const)("HM15 hidden authors nextpage HTTP%s denies old list", async (code, message) => {
    list.mockImplementation(async (cursor) => {
      if (cursor === null) return page([author()], "next1");
      throw new ApiError(code, "PRIVATE_DENIAL_PAGE_STACK");
    });
    await open();
    expect(host.querySelector('.hidden-authors-grid a[href="/profile?username=anna"]'))
      .not.toBeNull();
    expect(host.textContent).toContain("Анна");
    await click("Ещё авторы");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.querySelector(".hidden-authors-grid")).toBeNull();
    expect(host.querySelector('a[href="/profile?username=anna"]')).toBeNull();
    expect(host.textContent).not.toContain("Анна");
    expect(host.textContent).not.toContain("Скрытых авторов пока нет");
    expect(host.textContent).not.toContain("PRIVATE_DENIAL_PAGE_STACK");
    expect(host.textContent).not.toContain("Следующая страница недоступна");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(button =>
      button.textContent?.includes("Ещё авторы") || button.textContent?.includes("Повторить")))
      .toBe(false);
    expect(host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next1"]);
    expect(status).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feed/me/hidden-authors"), expect.anything());
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к списку скрытых авторов."],
    [404, "Список скрытых авторов недоступен."],
  ] as const)("HM16 hidden authors firstpage HTTP%s terminal", async (code, message) => {
    list.mockRejectedValueOnce(new ApiError(code, "PRIVATE_FIRST_PAGE_STACK"));
    await open();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.querySelector(".hidden-authors-grid")).toBeNull();
    expect(host.querySelector('a[href="/profile?username=anna"]')).toBeNull();
    expect(host.textContent).not.toContain("Скрытых авторов пока нет");
    expect(host.textContent).not.toContain("PRIVATE_FIRST_PAGE_STACK");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(button =>
      button.textContent?.includes("Ещё авторы") || button.textContent?.includes("Повторить")))
      .toBe(false);
    expect(host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual([null]);
    expect(status).toHaveBeenCalledTimes(1);
  });
  it.each(["next", "retry"])("HM-FLIGHT-PRE double same-turn %s calls one cursor GET", async (mode) => {
    const pending = later<unknown>();
    let nextRequests = 0;
    list.mockImplementation((cursor) => {
      if (cursor === null) return Promise.resolve(page([author()], "next1"));
      nextRequests++;
      if (mode === "retry" && nextRequests === 1)
        return Promise.reject(new ApiError(503, "PRIVATE_TRANSIENT_CURSOR"));
      return pending.promise;
    });
    await open();
    if (mode === "retry") await click("Ещё авторы");
    const label = mode === "retry" ? "Повторить страницу авторов" : "Ещё авторы";
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((node) => node.textContent?.trim() === label);
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); });
    await tick();
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual(
      mode === "retry" ? [null, "next1", "next1"] : [null, "next1"],
    );
    expect(host.textContent).toContain("Анна");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(
      (node) => node.disabled && node.textContent?.includes("Загружаем"),
    )).toBe(true);
    await act(async () => pending.resolve(page([{ ...author("B"), username: "bob", name: "Боб" }])));
    await tick();
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(2);
    expect(host.textContent?.match(/Анна/g)).toHaveLength(1);
    expect(host.textContent).toContain("Боб");
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("HM-FLIGHT-OWNER old pending owner cannot block new owner or release its flight", async () => {
    const old = later<unknown>();
    const fresh = later<unknown>();
    let firstOwner = true;
    let nextRequests = 0;
    list.mockImplementation((cursor) => {
      if (cursor === null) return Promise.resolve(page([
        firstOwner ? author() : { ...author("B"), username: "bob", name: "Боб" },
      ], "next1"));
      nextRequests++;
      return nextRequests === 1 ? old.promise : fresh.promise;
    });
    await open();
    const more = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((node) => node.textContent?.trim() === "Ещё авторы");
    await act(async () => more()?.click());
    await tick();
    expect(nextRequests).toBe(1);
    firstOwner = false;
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "new-owner", username: "new-owner", role: "USER" }));
    await mount(true, wire, "new-owner");
    await click("Скрытые авторы (макет)");
    expect(host.textContent).toContain("Боб");
    expect(host.textContent).not.toContain("Анна");
    await act(async () => more()?.click());
    await tick();
    expect(nextRequests).toBe(2);
    const loading = () => [...host.querySelectorAll<HTMLButtonElement>("button")].some(
      (node) => node.disabled && node.textContent?.includes("Загружаем"),
    );
    expect(loading()).toBe(true);
    await act(async () => old.resolve(page([{ ...author("OLD"), name: "PRIVATE_OLD_OWNER" }])));
    await tick();
    expect(host.textContent).not.toContain("PRIVATE_OLD_OWNER");
    expect(loading()).toBe(true);
    await act(async () => fresh.resolve(page([
      { ...author("C"), username: "charlie", name: "Новый автор" },
    ])));
    await tick();
    expect(host.textContent).toContain("Новый автор");
    expect(host.textContent).not.toContain("PRIVATE_OLD_OWNER");
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual(
      [null, "next1", null, "next1"],
    );
  });

  it("HM14 repeated server cursor does not append wrong or cyclic page", async () => {
    list.mockImplementation(async (cursor) =>
      cursor === null
        ? page([author()], "next1")
        : page([{ ...author("B"), username: "bob", name: "Боб" }], "next1"),
    );
    await open();
    await click("Ещё авторы");
    expect(host.querySelectorAll(".hidden-authors-grid li")).toHaveLength(1);
    expect(host.textContent).toContain("Следующая страница недоступна");
    expect(list).toHaveBeenCalledTimes(2);
  });
});
