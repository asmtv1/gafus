// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {PetAvatarConnected} from "./PetAvatarConnected";
import {preparedPetAvatar} from "./petAvatarApi";
const url="https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/photo.jpg";
const pet=(id="pet_A",photoUrl=url)=>({
  id,name:"Рекс",type:"DOG",breed:"Метис",showInProfile:true,
  birthDate:null,notes:null,weightKg:null,heightCm:null,
  neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,photoUrl,
});
const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status>=200&&status<300,data,
}),{status,headers:{"content-type":"application/json"}});
const jpeg=(valid=true)=>{
  const file=new File([new Uint8Array(valid?[255,216,255,0]:[5,8,4,2])],
    "Рекс.jpg",{type:"image/jpeg"});
  Object.defineProperty(file,"slice",{value:()=>({arrayBuffer:async()=>
    new Uint8Array(valid?[255,216,255,0]:[5,8,4,2]).buffer})});
  return file;
};
let host:HTMLDivElement,root:Root,cache:QueryClient;
let fetcher:ReturnType<typeof vi.fn>,current:boolean,lost:boolean,foreign:boolean;
const mount=(initial:string|null=null)=>act(async()=>root.render(
  <QueryClientProvider client={cache}>
  <PetAvatarConnected petId="pet_A" ownerId="owner_A" petName="Рекс" petType="DOG"
    photoUrl={initial} isCurrent={()=>current}/>
</QueryClientProvider>));
const attach=async(file:File)=>{
  const field=host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(field,"files",{configurable:true,value:{item:()=>file}});
  await act(async()=>field.dispatchEvent(new Event("change",{bubbles:true})));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
};
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  current=true;lost=false;foreign=false;
  fetcher=vi.fn(async(path:string,options:RequestInit)=>{
    if(path==="/api/v1/pets/pet_A/photo"&&options.method==="POST"){
      if(lost)throw Error("ACK_LOST");
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.headers).toEqual(expect.objectContaining({
        "X-Gafus-Auth-Transport":"cookie",
      }));
      return envelope({photoUrl:url});
    }
    if(path==="/api/v1/pets/pet_A"&&options.method==="GET")
      return envelope(pet(foreign?"foreign_pet":"pet_A"));
    throw Error(`UNEXPECTED:${options.method}:${path}`);
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("real pet owner photo multipart consumer",()=>{
  it("shows a centered vector edit icon and still opens the file chooser",async()=>{
    await mount();
    const button=host.querySelector<HTMLButtonElement>(
      'button[title="Изменить фотографию питомца"]');
    const icon=button?.querySelector('svg[aria-hidden="true"]');
    expect(button?.getAttribute("aria-label")).toBe("Изменить фотографию Рекс");
    expect(icon?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(icon?.getAttribute("stroke")).toBe("currentColor");
    expect(icon?.getAttribute("width")).toBe("20");
    expect(button?.textContent).not.toContain("✎");
    const file=host.querySelector<HTMLInputElement>('input[type="file"]');
    const openPicker=vi.spyOn(file!,"click").mockImplementation(()=>undefined);
    await act(async()=>button?.click());
    expect(openPicker).toHaveBeenCalledTimes(1);
  });
  it("POST signed owner photo → GET persists → shows photo",async()=>{
    await mount();await attach(jpeg());
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/pets/pet_A/photo","/api/v1/pets/pet_A",
    ]);
    expect(host.textContent).toContain("Фотография питомца обновлена.");
    expect(host.querySelector<HTMLImageElement>("img")?.src).toBe(url);
  });
  it("lost multipart ACK blocks any second POST on this owner screen",async()=>{
    lost=true;await mount();await attach(jpeg());
    expect(host.textContent).toContain("Повтор заблокирован");
    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    await attach(jpeg());
    expect(fetcher.mock.calls.filter(([path])=>path.endsWith("/photo"))).toHaveLength(1);
  });
  it("lost multipart ACK can be confirmed by owner GET without a second POST",async()=>{
    lost=true;await mount();await attach(jpeg());
    expect(host.textContent).toContain("Повтор заблокирован");
    const check=[...host.querySelectorAll("button")].find(b=>
      b.textContent?.trim()==="Проверить фотографию");
    expect(check).toBeDefined();
    await act(async()=>check?.click());
    await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(host.textContent).toContain("Фотография подтверждена сервером");
    expect(host.querySelector<HTMLImageElement>("img")?.src).toBe(url);
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/pets/pet_A/photo","/api/v1/pets/pet_A",
    ]);
  });
  it("unchanged owner photo cannot falsely resolve a lost upload acknowledgement",async()=>{
    lost=true;await mount(url);await attach(jpeg());
    const check=[...host.querySelectorAll("button")].find(b=>
      b.textContent?.trim()==="Проверить фотографию");
    await act(async()=>check?.click());
    await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(host.textContent).toContain("Повтор остаётся заблокирован");
    expect(host.querySelector<HTMLButtonElement>('button[title="Изменить фотографию питомца"]')?.disabled)
      .toBe(true);
    expect(fetcher.mock.calls.filter(([path])=>path.endsWith("/photo"))).toHaveLength(1);
  });
  it("invalid JPEG, size and no session never request Hono/S3",async()=>{
    await mount();await attach(jpeg(false));
    expect(fetcher).not.toHaveBeenCalled();
    await expect(preparedPetAvatar(new File([],"empty.jpg",{type:"image/jpeg"})))
      .rejects.toThrow("2 МБ");
    current=false;await attach(jpeg());expect(fetcher).not.toHaveBeenCalled();
  });
  it("foreign pet GET cannot confirm an otherwise successful server ACK",async()=>{
    foreign=true;await mount();await attach(jpeg());
    expect(host.textContent).toContain("Повтор заблокирован");
    expect(host.querySelector<HTMLImageElement>("img")?.src).not.toBe(url);
  });
});
