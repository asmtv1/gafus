// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetCollection } from "./PetCollection";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetDetails } from "./PetDetails";
import { listMyPets, getMyPet } from "./petApi";

const pet = {
  id: "dog-1",
  name: "Бобик",
  type: "DOG",
  breed: "Лабрадор",
  showInProfile: true,
  notes: "PRIVATE_VET_NOTES",
  birthDate: "2023-01-01T00:00:00Z",
  weightKg: 12,
  heightCm: 35,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
};
const respond = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      ...(status === 200 ? {} : { error: "PRIVATE_BACKEND_ERROR" }),
    }),
    { status },
  );
afterEach(() => vi.unstubAllGlobals());
async function mount(view: "list" | "detail", fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"user-1",username:"owner",role:"USER"});
  const node =
    view === "list"
      ? createElement(PetCollection, { userId: "user-1" })
      : createElement(PetDetails, { userId: "user-1", petId: "dog-1" });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, node)));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  return {
    host,
    cache,
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    },
  };
}
describe("private pet list/detail stable display, no ownerId inference", () => {
  it("rejects duplicate IDs across the same owner list before React keys are rendered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond([pet, pet])));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });
  it("rejects empty-display pet names rather than projecting blank cards", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond([{ ...pet, name: "  " }])));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });
  it("rejects invalid dates before a broken birthday is shown on private details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ ...pet, birthDate: "not-a-date" })));
    await expect(getMyPet("dog-1")).rejects.toThrow("Некорректная дата");
  });
  it.each(["list", "detail"] as const)(
    "HTTP403 %s shows denied without 403 retry or private pet",
    async (view) => {
      const fetcher = vi.fn().mockResolvedValue(respond(null, 403));
      const screen = await mount(view, fetcher);
      try {
        expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("Нет доступа");
        expect(screen.host.textContent).not.toContain("PRIVATE_BACKEND_ERROR");
        expect(screen.host.textContent).not.toContain("Бобик");
        expect(
          Array.from(screen.host.querySelectorAll("button")).some(
            (b) => b.textContent?.trim() === "Повторить",
          ),
        ).toBe(false);
        expect(fetcher).toHaveBeenCalledTimes(1);
      } finally {
        await screen.cleanup();
      }
    },
  );
  it("HTTP404 pet detail shows neutral absence without retry or private payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond(null, 404));
    const screen = await mount("detail", fetcher);
    try {
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Питомец не найден или недоступен");
      expect(screen.host.querySelector('a[href="/pets"]')?.textContent)
        .toContain("Мои питомцы");
      expect(screen.host.querySelector(".pet-detail-card")).toBeNull();
      expect(screen.host.textContent).not.toContain("Не удалось загрузить данные питомца");
      expect(screen.host.textContent).not.toContain("PRIVATE_BACKEND_ERROR");
      expect(screen.host.textContent).not.toContain("PRIVATE_VET_NOTES");
      expect(screen.host.querySelectorAll("button")).toHaveLength(0);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await screen.cleanup();
    }
  });
  it("HTTP401 pet list links to login and leaves existing private cache empty", async () => {
    const screen = await mount("list", vi.fn().mockResolvedValue(respond(null, 401)));
    try {
      expect(screen.host.querySelector('a[href="/login"]')).not.toBeNull();
      expect(screen.host.textContent).not.toContain("PRIVATE_BACKEND_ERROR");
      expect(screen.host.querySelectorAll(".pet-collection-card")).toHaveLength(0);
    } finally {
      await screen.cleanup();
    }
  });
});
