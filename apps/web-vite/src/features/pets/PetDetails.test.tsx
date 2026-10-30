// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetDetails } from "./PetDetails";
import { getMyPet } from "./petApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { petPath, routeForPath } from "../../shared/router/location";

afterEach(() => vi.unstubAllGlobals());

const fullPet = {
  id: "pet123", name: "Барни", type: "DOG",
  breed: "Метис", showInProfile: true,
  birthDate: "2020-10-16T00:00:00.000Z",
  weightKg: 15.5, heightCm: 52, notes: "Аллергия",
  ownerId: "sensitive-user", awards: [{ id: "secret-award" }],
};

async function renderPet(
  data: unknown, status = 200,
  weight?: { data: unknown; status?: number; authenticated?: boolean },
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fetcher = vi.fn(async (path: string) => {
    const isWeight = path.endsWith("/weight");
    const http = isWeight ? (weight?.status ?? 200) : status;
    return new Response(JSON.stringify({
      success: http === 200, data: isWeight ? weight?.data : data,
      error: "Not found",
    }), { status: http });
  });
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (weight?.authenticated) cache.setQueryData(CURRENT_USER_QUERY_KEY, {
    id: "user-1", username: "test-owner", role: "USER",
  });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, createElement(PetDetails, {
      userId: "user-1", petId: "pet123",
    }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  let mounted = true;
  async function unmount() {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return {
    container, cache, unmount, fetcher,
    async cleanup() {
      await unmount();
      cache.clear();
      container.remove();
    },
  };
}

describe("Pet detail on protected explicit route", () => {
  it("verifies strict pet id route and never permits slash injection", () => {
    expect(petPath("pet123")).toBe("/pets/pet123");
    expect(routeForPath("/pets/pet123")).toBe("/pets/pet123");
    expect(() => petPath("../users")).toThrow("Invalid pet ID");
    expect(routeForPath("/pets/%2Fusers")).toBeNull();
  });

  it("shows only owner-visible UI fields and strips internal identifiers from query", async () => {
    const data = await renderPet(fullPet);
    try {
      expect(data.container.textContent).toContain("Барни");
      expect(data.container.querySelector("nav[aria-label=\"Навигация по питомцам\"]"))
        .not.toBeNull();
      expect(data.container.querySelectorAll("article.pet-detail-card .pet-details > div"))
        .toHaveLength(6);
      expect(data.container.querySelector("article.pet-detail-card h3")?.textContent)
        .toBe("О питомце");
      expect(data.container.textContent).toContain("Аллергия");
      expect(data.container.textContent).toContain("15.5 кг");
      expect(data.container.querySelector('a[href="/pets"]')).not.toBeNull();
      expect(data.container.textContent).not.toContain("sensitive-user");
      expect(JSON.stringify(data.cache.getQueryData(["pets", "detail", "user-1", "pet123"])))
        .not.toContain("secret-award");
    } finally {
      await data.cleanup();
    }
  });

  it("removes private pet details from Query cache when leaving the page", async () => {
    const data = await renderPet(fullPet);
    try {
      expect(data.cache.getQueryData(["pets", "detail", "user-1", "pet123"]))
        .toBeDefined();
      await data.unmount();
      expect(data.cache.getQueryData(["pets", "detail", "user-1", "pet123"]))
        .toBeUndefined();
    } finally { await data.cleanup(); }
  });

  it("server 404 fails closed and never shows a fake pet", async () => {
    const data = await renderPet(null, 404);
    try {
      expect(data.container.querySelector('[role="alert"]')).not.toBeNull();
      expect(data.container.textContent).not.toContain("Барни");
    } finally { await data.cleanup(); }
  });

  it("API client rejects invalid pet identifiers before sending a request", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    await expect(getMyPet("../users")).rejects.toThrow("идентификатор");
    expect(fake).not.toHaveBeenCalled();
  });
});

describe("original Web owner weight-history read inside real pet detail", () => {
  it("loads weight history on explicit owner action without leaking row metadata", async () => {
    const data = await renderPet(fullPet, 200, {
      authenticated: true,
      data: {
        currentWeightKg: 14.6,
        targetWeightKg: 13,
        entries: [
          { id: "row-1", petId: "pet123", ownerId: "PRIVATE_OTHER_FIELD",
            weightKg: 13.5, measuredAt: "2026-10-18T11:00:00.000Z",
            createdAt: "2026-10-18T11:01:00.000Z" },
          { id: "row-2", petId: "pet123", ownerId: "PRIVATE_OTHER_FIELD",
            weightKg: 14.6, measuredAt: "2026-10-20T11:00:00.000Z",
            createdAt: "2026-10-20T11:01:00.000Z" },
        ],
      },
    });
    try {
      const button = Array.from(data.container.querySelectorAll("button")).find(
        node => node.textContent?.trim() === "История веса",
      );
      expect(button).not.toBeUndefined();
      expect(data.fetcher).toHaveBeenCalledTimes(1);
      await act(async () => button?.click());
      await vi.waitFor(() => expect(data.container.textContent).toContain("14.6 кг"));
      expect(data.fetcher.mock.calls.map(([path]) => path)).toEqual([
        "/api/v1/pets/pet123",
        "/api/v1/pets/pet123/weight",
      ]);
      expect(data.container.textContent).toContain("13.5 кг");
      expect(data.container.textContent).not.toContain("PRIVATE_OTHER_FIELD");
      expect(JSON.stringify(data.cache.getQueryData(
        ["pets", "weight-history", "user-1", "pet123"],
      ))).not.toContain("PRIVATE_OTHER_FIELD");
    } finally {
      await data.cleanup();
    }
  });
});

describe("real pet card weight-history deny and session lifecycle", () => {
  it("returns a generic owner-safe 404 without fabricated measurements", async () => {
    const data = await renderPet(fullPet, 200, {
      authenticated: true, data: null, status: 404,
    });
    try {
      const button = Array.from(data.container.querySelectorAll("button")).find(
        node => node.textContent === "История веса",
      );
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await vi.waitFor(() => expect(data.container.textContent)
        .toContain("Питомец не найден или недоступен."));
      expect(data.container.textContent).not.toContain("13.5 кг");
      expect(data.fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await data.cleanup();
    }
  });

  it("empties private weight query and hides section when own auth principal rotates", async () => {
    const data = await renderPet(fullPet, 200, {
      authenticated: true,
      data: { currentWeightKg: null, targetWeightKg: null, entries: [] },
    });
    try {
      const button = Array.from(data.container.querySelectorAll("button")).find(
        node => node.textContent === "История веса",
      );
      await act(async () => button?.click());
      await vi.waitFor(() => expect(data.container.textContent)
        .toContain("Измерений пока нет."));
      expect(data.fetcher).toHaveBeenCalledTimes(2);
      await act(async () => data.cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "user-2", username: "other", role: "USER",
      }));
      await vi.waitFor(() => expect(data.container.textContent)
        .toContain("Сессия изменилась."));
      expect(data.container.textContent).not.toContain("Измерений пока нет.");
      await vi.waitFor(() => expect(data.cache.getQueryData(
        ["pets", "weight-history", "user-1", "pet123"],
      )).toBeUndefined());
    } finally {
      await data.cleanup();
    }
  });
});
