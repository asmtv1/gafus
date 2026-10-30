// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import {
  petVetVisitsPath,
  petVetVisitsIdFromPath,
  routeForPath,
} from "../../shared/router/location";

const ownerPet = {
  id: "pet-A",
  name: "Барни",
  type: "DOG",
  breed: "Метис",
  showInProfile: true,
  birthDate: "2020-02-05T00:00:00.000Z",
  weightKg: 12.5,
  heightCm: 45,
  notes: "PRIVATE_VET_NOTES",
  ownerId: "SECRET_OWNER_ID",
};
function server(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "Unavailable",
    }),
    { status },
  );
}
async function open(url: string, userId: string | null, fetcher: ReturnType<typeof vi.fn>) {
  window.history.replaceState(null, "", url);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  if (userId)
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: userId,
      username: "owner",
      role: "USER",
    });
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: cache }, createElement(App))),
  );
  for (let i = 0; i < 12; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 12));
    });
    if (
      host.textContent?.includes("История посещений") ||
      host.textContent?.includes("Требуется авторизация") ||
      host.querySelector('[role="alert"]')
    )
      break;
  }
  return {
    host,
    cache,
    async cleanup() {
      await act(async () => root.unmount());
      await new Promise((resolve) => setTimeout(resolve, 10));
      cache.clear();
      host.remove();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AG2 owner-verified legacy pet vet visit deep link", () => {
  it("accepts only one safe pet ID followed by the exact vet-visits suffix", () => {
    expect(petVetVisitsPath("pet-A")).toBe("/pets/pet-A/vet-visits");
    expect(petVetVisitsIdFromPath("/pets/pet-A/vet-visits")).toBe("pet-A");
    expect(routeForPath("/pets/pet-A/vet-visits")).toBe("/pets/pet-A/vet-visits");
    expect(routeForPath("/pets/pet-A/vet-visits/")).toBe("/pets/pet-A/vet-visits");
    for (const invalid of [
      "/pets/%2Fadmin/vet-visits",
      "/pets/../vet-visits",
      "/pets/pet-A/vet-visits/secret",
      "/pets/pet-A/vet-visits-edit",
      "/pets//vet-visits",
      "/pets/pet-A/vet-visits%2fsecret",
    ])
      expect(routeForPath(invalid)).toBeNull();
    expect(() => petVetVisitsPath("../admin")).toThrow();
  });

  it("does not fetch an owner's pet or visits for a guest", async () => {
    const fetcher = vi.fn(async (_url: string) => server(null, 401));
    const ui = await open("/pets/pet-A/vet-visits", null, fetcher);
    try {
      expect(ui.host.textContent).toContain("Начать заниматься");
      expect(ui.host.textContent).not.toContain("Страница не найдена");
      const urls = fetcher.mock.calls.map(([url]) => url);
      expect(urls).not.toContain("/api/v1/pets/pet-A");
      expect(urls.some((url) => String(url).includes("vet-visits"))).toBe(false);
    } finally {
      await ui.cleanup();
    }
  });

  it("shows owner-verified pet and real empty Hono history without leaking health", async () => {
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) =>
      url === "/api/v1/pets/pet-A/vet-visits" ? server([]) : server(ownerPet),
    );
    const ui = await open("/pets/pet-A/vet-visits?from=profile#last", "user-A", fetcher);
    try {
      expect(ui.host.textContent).toContain("Барни");
      expect(ui.host.textContent).toContain("Посещения врача");
      expect(ui.host.textContent).toContain("Здесь будет история посещений");
      // Retained Next page has a single back-link to /pets, not a duplicate
      // nested card link that rendered twice in the old Vite wrapper.
      expect([...ui.host.querySelectorAll<HTMLAnchorElement>('a[href="/pets"]')]
        .some(link => link.textContent?.includes("К питомцам"))).toBe(true);
      expect(ui.host.textContent).not.toContain("PRIVATE_VET_NOTES");
      expect(ui.host.textContent).not.toContain("SECRET_OWNER_ID");
      // The shared App now also reads onboarding state. Keep the strict
      // medical GET sequence assertion, independent of unrelated safe reads.
      expect(fetcher.mock.calls.map(([url]) => url)
        .filter((url) => String(url).startsWith("/api/v1/pets/"))).toEqual([
          "/api/v1/pets/pet-A",
          "/api/v1/pets/pet-A/vet-visits",
        ]);
      expect(fetcher.mock.calls.every(([, options]) =>
        !options || !options.method || options.method === "GET")).toBe(true);
      expect(window.location.search).toBe("?from=profile");
      expect(window.location.hash).toBe("#last");
    } finally {
      await ui.cleanup();
    }
    expect(ui.cache.getQueryData(["pets", "vetVisitsOwner", "user-A", "pet-A"])).toBeUndefined();
  });

  it("fails closed on 403 or 404 with no pet name or synthetic visits", async () => {
    for (const code of [403, 404]) {
      const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => server(null, code));
      const ui = await open("/pets/pet-A/vet-visits", "user-A", fetcher);
      try {
        expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
        expect(ui.host.textContent).not.toContain("Барни");
        expect(ui.host.textContent).not.toContain("История посещений");
        expect(fetcher.mock.calls.map(([url]) => url)
          .filter((url) => String(url).startsWith("/api/v1/pets/")))
          .toEqual(["/api/v1/pets/pet-A"]);
        expect(fetcher.mock.calls.every(([, options]) =>
          !options || !options.method || options.method === "GET")).toBe(true);
      } finally {
        await ui.cleanup();
      }
    }
  });

  it("A→B→A in the same App instance never revives prior medical view", async () => {
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) =>
      url === "/api/v1/pets/pet-A/vet-visits" ? server([]) : server(ownerPet));
    const ui = await open("/pets/pet-A/vet-visits", "user-A", fetcher);
    try {
      expect(ui.host.textContent).toContain("Барни");
      await act(async () => ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "user-B", username: "other", role: "USER" }));
      await act(async () => ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "user-A", username: "owner", role: "USER" }));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Сессия изменилась");
      expect(ui.host.textContent).not.toContain("Барни");
      expect(ui.host.textContent).not.toContain("PRIVATE_VET_NOTES");
      expect(fetcher.mock.calls.every(([, options]) => !options ||
        !options.method || options.method === "GET")).toBe(true);
    } finally {
      await ui.cleanup();
    }
  });
  it("does not show stale owner's pet during a principal switch", async () => {
    const fetcher = vi
      .fn(async (_url: string) => server(null, 403))
      .mockResolvedValueOnce(server(ownerPet))
      .mockResolvedValueOnce(server(null, 403));
    const ui = await open("/pets/pet-A/vet-visits", "user-A", fetcher);
    try {
      expect(ui.host.textContent).toContain("Барни");
      await act(async () =>
        ui.cache.setQueryData(CURRENT_USER_QUERY_KEY, {
          id: "user-B",
          username: "other",
          role: "USER",
        }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 35));
      });
      expect(ui.host.textContent).not.toContain("Барни");
      // On a busy Web suite the next principal's denied GET may resolve
      // after the initial privacy fence. Wait for a REAL error, never mock
      // an error or accept the old owner's health data in the interim.
      for (let attempt = 0; attempt < 40 &&
          !ui.host.querySelector('[role="alert"]'); attempt++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
        expect(ui.host.textContent).not.toContain("PRIVATE_VET_NOTES");
        expect(ui.host.textContent).not.toContain("Барни");
      }
      expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
      // Connected Hono history may issue a second owner-scoped GET before
      // principal change. No extra write, no foreign medical data exposure.
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/v1/pets/pet-A/vet-visits");
    } finally {
      await ui.cleanup();
    }
  });
});
