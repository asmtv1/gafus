// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetVetVisits } from "./PetVetVisits";
import type { VetVisitsSourceWire } from "./vetVisitsSourceMock";
const pet = {
  id: "pet-A",
  name: "Барни",
  type: "DOG",
  breed: "Метис",
  showInProfile: true,
  birthDate: null,
  notes: "SECRET_PET_NOTE",
  weightKg: null,
  heightCm: null,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
};
const visit = (id = "v1", petId = "pet-A") => ({
  id,
  petId,
  visitedOn: "2026-10-10",
  specialty: "Терапевт",
  doctorName: "Андрей",
  clinic: "Ветклиника",
  diagnosis: "PRIVATE_DIAGNOSIS",
  conclusion: "PRIVATE_CONCLUSION",
  notes: "PRIVATE_MEDICAL_NOTES",
  attachments: [
    {
      id: "a1",
      name: "pdf.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1500,
      hasPreview: false,
      previewProcessing: false,
      signedUrl: "SECRET_SIGNED",
      ownerId: "SECRET_OWNER",
    },
  ],
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => (resolve = ok));
  return { promise, resolve };
};
let host: HTMLDivElement, root: Root, cache: QueryClient;
let wire: VetVisitsSourceWire,
  visitRead: ReturnType<typeof vi.fn<VetVisitsSourceWire["list"]>>,
  fetcher: ReturnType<typeof vi.fn>;
const tick = async () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 28));
  });
async function mount(enabled = true, owner = "owner", fixture = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <PetVetVisits
          userId={owner}
          petId="pet-A"
          showVetVisitsOptIn={enabled}
          vetVisitsSyntheticTransport={fixture ? wire : undefined}
        />
      </QueryClientProvider>,
    ),
  );
  await tick();
}
async function click(label: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  expect(b, label).toBeDefined();
  await act(async () => b?.click());
  await tick();
}
async function enter() {
  await mount();
  await click("История приёмов (макет)");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner", username: "owner", role: "USER" });
  visitRead = vi.fn(async () => [visit()]);
  wire = { fixtureKind: "AG2_VET_VISITS_LEGACY_NEXT_GET_SYNTHETIC", list: visitRead };
  fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/api/v1/pets/pet-A/vet-visits" && init.method === "GET")
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    if (url !== "/api/v1/pets/pet-A" || init.method !== "GET") throw Error("UNAUTHORIZED_NETWORK");
    return new Response(JSON.stringify({ success: true, data: pet }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("WEB-URL-029 owner verified existing PetVetVisits route -> optin medical visit", () => {
  it("M01 normal route uses original Hono owner GET, not a synthetic placeholder", async () => {
    await mount(false);
    // Preserved Next vet page renders an h1 and separate owner pet subtitle,
    // not the concatenated title from the former generic Vite wrapper.
    expect(host.querySelector(".gafus-vet-next-page h1")?.textContent)
      .toBe("Посещения врача");
    expect(host.textContent).toContain("Барни");
    expect(host.textContent).toContain("Здесь будет история посещений");
    expect(host.textContent).not.toContain("История приёмов (макет)");
    expect(host.textContent).not.toContain("История посещений врача пока недоступна");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/pets/pet-A",
      "/api/v1/pets/pet-A/vet-visits",
    ]);
    expect(fetcher.mock.calls.every(([, opts]) => opts.method === "GET")).toBe(true);
    expect(visitRead).not.toHaveBeenCalled();
  });
  it("M02 explicit fixture required", async () => {
    await mount(true, "owner", false);
    expect(host.textContent).not.toContain("История приёмов (макет)");
  });
  it("M03 optin after pet GET, medical notes hidden by default", async () => {
    await enter();
    expect(visitRead).toHaveBeenCalledExactlyOnceWith("pet-A");
    expect(host.textContent).toContain("Ветклиника");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(host.innerHTML).not.toContain("SECRET_SIGNED");
    await click("Показать медицинские сведения");
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).toContain("PRIVATE_CONCLUSION");
    expect(host.textContent).toContain("pdf.pdf");
    await click("Скрыть медицинские сведения");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    await click("К карточке питомца");
    expect(host.textContent).not.toContain("Ветклиника");
  });
  it("M04 empty", async () => {
    visitRead.mockResolvedValueOnce([]);
    await enter();
    expect(host.textContent).toContain("Записей о посещениях пока нет");
  });
  it("M05 backend 403 does not show empty or private medical text", async () => {
    visitRead.mockRejectedValueOnce({ status: 403, message: "SECRET_PG" });
    await enter();
    expect(host.textContent).toContain("Не удалось получить посещения врача");
    expect(host.textContent).not.toContain("SECRET_PG");
    expect(host.textContent).not.toContain("Записей о посещениях пока нет");
  });
  it("M06 failed read can manual retry", async () => {
    visitRead.mockRejectedValueOnce(Error("SECRET_OUTAGE"));
    await enter();
    await click("Повторить чтение");
    expect(visitRead).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Ветклиника");
  });
  it("M07 reject forged different pet visit list", async () => {
    visitRead.mockResolvedValueOnce([visit("v1", "other-pet")]);
    await enter();
    expect(host.textContent).toContain("Не удалось получить посещения врача");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
  });
  it("M08 must not load visits when owner pet GET denied", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "SECRET_NOT_FOUND" }), { status: 404 }),
    );
    await mount();
    expect(host.textContent).toContain("Не удалось подтвердить доступ");
    expect(host.textContent).not.toContain("История приёмов (макет)");
    expect(visitRead).not.toHaveBeenCalled();
  });
  it("M09 A->B->A pending visit cannot expose old result", async () => {
    const d = deferred<unknown>();
    visitRead.mockReturnValueOnce(d.promise);
    await enter();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "other" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner" }));
    await act(async () => d.resolve([visit()]));
    await tick();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Ветклиника");
  });
  it("M10 no actual vet visits GET or any POST", async () => {
    await enter();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/v1/pets/pet-A"]);
    expect(fetcher.mock.calls.every(([, opts]) => opts.method === "GET")).toBe(true);
  });
});
