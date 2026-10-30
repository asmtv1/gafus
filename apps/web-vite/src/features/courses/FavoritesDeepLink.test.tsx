// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll,  afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate, routeForPath } from "../../shared/router/location";

const courses = [
  {
    id: "favorite-1", name: "Избранный курс А", type: "attention",
    shortDesc: "Тренировка внимания", duration: "12 дней", isPaid: true,
    isPrivate: false, hasAccess: false, isFavorite: true,
    userStatus: "IN_PROGRESS", trainingLevel: "BEGINNER",
  },
  {
    id: "other-2", name: "Неизбранный курс Б", type: "basic",
    shortDesc: "Второй курс", duration: "8 дней", isPaid: false,
    isPrivate: false, hasAccess: true, isFavorite: false,
    userStatus: "NOT_STARTED", trainingLevel: "INTERMEDIATE",
  },
];
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data, error: "Unavailable" }),
    { status });

// Warm the route modules used by this synthetic navigation suite without
// disabling lazy loading for real users.
beforeAll(async()=>{await Promise.all([
  import("./CourseCatalog"),
  import("./CourseOverview"),
  import("../profile/ProfileOverview"),
]);});
/** Wait for the actual React.lazy screen to commit, not five unconditional
 * 100 ms sleeps per click/filter/back. NAV-C03 performs many transitions and
 * hit Vitest's 5 s per-test budget purely while sleeping in the full run. */
const settleRoute=async()=>{
  // One React commit tick covers synchronous field changes and Hono-shaped mocks.
  await act(async()=>{await new Promise(done=>setTimeout(done,15));});
  // A real lazy route can require more than one tick. Poll only while the
  // Suspense fallback is present, without changing the global test timeout.
  for(let i=0;i<20&&document.querySelector('[data-gafus-loader="screen"]');i++){
    await act(async()=>{await new Promise(done=>setTimeout(done,25));});
  }
};

async function renderRoute(route: string, userId: string | null,
  fetcher: ReturnType<typeof vi.fn>) {
  window.history.replaceState(null, "", route);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  } });
  if (userId) cache.setQueryData(CURRENT_USER_QUERY_KEY,
    { id: userId, username: "person", role: "USER" });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(App))));
  await settleRoute();
  // The first lazy import has a distinct commit from App's eager shell.
  // Verify the *actual* requested screen, not merely elapsed wall time,
  // before exercising its filters/links. This is bounded inside Vitest's
  // existing 5 s test timeout and does not alter runtime route semantics.
  const expectedPath = route.startsWith("/favorites") ? (userId ? "/courses" : "/") :
    new URL(route, "http://localhost").pathname;
  const initialReady = () => {
    if (window.location.pathname !== expectedPath) return false;
    if (expectedPath === "/") return !!host.textContent?.includes("Начать заниматься");
    if (expectedPath.startsWith("/courses/"))
      return !!host.querySelector('[aria-label="Обзор курса"]');
    if (expectedPath === "/courses") return !!host.querySelector("#course-filter-search") ||
      !!host.textContent?.includes("В каталоге пока нет доступных курсов.") ||
      !!host.textContent?.includes("Не удалось загрузить курсы.");
    return true;
  };
  for (let i=0;i<80&&!initialReady();i++){
    await act(async()=>{await new Promise(done=>setTimeout(done,15));});
  }
  expect(initialReady(), `Lazy navigation to ${expectedPath} did not commit the route UI`).toBe(true);
  return {
    host, cache,
    async press(label: string) {
      const link = Array.from(host.querySelectorAll<HTMLAnchorElement>("a"))
        .find(node => node.textContent?.includes(label));
      expect(link).toBeDefined();
      await act(async () => link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, button: 0,
      })));
      await settleRoute();
    },
    async dispose() {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    },
  };
}
async function changeField(host: HTMLElement, id: string, value: string) {
  const control = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  expect(control).not.toBeNull();
  await act(async () => {
    if (!control) return;
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settleRoute();
}
async function browserBack() {
  await act(async () => {
    window.history.back();
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  await settleRoute();
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AG2 legacy /favorites read-only route characterization", () => {
  it("recognizes the legacy address but not invalid lookalikes", () => {
    expect(routeForPath("/favorites")).toBe("/favorites");
    expect(routeForPath("/favorites/")).toBe("/favorites");
    expect(routeForPath("/favorites/private")).toBeNull();
    expect(routeForPath("/favorites%2fprofile")).toBeNull();
  });

  it("NAV-C01 Catalog filter view returns after real detail history.back", async () => {
    const fetcher = vi.fn(async () => response(courses));
    const ui = await renderRoute("/courses", "owner-A", fetcher);
    try {
      const search = ui.host.querySelector<HTMLInputElement>("#course-filter-search")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
          .set!.call(search, "Избранный");
        search.dispatchEvent(new Event("input", { bubbles: true }));
        search.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const level = ui.host.querySelector<HTMLSelectElement>("#course-filter-level")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
          .set!.call(level, "BEGINNER");
        level.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const sort = ui.host.querySelector<HTMLSelectElement>("#course-filter-sort")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
          .set!.call(sort, "name");
        sort.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await changeField(ui.host, "course-filter-kind", "paid");
      await changeField(ui.host, "course-filter-progress", "IN_PROGRESS");
      await ui.press("Избранный курс А");
      expect(window.location.pathname).toBe("/trainings/attention");
      await act(async () => {
        window.history.back();
        await new Promise(resolve => setTimeout(resolve, 40));
      });
      await settleRoute();
      expect(window.location.pathname).toBe("/courses");
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value)
        .toBe("Избранный");
      expect(ui.host.querySelector<HTMLSelectElement>("#course-filter-level")?.value)
        .toBe("BEGINNER");
      expect(ui.host.querySelector<HTMLSelectElement>("#course-filter-sort")?.value)
        .toBe("name");
      expect(ui.host.querySelector<HTMLSelectElement>("#course-filter-kind")?.value)
        .toBe("paid");
      expect(ui.host.querySelector<HTMLSelectElement>("#course-filter-progress")?.value)
        .toBe("IN_PROGRESS");
    } finally { await ui.dispose(); }
  });


  it("NAV-C02 catalog does not advertise the disabled favorites screen", async () => {
    const fetcher = vi.fn(async (url: string, _opts?: RequestInit) => url === "/api/v1/auth/me"
      ? response({ id: "owner-A", username: "person", role: "USER" })
      : response(courses));
    const ui = await renderRoute("/courses", "owner-A", fetcher);
    try {
      expect(ui.host.querySelector('a[href="/favorites"]')).toBeNull();
      expect(ui.host.querySelector('[aria-label="Избранные курсы"]')).toBeNull();
      expect(ui.host.querySelector('[aria-label="Добавить в избранное"]')).toBeNull();
      expect(ui.host.querySelector('[aria-label="Убрать из избранного"]')).toBeNull();
      expect(ui.host.textContent).toContain("Неизбранный курс Б");
      expect(fetcher.mock.calls.filter(([url, opts]) =>
        url === "/api/v1/courses/favorites" || opts?.method === "POST")).toHaveLength(0);
    } finally { await ui.dispose(); }
  });
  it("NAV-C03 fresh catalog navigation resets; malformed state cannot restore", async () => {
    const ui = await renderRoute("/courses", "owner-A", vi.fn(async () => response(courses)));
    try {
      await changeField(ui.host, "course-filter-search", "Избранный");
      const key = "__gafusCourseViewV1";
      const prior = window.history.state[key];
      expect(prior.filters.search).toBe("Избранный");
      expect(window.location.search).toBe("");
      await ui.press("Избранный курс А");
      await act(async () => {
        window.history.pushState(null, "", "/courses");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await settleRoute();
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
      await ui.press("Избранный курс А");
      await browserBack();
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
      await changeField(ui.host, "course-filter-search", "Избранный");
      const current = window.history.state[key];
      window.history.replaceState({ unrelated: 17,
        [key]: { ...current, filters: { ...current.filters, search: { unsafe: true } } },
      }, "", window.location.href);
      await ui.press("Избранный курс А");
      await browserBack();
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
      expect(window.history.state.unrelated).toBe(17);
    } finally { await ui.dispose(); }
  });

  it("NAV-C04 account A-B-A on detail invalidates prior catalog view", async () => {
    const ui = await renderRoute("/courses", "owner-A", vi.fn(async () => response(courses)));
    try {
      await changeField(ui.host, "course-filter-search", "Избранный");
      expect(window.history.state.__gafusCourseViewV1.filters.search).toBe("Избранный");
      await ui.press("Избранный курс А");
      await act(async () => {
        ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
          { id: "owner-B", username: "personB", role: "USER" });
      });
      await act(async () => {
        ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
          { id: "owner-A", username: "personA", role: "USER" });
      });
      await browserBack();
      expect(window.location.pathname).toBe("/courses");
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
      expect(ui.host.textContent).not.toContain("Секрет A");
    } finally { await ui.dispose(); }
  });

  it("NAV-C05 signed-in root canonicalizes to /courses without leaking previous filters", async () => {
    const ui = await renderRoute("/courses?from=PRIVATE#bookmark", "owner-A",
      vi.fn(async () => response(courses)));
    try {
      await changeField(ui.host, "course-filter-search", "Избранный");
      const oldEntry = window.history.state;
      expect(oldEntry.__gafusCourseViewV1.filters.search).toBe("Избранный");
      expect(window.location.search+window.location.hash).toBe("?from=PRIVATE#bookmark");
      await act(async () => navigate("/"));
      await settleRoute();
      // Authenticated users are redirected from `/` back to `/courses`.
      // Re-entry must clear stale query/hash, search state and private cache.
      await settleRoute();
      expect(window.location.pathname).toBe("/courses");
      expect(window.location.search+window.location.hash).toBe("");
      expect(ui.host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
      expect(window.history.state?.__gafusSpaNavigation).toBe(true);
      expect(window.history.state?.__gafusCourseViewV1).toBeUndefined();
    } finally { await ui.dispose(); }
  });


  it("legacy favorites URL redirects guests to public courses without favorites API", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === "/api/v1/auth/me" ? response(null, 401) : response(courses));
    const ui = await renderRoute("/favorites", null, fetcher);
    try {
      // Guests still follow the existing presentation-first auth gate.
      expect(window.location.pathname).toBe("/");
      expect(ui.host.querySelector('[aria-label="Избранные курсы"]')).toBeNull();
      expect(ui.host.textContent).not.toContain("Избранные курсы");
      expect(fetcher.mock.calls.every(([url]) => url !== "/api/v1/courses/favorites")).toBe(true);
    } finally { await ui.dispose(); }
  });

  it("direct /favorites URL never renders a filtered favorites list for an authenticated owner", async () => {
    const fetcher = vi.fn(async (url: string, _opts?: RequestInit) => url === "/api/v1/auth/me"
      ? response({ id: "owner-A", username: "person", role: "USER" })
      : response(courses));
    const ui = await renderRoute("/favorites", "owner-A", fetcher);
    try {
      expect(window.location.pathname).toBe("/courses");
      expect(ui.host.querySelector('[aria-label="Избранные курсы"]')).toBeNull();
      expect(ui.host.textContent).toContain("Избранный курс А");
      expect(ui.host.textContent).toContain("Неизбранный курс Б");
      expect(ui.host.querySelector('a[href="/favorites"]')).toBeNull();
      expect(fetcher.mock.calls.every(([url,opts]) =>
        url !== "/api/v1/courses/favorites" && opts?.method !== "POST")).toBe(true);
    } finally { await ui.dispose(); }
  });

  it("course detail keeps course access and hides both favorite mutation buttons", async () => {
    const fetcher = vi.fn(async (url: string, _opts?: RequestInit) => url === "/api/v1/auth/me"
      ? response({ id: "owner-A", username: "person", role: "USER" })
      : response(courses));
    const ui = await renderRoute("/courses/favorite-1", "owner-A", fetcher);
    try {
      expect(ui.host.querySelector('[aria-label="Обзор курса"]')).not.toBeNull();
      expect(ui.host.querySelector('[aria-label="Добавить в избранное"]')).toBeNull();
      expect(ui.host.querySelector('[aria-label="Убрать из избранного"]')).toBeNull();
      expect(fetcher.mock.calls.some(([url,opts]) =>
        url === "/api/v1/courses/favorites" || opts?.method === "POST")).toBe(false);
    } finally { await ui.dispose(); }
  });

  it("legacy favorites address retains normal catalog empty and error behavior", async () => {
    const empty = vi.fn(async (url: string) => url === "/api/v1/auth/me"
      ? response({ id: "owner-A", username: "person", role: "USER" })
      : response([]));
    let ui = await renderRoute("/favorites", "owner-A", empty);
    try {
      expect(window.location.pathname).toBe("/courses");
      expect(ui.host.textContent).toContain("В каталоге пока нет доступных курсов.");
      expect(ui.host.textContent).not.toContain("У вас пока нет избранных курсов");
    } finally { await ui.dispose(); }
    const error = vi.fn(async () => response(null, 503));
    ui = await renderRoute("/favorites", "owner-B", error);
    try {
      expect(window.location.pathname).toBe("/courses");
      expect(ui.host.querySelector('[aria-label="Избранные курсы"]')).toBeNull();
      expect(ui.host.textContent).not.toContain("Избранные курсы");
    } finally { await ui.dispose(); }
  });
  it("isolates favorites when changing the authenticated account", async () => {
    // The App session can revalidate /auth/me independently of course GET.
    // Route mocks by URL and current owner, not by fragile network call order.
    let serverActor = "owner-A";
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/v1/auth/me") return response({
        id: serverActor, username: "person", role: "USER",
      });
      if (url === "/api/v1/courses") return response([{ ...courses[0],
        name: serverActor === "owner-A" ? "Секретный курс владельца A" : "Курс владельца B",
      }]);
      throw Error("Unexpected GET " + url);
    });
    const ui = await renderRoute("/favorites", "owner-A", fetcher);
    try {
      expect(ui.host.textContent).toContain("Секретный курс владельца A");
      await act(async () => {
        serverActor = "owner-B";
        ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
          { id: "owner-B", username: "person2", role: "USER" });
      });
      await settleRoute();
      expect(ui.host.textContent).not.toContain("Секретный курс владельца A");
      expect(ui.host.textContent).toContain("Курс владельца B");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/v1/courses").length)
        .toBeGreaterThanOrEqual(2);
      expect(ui.cache.getQueryData(["courses", "catalog", "owner-B"])).toBeDefined();
    } finally { await ui.dispose(); }
  });
});
