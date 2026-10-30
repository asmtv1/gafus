// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetDetails } from "./PetDetails";

const pet = {
  id: "pet_01", ownerId: "owner_A", name: "Барни", type: "DOG",
  breed: "Метис", showInProfile: true,
  birthDate: "2020-03-15T00:00:00.000Z", notes: "",
  weightKg: 15, heightCm: 50, neckGirthCm: null,
  muzzleGirthCm: null, bellyGirthCm: null,
};
const entry = (weight: number, date: string) => ({
  id: "measurement_01", petId: "pet_01", weightKg: weight,
  measuredAt: date, createdAt: date,
});
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
let currentPet: Omit<typeof pet, "weightKg"> & { weightKg: number | null };
let weights: ReturnType<typeof entry>[];
let target: number | null;
const resp = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status >= 200 && status < 300, data,
}), { status });
async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 22)); });
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <PetDetails userId="owner_A" petId="pet_01" />
  </QueryClientProvider>));
  await flush();
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
async function inputText(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector);
  expect(input, selector).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  currentPet = { ...pet };
  weights = [entry(15, "2026-10-20T12:00:00.000Z")]; target = null;
  fetcher = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/pets/pet_01" && options.method === "GET")
      return resp(currentPet);
    if (path === "/api/v1/pets/pet_02" && options.method === "GET")
      return resp({ ...pet, id: "pet_02", name: "Люси", weightKg: 7 });
    if (path === "/api/v1/pets/pet_02/weight" && options.method === "GET")
      return resp({ currentWeightKg: 7, targetWeightKg: null,
        entries: [{ ...entry(7, "2026-10-19T12:00:00.000Z"),
          id: "measurement_other", petId: "pet_02" }] });
    if (path === "/api/v1/pets/pet_01" && options.method === "PUT") {
      currentPet = { ...currentPet, ...JSON.parse(String(options.body)) };
      return resp(currentPet);
    }
    if (path === "/api/v1/pets/pet_01/weight" && options.method === "GET")
      return resp({ currentWeightKg: weights.at(-1)?.weightKg ?? null,
        targetWeightKg: target, entries: weights });
    if (path === "/api/v1/pets/pet_01/weight" && options.method === "POST") {
      const body = JSON.parse(String(options.body));
      weights.push({ ...entry(body.weightKg, body.measuredAt), id: "measurement_02" });
      currentPet.weightKg = body.weightKg;
      return resp(weights.at(-1), 201);
    }
    if (path === "/api/v1/pets/pet_01/weight/measurement_01" && options.method === "DELETE") {
      weights = weights.filter(row => row.id !== "measurement_01");
      currentPet.weightKg = weights.at(-1)?.weightKg ?? null;
      return resp(undefined);
    }
    if (path === "/api/v1/pets/pet_01/weight/target" && options.method === "PUT") {
      target = JSON.parse(String(options.body)).targetWeightKg;
      return resp(undefined);
    }
    throw Error(`UNEXPECTED_${path}_${options.method}`);
  });
  vi.stubGlobal("fetch", fetcher);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(CURRENT_USER_QUERY_KEY,
    { id: "owner_A", username: "ownerA", role: "USER" });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove();
  vi.unstubAllGlobals();vi.restoreAllMocks();
});

describe("actual pet edit and weight routes", () => {
  it("owner detail groups actions and health sections without duplicating buttons",async()=>{
    await mount();
    const card=host.querySelector("section[aria-label=\"Карточка питомца\"]");
    expect(card?.querySelector("article.pet-detail-card h2")?.textContent).toBe(pet.name);
    const panels=[...card!.querySelectorAll<HTMLElement>("h3")]
      .map(element=>element.textContent?.trim());
    expect(panels).toEqual([
      "О питомце", "Вес и динамика", "Управление питомцем",
      "Здоровье и профилактика", "Документы питомца",
    ]);
    const edit=card?.querySelector(".pet-editor-connected");
    const remove=card?.querySelector(".pet-delete-connected");
    expect(edit?.parentElement).toBe(remove?.parentElement);
    expect(card?.querySelectorAll(".pet-editor-connected")).toHaveLength(1);
    expect(card?.querySelectorAll(".pet-delete-connected")).toHaveLength(1);
    expect(fetcher.mock.calls.every(([,init])=>init.method==="GET")).toBe(true);
  });
  it("edits pet PUT then verified GET; rejects unsupported weight in PUT", async () => {
    await mount();
    await click("Редактировать питомца");
    const name = host.querySelector<HTMLInputElement>('.pet-editor-connected input[maxlength="50"]');
    expect(name).not.toBeNull();
    await inputText('.pet-editor-connected input[maxlength="50"]', "Рекс");
    await click("Сохранить изменения");
    expect(host.textContent).toContain("Изменения сохранены");
    expect(host.textContent).toContain("Рекс");
    expect(fetcher.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ["/api/v1/pets/pet_01", "GET"],
      ["/api/v1/pets/pet_01", "PUT"],
      ["/api/v1/pets/pet_01", "GET"],
      ["/api/v1/pets/pet_01", "GET"],
    ]);
    expect(String(fetcher.mock.calls[1][1].body)).not.toContain("weightKg");
  });

  it("weight measurement POST201 and target PUT have separate GET reconciliation", async () => {
    await mount();
    await click("История веса");
    expect(host.textContent).toContain("15 кг");
    await inputText('input[type="number"][required]', "14.5");
    await click("Сохранить вес");
    expect(host.textContent).toContain("Измерение сохранено.");
    expect(host.textContent).toContain("14.5 кг");
    const fields = host.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(fields.length).toBeGreaterThanOrEqual(2);
    await inputText('input[type="number"]:not([required])', "13");
    await click("Сохранить цель");
    expect(host.textContent).toContain("Цель обновлена.");
    expect(host.textContent).toContain("13 кг");
    const calls = fetcher.mock.calls.map(([path, init]) => [path, init.method]);
    expect(calls).toContainEqual(["/api/v1/pets/pet_01/weight", "POST"]);
    expect(calls).toContainEqual(["/api/v1/pets/pet_01/weight/target", "PUT"]);
  });

  it("original Next row DELETE: owner confirmation, original Hono DELETE200, fresh GET and no private fields",async()=>{
    vi.spyOn(window,"confirm").mockReturnValue(true);
    await mount();await click("История веса");
    expect(host.textContent).toContain("15 кг");
    await click("Удалить измерение");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Измерение удалено.");
    expect(host.textContent).toContain("Измерений пока нет.");
    expect(client.getQueryData<{weightKg:number|null}>(
      ["pets","detail","owner_A","pet_01"],
    )?.weightKg).toBeNull();
    const calls=fetcher.mock.calls.map(([path,opts])=>[path,opts.method]);
    expect(calls).toContainEqual(["/api/v1/pets/pet_01/weight/measurement_01","DELETE"]);
    expect(calls.filter(([,method])=>method==="DELETE")).toHaveLength(1);
    expect(calls.filter(([path,method])=>path==="/api/v1/pets/pet_01/weight"&&method==="GET"))
      .toHaveLength(3); // initial + original acknowledged readback + React Query refresh
    expect(JSON.stringify(client.getQueryData(["pets","weight-history","owner_A","pet_01"])))
      .not.toContain("ownerId");
  });
  it("canceled native confirmation does not touch DELETE and leaves weight history intact",async()=>{
    vi.spyOn(window,"confirm").mockReturnValue(false);
    await mount();await click("История веса");await click("Удалить измерение");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls.filter(([path])=>String(path).includes("/weight/measurement_01")))
      .toHaveLength(0);
    expect(host.textContent).toContain("15 кг");
  });
  it("lost destructive DELETE response locks same entry, refreshes GET only and never retries",async()=>{
    vi.spyOn(window,"confirm").mockReturnValue(true);
    const original=fetcher.getMockImplementation() as (
      path:string,options:RequestInit,
    )=>Promise<Response>;
    fetcher.mockImplementation(async(path:string,options:RequestInit)=>{
      if(options.method==="DELETE") throw new TypeError("PRIVATE_WRONG_OWNER_BACKEND_TRACE");
      return original(path,options);
    });
    await mount();await click("История веса");await click("Удалить измерение");
    expect(host.textContent).toContain("Результат удаления неизвестен");
    expect(host.textContent).toContain("15 кг");
    expect(host.textContent).not.toContain("PRIVATE_WRONG_OWNER_BACKEND_TRACE");
    await click("Удалить измерение");
    const posts=fetcher.mock.calls.filter(([,opts])=>opts.method==="DELETE");
    expect(posts).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('button[title="Удалить измерение"]')?.disabled)
      .toBe(true);
  });
  it("changing principal inside confirmation prevents old user's destructive HTTP",async()=>{
    vi.spyOn(window,"confirm").mockImplementation(()=>{
      client.setQueryData(CURRENT_USER_QUERY_KEY,
        {id:"owner_B",username:"other",role:"USER"});
      return true;
    });
    await mount();await click("История веса");await click("Удалить измерение");
    expect(fetcher.mock.calls.some(([,opts])=>opts.method==="DELETE")).toBe(false);
    await vi.waitFor(()=>expect(host.textContent).toContain("Сессия изменилась"));
    expect(host.textContent).not.toContain("15 кг");
  });
  it("X→Y pet switch while X DELETE is pending cannot refresh or overwrite Y's weight",async()=>{
    vi.spyOn(window,"confirm").mockReturnValue(true);
    let complete!:(value:Response)=>void;
    const deferred=new Promise<Response>(resolve=>{complete=resolve;});
    const original=fetcher.getMockImplementation() as (
      path:string,options:RequestInit,
    )=>Promise<Response>;
    fetcher.mockImplementation((path:string,options:RequestInit)=>
      path==="/api/v1/pets/pet_01/weight/measurement_01" && options.method==="DELETE"
        ?deferred:original(path,options));
    await mount();await click("История веса");
    const before=fetcher.mock.calls.filter(([path,opts])=>
      path==="/api/v1/pets/pet_01/weight"&&opts.method==="GET").length;
    const deleteButton=host.querySelector<HTMLButtonElement>('button[title="Удалить измерение"]')!;
    await act(async()=>deleteButton.click());
    expect(fetcher.mock.calls.filter(([,opts])=>opts.method==="DELETE")).toHaveLength(1);
    await act(async()=>root.render(<QueryClientProvider client={client}>
      <PetDetails userId="owner_A" petId="pet_02" />
    </QueryClientProvider>));
    await flush();
    expect(host.textContent).toContain("Люси");
    const beforeAck=fetcher.mock.calls.filter(([path,opts])=>
      path==="/api/v1/pets/pet_01/weight"&&opts.method==="GET").length;
    await act(async()=>complete(resp(undefined)));
    await flush();
    expect(host.textContent).toContain("Люси");
    expect(host.textContent).not.toContain("Измерение удалено.");
    expect(client.getQueryData<{name:string;weightKg:number|null}>(
      ["pets","detail","owner_A","pet_02"],
    )).toMatchObject({id:"pet_02",name:"Люси",weightKg:7});
    const after=fetcher.mock.calls.filter(([path,opts])=>
      path==="/api/v1/pets/pet_01/weight"&&opts.method==="GET").length;
    expect(beforeAck).toBeGreaterThanOrEqual(before);
    expect(after).toBe(beforeAck); // No new X GET caused by old DELETE response.
  });
  it("double confirm during a held DELETE sends one original request, never two",async()=>{
    vi.spyOn(window,"confirm").mockReturnValue(true);
    let complete!:(v:Response)=>void;
    const deferred=new Promise<Response>(r=>{complete=r;});
    const original=fetcher.getMockImplementation() as (
      path:string,options:RequestInit,
    )=>Promise<Response>;
    fetcher.mockImplementation((path:string,options:RequestInit)=>
      options.method==="DELETE"?deferred:original(path,options));
    await mount();await click("История веса");
    const action=host.querySelector<HTMLButtonElement>('button[title="Удалить измерение"]')!;
    await act(async()=>{action.click();action.click();});
    expect(fetcher.mock.calls.filter(([,opts])=>opts.method==="DELETE")).toHaveLength(1);
    await act(async()=>complete(resp(undefined)));
    expect(fetcher.mock.calls.filter(([,opts])=>opts.method==="DELETE")).toHaveLength(1);
    expect(host.textContent).toContain("Результат удаления не подтверждён");
  });

});
