// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {PetProfileVisibilityConnected} from "./PetProfileVisibilityConnected";
import {PetCollection} from "./PetCollection";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {PetCard} from "./petApi";
const pet=(shown:boolean)=>({
  id:"pet_A",ownerId:"owner_A",name:"Рекс",type:"DOG",breed:"Метис",
  birthDate:"2020-01-01T00:00:00.000Z",notes:null,
  weightKg:null,heightCm:null,neckGirthCm:null,muzzleGirthCm:null,
  bellyGirthCm:null,showInProfile:shown,
});
const reply=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
let host:HTMLDivElement,root:Root,cache:QueryClient,fetcher:ReturnType<typeof vi.fn>;
let serverVisible=false,lost=false,owner=true;
const tick=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
const click=async(name:string)=>{
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent?.trim()===name||b.getAttribute("aria-label")===name);
  expect(button,name).toBeDefined();
  await act(async()=>button?.click());await tick();
};
const mount=()=>act(async()=>root.render(<QueryClientProvider client={cache}>
  <PetProfileVisibilityConnected ownerId="owner_A" petId="pet_A" petName="Рекс"
    showInProfile={false} isCurrent={()=>owner}/>
</QueryClientProvider>));
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  serverVisible=false;lost=false;owner=true;
  fetcher=vi.fn(async(url:string,req:RequestInit)=>{
    if(url==="/api/v1/pets/pet_A"&&req.method==="PUT"){
      expect(JSON.parse(String(req.body))).toEqual({showInProfile:true});
      serverVisible=true;
      if(lost)throw Error("PUT_ACK_LOST");
      return reply(pet(true));
    }
    if(url==="/api/v1/pets/pet_A"&&req.method==="GET")return reply(pet(serverVisible));
    throw Error(`UNEXPECTED:${url}:${req.method}`);
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();
  vi.unstubAllGlobals();});
describe("original Next pet profile visibility switch",()=>{
  it("saves via exact PUT then owner GET before rendering new checked state",async()=>{
    await mount();
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    await click("Показывать в профиле: Рекс");
    expect(fetcher.mock.calls.map(([,req])=>req.method)).toEqual(["PUT","GET"]);
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Настройка видимости сохранена.");
  });
  it("unknown PUT acknowledgement fences second write until GET reconciliation",async()=>{
    lost=true;await mount();
    await click("Показывать в профиле: Рекс");
    expect(host.textContent).toContain("Результат сохранения неизвестен");
    expect(host.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    await click("Перепроверить видимость");
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(fetcher.mock.calls.map(([,req])=>req.method)).toEqual(["PUT","GET"]);
  });
  it("does not flash/unmount the entire pet collection while visibility is saved",async()=>{
    let resolveRead!: (value:Response)=>void;
    const pendingRead=new Promise<Response>(resolve=>{resolveRead=resolve;});
    const listFetcher=vi.fn((url:string,req:RequestInit)=>{
      if(url==="/api/v1/pets"&&req.method==="GET")
        return Promise.resolve(reply([pet(false)]));
      if(url==="/api/v1/pets/pet_A"&&req.method==="PUT"){
        expect(JSON.parse(String(req.body))).toEqual({showInProfile:true});
        return Promise.resolve(reply(pet(true)));
      }
      if(url==="/api/v1/pets/pet_A"&&req.method==="GET")return pendingRead;
      throw Error(`UNEXPECTED:${url}:${req.method}`);
    });
    vi.stubGlobal("fetch",listFetcher);
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner_A",username:"owner",role:"USER"});
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <PetCollection userId="owner_A" />
    </QueryClientProvider>));
    await tick();
    const card=host.querySelector<HTMLElement>(".pet-collection-card");
    const avatar=card?.querySelector<HTMLImageElement>(".gafus-legacy-pet-photo");
    const control=card?.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(card).not.toBeNull();
    expect(avatar).not.toBeNull();
    expect(control?.getAttribute("aria-checked")).toBe("false");
    await act(async()=>control?.click());
    await tick();
    expect(listFetcher.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/pets","/api/v1/pets/pet_A","/api/v1/pets/pet_A",
    ]);
    expect(host.querySelector(".pet-collection-card")).toBe(card);
    expect(host.querySelector(".gafus-legacy-pet-photo")).toBe(avatar);
    expect(host.textContent).not.toContain("Перепроверяем список питомцев");
    expect(control?.getAttribute("aria-checked")).toBe("false");
    await act(async()=>resolveRead(reply(pet(true))));
    await tick();
    expect(host.querySelector(".pet-collection-card")).toBe(card);
    expect(host.querySelector(".gafus-legacy-pet-photo")).toBe(avatar);
    expect(host.querySelector('[role="switch"]')).toBe(control);
    expect(control?.getAttribute("aria-checked")).toBe("true");
    expect(cache.getQueryData<PetCard[]>(["pets","mine","owner_A"])?.[0]?.showInProfile)
      .toBe(true);
    expect(host.textContent).not.toContain("Перепроверяем список питомцев");
    expect(listFetcher.mock.calls.filter(([url])=>url==="/api/v1/pets"))
      .toHaveLength(1);
  });
  it("nonowner cannot write through the same mounted switch",async()=>{
    owner=false;await mount();
    expect(host.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    await click("Показывать в профиле: Рекс");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
