// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PetCollection } from "./PetCollection";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetDetails } from "./PetDetails";
const pet = {
  id: "p1",
  name: "PRIVATE_OLD_PET",
  type: "DOG",
  breed: "PRIVATE_BREED",
  showInProfile: true,
};
const detail = {
  ...pet,
  notes: "PRIVATE_MEDICAL_NOTES",
  birthDate: null,
  weightKg: 16,
  heightCm: 48,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data, error: "PRIVATE_SERVER_TRACE" }), {
    status,
  });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount(detailMode = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        {detailMode ? <PetDetails userId="A" petId="p1" /> : <PetCollection userId="A" />}
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
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner",role:"USER"});
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("pets current owner read", () => {
  it("PET-R01 cached list withheld while GET pending", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["pets", "mine", "A"], [pet]);
    await mount();
    expect(host.textContent).toContain("Перепроверяем список питомцев");
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
    await act(async () => pending.resolve(response([{ ...pet, name: "Новый питомец" }])));
    await flush();
    expect(host.textContent).toContain("Новый питомец");
  });
  it("PET-R02 HTTP401 closes cached list and offers login", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["pets", "mine", "A"], [pet]);
    await mount();
    await act(async () => pending.resolve(response(null, 401)));
    await flush();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
  });
  it("PET-R03 private medical details hidden during GET", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["pets", "detail", "A", "p1"], detail);
    await mount(true);
    expect(host.textContent).toContain("Перепроверяем карточку питомца");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
    expect(host.textContent).not.toContain("16 кг");
    await act(async () => pending.resolve(response({ ...detail, name: "Новый питомец" })));
    await flush();
    expect(host.textContent).toContain("Новый питомец");
  });
  it("PET-R04 HTTP403 hides cached notes without leaking payload", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["pets", "detail", "A", "p1"], detail);
    await mount(true);
    await act(async () => pending.resolve(response(null, 403)));
    await flush();
    expect(host.textContent).toContain("Нет доступа к питомцу");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_TRACE");
  });
  it("PET-R07 cached pet detail stays hidden after a fresh HTTP404", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["pets", "detail", "A", "p1"], detail);
    await mount(true);
    expect(host.textContent).toContain("Перепроверяем карточку питомца");
    expect(host.querySelector(".pet-detail-card")).toBeNull();
    await act(async () => pending.resolve(response(null, 404)));
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain("Питомец не найден или недоступен");
    expect(host.querySelector('a[href="/pets"]')?.textContent).toContain("Мои питомцы");
    expect(host.querySelector(".pet-detail-card")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
    expect(host.textContent).not.toContain("PRIVATE_BREED");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_TRACE");
    expect([...host.querySelectorAll("button")].some(button =>
      button.textContent?.trim() === "Повторить")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("PET-R08 HTTP503 preserves manual retry and renders only its fresh GET", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(null, 503))
      .mockResolvedValueOnce(response({ ...detail, name: "Актуальный питомец" }));
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["pets", "detail", "A", "p1"], detail);
    await mount(true);
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain("Не удалось загрузить данные питомца");
    expect(host.querySelector(".pet-detail-card")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Повторить");
    expect(retry).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => retry?.click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".pet-detail-card")?.textContent)
      .toContain("Актуальный питомец");
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("PET-R05 ordinary owner list A→B→A must not revive A cards", async () => {
    const { CURRENT_USER_QUERY_KEY } = await import("../../shared/auth/useAuth");
    cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([pet])));
    await mount();
    expect(host.textContent).toContain("PRIVATE_OLD_PET");
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "ownerB", role: "USER" }),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" }),
    );
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_OLD_PET");
  });
  it("PET-R06 ordinary pet details close medical notes after principal switch", async () => {
    const { CURRENT_USER_QUERY_KEY } = await import("../../shared/auth/useAuth");
    cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(detail)));
    await mount(true);
    expect(host.textContent).toContain("PRIVATE_MEDICAL_NOTES");
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "ownerB", role: "USER" }),
    );
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
  });
});
