// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll,  afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { VetHonoSourceReadWire } from "./vetVisitsHonoReadConsumer";
import { ApiError } from "../../shared/api/client";
const pet = {
  id: "pet-A",
  name: "Барни",
  type: "DOG",
  breed: "Метис",
  showInProfile: true,
  birthDate: null,
  notes: "SECRET_PET_MEDICAL",
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
  doctorName: "Врач",
  clinic: "Ветклиника",
  diagnosis: "PRIVATE_DIAGNOSIS",
  conclusion: "PRIVATE_CONCLUSION",
  notes: "PRIVATE_MEDICAL_NOTES",
  attachments: [
    {
      id: "a1",
      name: "medical.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1500,
      hasPreview: false,
      previewProcessing: false,
      originalKey: "SECRET_S3_ORIGINAL",
      previewKey: "SECRET_S3_PREVIEW",
      signedUrl: "SECRET_SIGNED",
      ownerId: "SECRET_OWNER",
    },
  ],
});
const deferred = <T,>() => {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
// Route chunks and owner-scoped GET results settle on successive React commits.
beforeAll(async () => { await import("./PetVetVisits"); });
const tick = async () => {
  for (let i=0; i<5; i++) {
    await act(async () => { await new Promise(done=>setTimeout(done,100)); });
  }
};
let root: Root, host: HTMLDivElement, cache: QueryClient;
let list: ReturnType<typeof vi.fn<VetHonoSourceReadWire["list"]>>;
let detail: ReturnType<typeof vi.fn<VetHonoSourceReadWire["detail"]>>;
let fetcher: ReturnType<typeof vi.fn>;
let transport: VetHonoSourceReadWire;
async function mount(
  url = "/pets/pet-A/vet-visits",
  optin = true,
  fixture = true,
  actor = "owner",
) {
  window.history.replaceState(null, "", url);
  cache.setQueryData(
    CURRENT_USER_QUERY_KEY,
    actor ? { id: actor, username: actor, role: "USER" } : null,
  );
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <App showVetHonoOptIn={optin} vetHonoReadTransport={fixture ? transport : undefined} />
      </QueryClientProvider>,
    ),
  );
  await tick();
}
async function navigateUrl(url: string) {
  await act(async () => {
    history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
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
async function open() {
  await mount();
  await click("История приёмов (Hono макет)");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  list = vi.fn(async () => [visit()]);
  detail = vi.fn(async () => visit());
  transport = { fixtureKind: "AG2_VET_HONO_LIST_DETAIL_SYNTHETIC_ONLY", list, detail };
  fetcher = vi.fn(async (url: string, opts: RequestInit) => {
    if (url === "/api/v1/pets/pet-A" && opts.method === "GET")
      return new Response(JSON.stringify({ success: true, data: pet }), { status: 200 });
    if (url === "/api/v1/auth/me" && opts.method === "GET")
      return new Response(
        JSON.stringify({ success: true, data: { id: "owner", username: "owner", role: "USER" } }),
        { status: 200 },
      );
    if (url === "/api/v1/pets/pet-A/vet-visits" && opts.method === "GET")
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    throw Error("UNAUTHORIZED_EXTERNAL_VET_NETWORK");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});
describe("WEB-URL-029 current AG1 typed list/detail connected existing App (synthetic)", () => {
  it("H01 default Web reads original Hono, never opens synthetic fixture", async () => {
    await mount("/pets/pet-A/vet-visits", false);
    // The real retained Next route uses its source empty card, unlike
    // the separate synthetic Hono opt-in which preserves its own copy.
    expect(host.textContent).toContain("Здесь будет история посещений");
    expect(host.textContent).not.toContain("История приёмов (Hono макет)");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/v1/pets/pet-A/vet-visits");
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });
  it("H02 fixture required, never auto-connect sourceOnly GET", async () => {
    await mount("/pets/pet-A/vet-visits", true, false);
    expect(host.textContent).not.toContain("История приёмов (Hono макет)");
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });
  it("H03 owned list -> visit deep link -> exact detail -> back list", async () => {
    await open();
    expect(list).toHaveBeenCalledExactlyOnceWith("pet-A");
    expect(host.textContent).toContain("Ветклиника");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    await click("Открыть посещение");
    expect(location.search).toBe("?visitId=v1");
    expect(detail).toHaveBeenCalledExactlyOnceWith("pet-A", "v1");
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_NOTES");
    expect(host.textContent).toContain("medical.pdf");
    expect(host.innerHTML).not.toMatch(/SECRET_S3_|SECRET_SIGNED|SECRET_OWNER/);
    await click("К истории посещений");
    expect(location.search).toBe("");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(fetcher.mock.calls.every(([, opts]) => opts.method === "GET")).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("vet-visits"))).toBe(false);
  });
  it("H04 direct visit?visitId opens validated detail after list", async () => {
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(list).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
  });
  it("H05 list owned-empty200 is not 404 and no detail", async () => {
    list.mockResolvedValueOnce([]);
    await open();
    expect(host.textContent).toContain("Записей о посещениях пока нет");
    expect(detail).not.toHaveBeenCalled();
  });
  it("H06 unknown requested visit shows not-found, never empty", async () => {
    await mount("/pets/pet-A/vet-visits?visitId=missing");
    expect(host.textContent).toContain("Посещение не найдено");
    expect(host.textContent).not.toContain("Записей о посещениях пока нет");
    expect(detail).not.toHaveBeenCalled();
  });
  it("H07 single detail 404 not-found after previously listed visit", async () => {
    detail.mockRejectedValueOnce(new ApiError(404, "SECRET_DB", "VET_VISIT_NOT_FOUND"));
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(host.textContent).toContain("Посещение не найдено");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(host.innerHTML).not.toContain("SECRET_DB");
    expect(detail).toHaveBeenCalledTimes(1);
  });
  it("H08 403 owner denial is not empty and does not start detail", async () => {
    list.mockRejectedValueOnce(new ApiError(403, "SECRET_HOSPITAL"));
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(host.textContent).toContain("Нет доступа к истории питомца");
    expect(host.textContent).not.toContain("Записей о посещениях пока нет");
    expect(host.innerHTML).not.toContain("SECRET_HOSPITAL");
    expect(detail).not.toHaveBeenCalled();
  });
  it("H09 invalid or duplicate URL selector never loads list/detail", async () => {
    await mount("/pets/pet-A/vet-visits?visitId=v1&visitId=v2");
    expect(host.textContent).toContain("Некорректная ссылка");
    expect(list).not.toHaveBeenCalled();
    await navigateUrl("/pets/pet-A/vet-visits?visitId=%2Fsecret");
    expect(host.textContent).toContain("Некорректная ссылка");
    expect(detail).not.toHaveBeenCalled();
  });
  it("H10 forged owner query ignored: actual principal still owns list", async () => {
    await mount("/pets/pet-A/vet-visits?ownerId=other");
    await click("История приёмов (Hono макет)");
    expect(list).toHaveBeenCalledExactlyOnceWith("pet-A");
    expect(detail).not.toHaveBeenCalled();
  });
  it("H11 owner pet GET 404 precludes list and details", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: "SECRET_BACKEND",
        }),
        { status: 404 },
      ),
    );
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(host.textContent).toContain("Не удалось подтвердить доступ");
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    expect(host.innerHTML).not.toContain("SECRET_BACKEND");
  });
  it("H15 owner pet GET 200 with valid foreign id blocks ALL medical reads", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { ...pet, id: "pet-B", name: "SECRET_OTHER_PET" },
        }),
        { status: 200 },
      ),
    );
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(host.textContent).toContain("Не удалось подтвердить доступ");
    expect(host.innerHTML).not.toContain("SECRET_OTHER_PET");
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });
  it("H12 forged petId in DTO rejected, no detail", async () => {
    list.mockResolvedValueOnce([visit("v1", "foreign")]);
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    expect(host.textContent).toContain("Не удалось получить посещения врача");
    expect(detail).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_NOTES");
  });
  it("H13 A->B->A while detail pending denies late medical payload", async () => {
    const d = deferred<unknown>();
    detail.mockReturnValueOnce(d.promise);
    await mount("/pets/pet-A/vet-visits?visitId=v1");
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "ownerB", role: "USER" }),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner", username: "owner", role: "USER" }),
    );
    await act(async () => d.resolve(visit()));
    await tick();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.innerHTML).not.toContain("PRIVATE_DIAGNOSIS");
  });
  it("H14 browser back/forward reselects detail, no new Hono HTTP", async () => {
    await open();
    await click("Открыть посещение");
    await act(async () => {
      history.back();
      await new Promise((ok) => setTimeout(ok, 35));
    });
    await tick();
    expect(location.search).toBe("");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    await act(async () => {
      history.forward();
      await new Promise((ok) => setTimeout(ok, 35));
    });
    await tick();
    expect(location.search).toBe("?visitId=v1");
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
  });
});
