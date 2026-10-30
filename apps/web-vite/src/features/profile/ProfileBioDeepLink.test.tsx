// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { routeForPath } from "../../shared/router/location";

const profile = (id: string) => ({
  id, username: "owner", email: "secret@example.net", phone: "+70000000000",
  profile: {
    fullName: "Владелец", city: "Санкт-Петербург", about: "До обновления",
    birthDate: "1999-01-01", telegram: "private_user",
    instagram: "private_ins", website: "private.example",
  },
});
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, error: "Unavailable",
}), { status });

beforeAll(async()=>{await import("./ProfileOverview");});
async function mount(route: string, account: string | null,
  fetcher: ReturnType<typeof vi.fn>) {
  window.history.replaceState(null, "", route);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  } });
  if (account) cache.setQueryData(CURRENT_USER_QUERY_KEY, {
    id: account, username: account, role: "USER",
  });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, createElement(App))));
  // Do not stop at a transient lazy-route alert while the owner form loads.
  for (let i = 0; i < 15; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
    if (account
      ? host.querySelector('form[aria-label="Редактирование профиля"]')
      : host.textContent?.includes("Начать заниматься")) break;
  }
  return {
    host, cache,
    async input(selector: string, value: string) {
      const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const proto = field.tagName === "INPUT"
        ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
      await act(async () => {
        setter.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async clickButton(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(item => item.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async save() {
      await act(async () => host.querySelector('form[aria-label="Редактирование профиля"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AG2 legacy /profile/editBio compatibility", () => {
  it("matches only the exact case-sensitive legacy path, not nested or encoded variants", () => {
    expect(routeForPath("/profile/editBio")).toBe("/profile/editBio");
    expect(routeForPath("/profile/editBio/")).toBe("/profile/editBio");
    for (const invalid of [
      "/profile/editbio", "/profile/editBio/hidden", "/profile/editBio%2fprivate",
      "/profile/%2e%2e/editBio", "/profile//editBio",
    ]) expect(routeForPath(invalid)).toBeNull();
  });

  it("does not load private profiles for unauthenticated guests", async () => {
    const fetcher = vi.fn(async (_url: string) => envelope(null, 401));
    const ui = await mount("/profile/editBio", null, fetcher);
    try {
      // Guest scenarios were removed from the app: login/landing only.
      // No private profile GET may be made while rendering the landing.
      expect(ui.host.textContent).toContain("Начать заниматься");
      expect(ui.host.querySelector('a[href="/login"]')).not.toBeNull();
      expect(ui.host.textContent).not.toContain("Страница не найдена");
      const paths = fetcher.mock.calls.map(([path]) => path);
      expect(paths).not.toContain("/api/v1/user/profile");
    } finally { await ui.cleanup(); }
  });

  it("opens all original Next profile fields only for owner, strips unrelated secrets", async () => {
    const fetcher = vi.fn(async (_url: string) => envelope(profile("A")));
    const ui = await mount("/profile/editBio?username=owner#edit", "A", fetcher);
    try {
      expect(ui.host.querySelector('form[aria-label="Редактирование профиля"]'))
        .not.toBeNull();
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-name")?.value)
        .toBe("Владелец");
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-city")?.value)
        .toBe("Санкт-Петербург");
      expect(ui.host.querySelector<HTMLTextAreaElement>("#profile-edit-about")?.value)
        .toBe("До обновления");
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-birthDate")?.value)
        .toBe("1999-01-01");
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-telegram")?.value)
        .toBe("private_user");
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-instagram")?.value)
        .toBe("private_ins");
      expect(ui.host.querySelector<HTMLInputElement>("#profile-edit-website")?.value)
        .toBe("private.example");
      expect(ui.host.textContent).not.toContain("будут перенесены отдельно");
      expect(ui.host.innerHTML).not.toMatch(/secret@example.net|\+70000000000/);
      // Both independent owner GETs are required, but code splitting may
      // legitimately schedule onboarding before the profile request.
      expect(fetcher.mock.calls.map(([url]) => url).sort())
        .toEqual(["/api/v1/user/profile", "/api/v1/user/onboarding-tour"].sort());
      expect(window.location.search).toBe("?username=owner");
      expect(window.location.hash).toBe("#edit");
    } finally { await ui.cleanup(); }
  });

  it("saves city only without rewriting unchanged legacy website, then readback", async () => {
    let city = "Санкт-Петербург";
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        city = "Казань";
        return envelope({ userId: "A" });
      }
      return envelope({
        ...profile("A"), profile: { ...profile("A").profile, city },
      });
    });
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      await ui.input("#profile-edit-city", "Казань");
      await ui.save();
      const updates = fetcher.mock.calls.filter(([_url, init]) => init?.method === "PUT");
      expect(updates).toHaveLength(1);
      expect(updates[0][0]).toBe("/api/v1/user/profile");
      expect(JSON.parse(String(updates[0][1]?.body))).toEqual({
        city: "Казань",
      });
      expect(window.location.pathname).toBe("/profile");
      expect(ui.host.textContent).toContain("Казань");
      expect(ui.host.querySelector('form[aria-label="Редактирование профиля"]'))
        .toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("updates all Next contacts and date in one authenticated PUT + owner GET", async () => {
    const user = profile("A");
    const state: Record<string, string | null> = { ...user.profile };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        Object.assign(state, JSON.parse(String(init.body)));
        return envelope({ userId: "A" });
      }
      return envelope({ ...user, profile: state });
    });
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      await ui.input("#profile-edit-telegram", "@NewUsername");
      await ui.input("#profile-edit-instagram", "@Dog.Name");
      await ui.input("#profile-edit-website", "example.com");
      await ui.input("#profile-edit-birthDate", "2000-03-01");
      await ui.save();
      const requests = fetcher.mock.calls.filter(([_url, init]) => init?.method === "PUT");
      expect(requests).toHaveLength(1);
      expect(JSON.parse(String(requests[0][1]?.body))).toEqual({
        telegram: "newusername", instagram: "dog.name",
        website: "https://example.com/", birthDate: "2000-03-01",
      });
      expect(window.location.pathname).toBe("/profile");
      expect(ui.host.querySelector('form[aria-label="Редактирование профиля"]'))
        .toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("deleting all four optional fields confirms persisted null after server GET", async () => {
    const user = profile("A");
    const state: Record<string, string | null> = {
      ...user.profile, telegram: "originaluser", instagram: "dog.name",
      website: "https://example.com/", birthDate: "1999-01-01",
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, string>;
        for (const [field, value] of Object.entries(body)) {
          state[field] = value === "" ? null : value;
        }
        return envelope({ userId: "A" });
      }
      return envelope({ ...user, profile: state });
    });
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      for (const field of ["telegram", "instagram", "website", "birthDate"])
        await ui.input("#profile-edit-" + field, "");
      await ui.save();
      const updates = fetcher.mock.calls.filter(([_url, init]) => init?.method === "PUT");
      expect(updates).toHaveLength(1);
      expect(JSON.parse(String(updates[0][1]?.body))).toEqual({
        telegram: "", instagram: "", website: "", birthDate: "",
      });
      expect(window.location.pathname).toBe("/profile");
    } finally { await ui.cleanup(); }
  });

  it("invalid Телеграм input fails locally without sending a POST or PUT", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => envelope(profile("A")));
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      await ui.input("#profile-edit-telegram", "@@not valid");
      await ui.save();
      expect(ui.host.textContent).toContain("username");
      expect(fetcher.mock.calls.filter(([_url, init]) => init?.method === "PUT"))
        .toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("a server 503 retains the draft and URL; cancel does not send another PUT", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? envelope(null, 503) : envelope(profile("A")));
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      await ui.input("#profile-edit-about", "Неотправленный текст");
      await ui.save();
      expect(window.location.pathname).toBe("/profile/editBio");
      expect(ui.host.querySelector<HTMLTextAreaElement>("#profile-edit-about")?.value)
        .toBe("Неотправленный текст");
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Результат сохранения неизвестен");
      await ui.clickButton("Вернуться к профилю");
      expect(window.location.pathname).toBe("/profile");
      expect(fetcher.mock.calls.filter(([_url, init]) => init?.method === "PUT"))
        .toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("refuses a mismatched profile identity and never allows writing", async () => {
    const fetcher = vi.fn(async (_url: string) => envelope(profile("other-user")));
    const ui = await mount("/profile/editBio", "A", fetcher);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("пользователь не совпадает");
      expect(ui.host.querySelector('form[aria-label="Редактирование профиля"]'))
        .toBeNull();
      expect(ui.host.innerHTML).not.toContain("Санкт-Петербург");
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/user/profile", "/api/v1/user/onboarding-tour",
      ]);
    } finally { await ui.cleanup(); }
  });
});
