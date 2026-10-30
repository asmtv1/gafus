// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ProfileOverview } from "./ProfileOverview";
const old = {
  id: "A",
  username: "ownerA",
  profile: { fullName: "PRIVATE_OLD_NAME", city: "PRIVATE_OLD_CITY", about: "PRIVATE_OLD_BIO" },
};
const fresh = {
  id: "A",
  username: "ownerA",
  profile: { fullName: "Подтверждённое имя", city: "Самара", about: "Свежая информация" },
};
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_SERVER_STACK",
    }),
    { status },
  );
function deferred<T>() {
  let resolve!: (data: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount(editMode = false, galleryRouteMode = false, username: string | null = null) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ProfileOverview
          userId="A"
          editMode={editMode}
          galleryRouteMode={galleryRouteMode}
          galleryRequestedUsername={username}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" });
  cache.setQueryData(["user", "profile", "A"], old);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("private profile current successful read boundary", () => {
  it("P-R01 cached owner fields are hidden during new GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перепроверяем профиль");
    expect(host.textContent).not.toContain("PRIVATE_OLD_NAME");
    expect(host.textContent).not.toContain("PRIVATE_OLD_CITY");
    expect(host.textContent).not.toContain("PRIVATE_OLD_BIO");
    expect(host.querySelector("button")).toBeNull();
    await act(async () => pending.resolve(response(fresh)));
    await flush();
    expect(host.textContent).toContain("Подтверждённое имя");
    expect(host.textContent).toContain("Самара");
  });
  it("P-R02 edit route does not mount form from cached owner data", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    await mount(true);
    expect(host.textContent).toContain("Перепроверяем профиль");
    expect(host.querySelector('form[aria-label="Редактирование профиля"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_BIO");
    await act(async () => pending.resolve(response(fresh)));
    await flush();
    expect(host.querySelector('form[aria-label="Редактирование профиля"]')).not.toBeNull();
  });
  it("P-R03 cached gallery route hides album owner link until verified", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    await mount(false, true, "other-username");
    expect(host.textContent).toContain("Перепроверяем владельца");
    expect(host.textContent).not.toContain("Недоступен чужой профиль");
    await act(async () => pending.resolve(response(fresh)));
    await flush();
    // Original Next permits authorized foreign public albums; the private
    // cached owner profile is still hidden until an authenticated owner GET.
    expect(host.textContent).toContain("Фотоальбомы @other-username");
    expect(host.textContent).not.toContain("PRIVATE_OLD_NAME");
    expect(host.textContent).not.toContain("PRIVATE_OLD_BIO");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
  });
  it("P-R04 revoked 401 after cached owner GET cannot show personal fields", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    await mount();
    await act(async () => pending.resolve(response(null, 401)));
    await flush();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_NAME");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(host.querySelector("form")).toBeNull();
  });
  it("P-R05 gallery 403 does not publish cached owner album navigation", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    await mount(false, true, "ownerA");
    await act(async () => pending.resolve(response(null, 403)));
    await flush();
    expect(host.textContent).toContain("Не удалось подтвердить владельца");
    expect(host.textContent).not.toContain("PRIVATE_OLD_NAME");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
  });
});
