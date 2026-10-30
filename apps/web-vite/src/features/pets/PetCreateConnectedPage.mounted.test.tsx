// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetCreateConnectedPage } from "./PetCreateConnectedPage";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const actor = { id: "owner_A", username: "ownerA", role: "USER" };
const saved = {
  id: "new_pet_01", ownerId: "owner_A", name: "Барни", type: "DOG",
  breed: "Метис", showInProfile: true,
  birthDate: "2020-03-15T00:00:00.000Z", weightKg: null,
  heightCm: null, notes: null,
};
const response = (status: number, data?: unknown) => new Response(JSON.stringify({
  success: status >= 200 && status < 300, data, error: "REDACTED",
}), { status, headers: { "content-type": "application/json" } });
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
async function field(id: string, text: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>("#g05-" + id);
  expect(input, id).not.toBeNull();
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    set?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function formSubmit() {
  await field("name", "Барни");
  await field("breed", "Метис");
  await field("birthDate", "15.03.2020");
  await act(async () => host.querySelector<HTMLFormElement>("form")?.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  ));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, actor);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); cache.clear(); host.remove(); vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <PetCreateConnectedPage userId="owner_A" />
  </QueryClientProvider>));
}
describe("real /profile/addPet consumer vs original cookie API", () => {
  it("201 create then own GET readback before user sees confirmation", async () => {
    fetcher.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === "/api/v1/pets" && init.method === "POST")
        return response(201, saved);
      if (path === "/api/v1/pets/new_pet_01" && init.method === "GET")
        return response(200, saved);
      throw Error("UNEXPECTED_REQUEST");
    });
    await mount();
    expect(host.textContent).toContain("Добавить питомца");
    expect(host.textContent).not.toContain("макет");
    await formSubmit();
    expect(host.textContent).toContain("Питомец создан");
    expect(host.querySelector('a[href="/pets/new_pet_01"]')).not.toBeNull();
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/pets", "/api/v1/pets/new_pet_01",
    ]);
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(body).toMatchObject({
      name: "Барни", birthDate: "2020-03-15",
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("normal same-owner auth /me revalidation must not silently deny a valid create", async () => {
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/pets") return response(201, saved);
      if (path === "/api/v1/pets/new_pet_01") return response(200, saved);
      throw Error("UNEXPECTED_REQUEST");
    });
    await mount();
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {...actor});
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {...actor});
    });
    await formSubmit();
    expect(host.textContent).toContain("Питомец создан");
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
  });
  it("same ID with changed sessionRevision denies without POST", async () => {
    await mount();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {...actor,sessionRevision:"replaced"}));
    await formSubmit();
    expect(host.textContent).toContain("Результат создания не подтверждён");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("201 name/type alone are not proof: wrong persisted birth date denies confirmation", async () => {
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/pets") return response(201, saved);
      if (path === "/api/v1/pets/new_pet_01") return response(200, {
        ...saved, birthDate: "2022-01-01T00:00:00.000Z",
      });
      throw Error("UNEXPECTED_REQUEST");
    });
    await mount(); await formSubmit();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.textContent).toContain("Результат создания не подтверждён");
    expect(fetcher.mock.calls.filter(([_, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("201 confirms full breed, birthDate, notes and dimensions via owner GET", async () => {
    const persisted = { ...saved, heightCm: 46, notes: "Любит бегать" };
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/pets") return response(201, persisted);
      if (path === "/api/v1/pets/new_pet_01") return response(200, persisted);
      throw Error("UNEXPECTED_REQUEST");
    });
    await mount();
    await field("heightCm", "46"); await field("notes", "Любит бегать");
    await formSubmit();
    expect(host.textContent).toContain("Питомец создан");
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
      heightCm: 46, notes: "Любит бегать", breed: "Метис",
    });
  });
  it("auth principal changes after create POST: never GET with next actor's cookie", async () => {
    fetcher.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === "/api/v1/pets" && init.method === "POST") {
        cache.setQueryData(CURRENT_USER_QUERY_KEY, {
          id: "other_owner", username: "other_owner", role: "USER",
        });
        return response(201, saved);
      }
      throw Error("FOREIGN_ACTOR_GET_FORBIDDEN");
    });
    await mount();await formSubmit();
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(host.textContent).not.toContain("Питомец создан");
  });
  it("201 without matching persisted GET stays unknown, never success or replay", async () => {
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/pets") return response(201, saved);
      if (path === "/api/v1/pets/new_pet_01") return response(404);
      throw Error("UNEXPECTED_REQUEST");
    });
    await mount(); await formSubmit();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.textContent).toContain("Результат создания не подтверждён");
    expect(host.querySelector('a[href="/pets/new_pet_01"]')).toBeNull();
    expect(fetcher.mock.calls).toHaveLength(2);
  });
});
