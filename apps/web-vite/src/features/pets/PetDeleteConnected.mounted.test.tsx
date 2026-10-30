// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetDeleteConnected } from "./PetDeleteConnected";

let node: HTMLDivElement;
let root: Root;
let query: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
let owner: boolean;
let deleted: boolean;
const response = (status: number) => new Response(JSON.stringify({
  success: status >= 200 && status < 300, error: "hidden",
}), { status, headers: { "content-type": "application/json" } });
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={query}>
    <PetDeleteConnected petId="pet_01" petName="Рекс" ownerId="owner_A"
      isCurrent={() => owner} />
  </QueryClientProvider>));
}
async function click(label: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/pets/pet_01");
  owner = true; deleted = false;
  fetcher = vi.fn(async (path: string, init: RequestInit) => {
    expect(path).toBe("/api/v1/pets/pet_01");
    if (init.method === "DELETE") { deleted = true; return response(200); }
    if (init.method === "GET") return response(deleted ? 404 : 200);
    throw Error("WRONG_METHOD");
  });
  vi.stubGlobal("fetch", fetcher);
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); query.clear(); node.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("owner-only destructive pet deletion confirmation", () => {
  it("Next confirm-only dialog: no write until Да, удалить; DELETE+404 redirects", async () => {
    await mount();
    await click("Удалить питомца");
    expect(node.textContent).toContain("Это действие нельзя отменить");
    expect(node.querySelector<HTMLInputElement>("input")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    await click("Да, удалить");
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
    expect(fetcher.mock.calls.map(([_, options]) => options.method)).toEqual(["DELETE", "GET"]);
    expect(window.location.pathname).toBe("/pets");
  });
  it("no mutation when principal changed before confirm", async () => {
    await mount(); await click("Удалить питомца");
    owner = false;
    await click("Да, удалить");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uncertain DELETE result never displays success or retries", async () => {
    fetcher.mockImplementation(async () => { throw Error("LOST_ACK"); });
    await mount(); await click("Удалить питомца");
    await click("Да, удалить");
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
    expect(node.textContent).toContain("Удаление не подтверждено");
    expect(window.location.pathname).toBe("/pets/pet_01");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(node.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await click("Да, удалить");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Cancel never emits DELETE and reopening still requires explicit confirmation",async()=>{
    await mount();await click("Удалить питомца");
    await click("Отмена");
    expect(node.textContent).not.toContain("Да, удалить");
    expect(fetcher).not.toHaveBeenCalled();
    await click("Удалить питомца");
    expect(node.textContent).toContain("Да, удалить");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("double-confirm under pending DELETE dispatches at most one request",async()=>{
    let resolve!: (value: Response) => void;
    fetcher.mockImplementation(async(path:string,init:RequestInit)=>{
      expect(path).toBe("/api/v1/pets/pet_01");
      if(init.method==="DELETE"){
        deleted=true;
        return await new Promise<Response>(done=>{resolve=done;});
      }
      return response(404);
    });
    await mount();await click("Удалить питомца");
    const form=node.querySelector<HTMLFormElement>("form");
    expect(form).not.toBeNull();
    await act(async()=>{
      form?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      form?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    });
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="DELETE")).toHaveLength(1);
    await act(async()=>resolve(response(200)));
    await act(async()=>new Promise(done=>setTimeout(done,10)));
    expect(fetcher.mock.calls.map(([,req])=>req.method)).toEqual(["DELETE","GET"]);
  });
});
