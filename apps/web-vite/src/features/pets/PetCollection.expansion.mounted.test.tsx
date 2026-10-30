// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {PetCollection} from "./PetCollection";
const response=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const dogs=[
  {id:"pet_A",name:"Рекс",breed:"Метис",type:"DOG",showInProfile:true,
    birthDate:"2020-06-15T00:00:00.000Z",weightKg:17.3,heightCm:54},
  {id:"pet_B",name:"Мурка",breed:"Дворовая",type:"CAT",showInProfile:false},
];
const entry={id:"procedure_A",type:"VACCINATION",performedAt:"2026-10-10T00:00:00.000Z",
  productName:"Препарат",notes:"Заметка владельца",reminderEnabled:false,
  reminderKind:"AFTER_DAYS",reminderDaysAfter:null,reminderOnDate:null,
  remindAt:null,reminderTimes:["09:00"]};
let root:Root,host:HTMLDivElement,client:QueryClient,fetcher:ReturnType<typeof vi.fn>;
let own:boolean;
const flush=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")]
  .find(node=>node.textContent?.trim()===label||node.getAttribute("aria-label")===label);
async function click(label:string){expect(button(label),label).toBeDefined();
  await act(async()=>button(label)?.click());await flush();}
async function mount(){await act(async()=>root.render(<QueryClientProvider client={client}>
  <PetCollection userId="owner_A" addPetOptIn/>
</QueryClientProvider>));await flush();}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  own=true;
  fetcher=vi.fn(async(path:string,options?:RequestInit)=>{
    if(path==="/api/v1/pets"&&options?.method==="GET")return response(dogs);
    if(path==="/api/v1/pets/pet_A"&&options?.method==="GET")
      return response({...dogs[0],notes:"PRIVATE_MEDICAL_A",neckGirthCm:37,
        muzzleGirthCm:22,bellyGirthCm:46});
    if(path==="/api/v1/pets/pet_B"&&options?.method==="GET")
      return response({...dogs[1],birthDate:null,weightKg:null,heightCm:null,
        notes:"PRIVATE_MEDICAL_B",neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null});
    if(path==="/api/v1/pets/pet_A/prevention"&&options?.method==="GET")
      return response([entry]);
    if(/^\/api\/v1\/pets\/pet_[AB]\/prevention$/.test(path)&&options?.method==="GET")
      return response([]);
    if(/^\/api\/v1\/pets\/pet_[AB]\/documents$/.test(path)&&options?.method==="GET")
      return response([]);
    if(/^\/api\/v1\/pets\/pet_[AB]\/weight$/.test(path)&&options?.method==="GET")
      return response({currentWeightKg:null,targetWeightKg:null,entries:[]});
    throw Error("UNEXPECTED_OWNER_HTTP:"+path);
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  if(own)client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner_A",username:"owner",role:"USER"});
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();
  vi.unstubAllGlobals();});
describe("original Next expanded pet card is owner-scoped and lazy",()=>{
  it("each original Next card expands independently; extras are owner-GET only",async()=>{
    await mount();
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual(["/api/v1/pets"]);
    expect(host.textContent).not.toContain("Заметка владельца");
    expect(host.textContent).toContain("17.3 кг");
    expect(host.textContent).toContain("54 см");
    expect(host.textContent).toMatch(/\d+ лет/);
    await click("Развернуть карточку питомца Рекс");
    expect(host.textContent).toContain("Записи о процедурах");
    expect(host.textContent).toContain("Посещения врача");
    const actions = host.querySelector("#pet-card-details-pet_A [data-next-pet-actions]");
    expect(actions?.querySelectorAll("section")).toHaveLength(2);
    expect(actions?.textContent).toContain("Удалить питомца");
    expect(host.querySelector("#pet-card-details-pet_A")?.textContent?.indexOf("Удалить питомца"))
      .toBeLessThan(host.querySelector("#pet-card-details-pet_A")?.textContent?.indexOf("Записи о процедурах") ?? 0);
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual(expect.arrayContaining([
      "/api/v1/pets", "/api/v1/pets/pet_A",
      "/api/v1/pets/pet_A/prevention", "/api/v1/pets/pet_A/documents",
      "/api/v1/pets/pet_A/weight",
    ]));
    expect(host.textContent).toContain("Обхват шеи: 37 см");
    expect(host.textContent).toContain("Обхват морды: 22 см");
    expect(host.textContent).toContain("Обхват живота: 46 см");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_A");
    const editAction = button("Изменить данные");
    expect(editAction?.getAttribute("data-gafus-shared-button")).toBe("primary");
    expect(editAction?.getAttribute("data-gafus-size")).toBe("regular");
    await click("Изменить данные");
    expect(document.querySelector('[role="dialog"][aria-modal="true"] form'))
      .not.toBeNull();
    expect(fetcher.mock.calls.every(([,options])=>options?.method==="GET")).toBe(true);
    await click("Закрыть редактирование");
    expect(document.querySelector('[role="dialog"][aria-modal="true"] form'))
      .toBeNull();
    expect(JSON.stringify(client.getQueryData(["pets","mine","owner_A"])))
      .not.toContain("PRIVATE_MEDICAL_A");
    // Next's procedures, documents and weight are visible as soon as the card opens.
    expect(host.textContent).toContain("Заметка владельца");
    expect(host.textContent).toContain("Документов пока нет");
    expect(host.textContent).toContain("+ Добавить документ");
    expect(host.textContent).not.toContain("Загрузить документ");
    expect(host.querySelector("#pet-card-details-pet_A")?.textContent).toContain("Вес");
    expect(host.textContent).toContain("За этот период измерений нет");
    // Next weight-card actions are opt-in forms, never permanently expanded.
    expect(button("Записать вес")).toBeDefined();
    expect(button("Цель")).toBeDefined();
    expect(button("Сохранить")).toBeUndefined();
    expect(host.textContent).not.toContain("Сохранить цель");
    await click("Записать вес");
    expect(button("Сохранить")).toBeDefined();
    await click("Записать вес");
    expect(button("Сохранить")).toBeUndefined();
    await click("Цель");
    expect(host.textContent).toContain("Сохранить цель");
    await click("Цель");
    expect(host.textContent).not.toContain("Сохранить цель");
    await click("Развернуть карточку питомца Мурка");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_B");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_A");
    expect(host.querySelector<HTMLDivElement>("#pet-card-details-pet_A")?.hidden).toBe(false);
    expect(host.querySelector<HTMLDivElement>("#pet-card-details-pet_B")?.hidden).toBe(false);
    await click("Свернуть карточку питомца Рекс");
    expect(host.querySelector<HTMLDivElement>("#pet-card-details-pet_A")?.hidden).toBe(true);
    expect(host.querySelector<HTMLDivElement>("#pet-card-details-pet_B")?.hidden).toBe(false);
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_A");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_B");
    expect(client.getQueryData(["pets","detail","owner_A","pet_A"])).toBeUndefined();
  });
  it("Next edit modal has focus, Escape cancel and does not write",async()=>{
    await mount();
    await click("Развернуть карточку питомца Рекс");
    await flush();
    await click("Изменить данные");
    const dialog=document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog?.textContent).toContain("Редактировать питомца");
    expect(dialog?.className).toContain("editDialog");
    expect(dialog?.querySelector('img[src="/images/gafus-logo-mascot.webp"]'))
      .not.toBeNull();
    expect(dialog?.textContent).toContain("Имя питомца *");
    expect(dialog?.textContent).toContain("Тип питомца *");
    expect(dialog?.textContent).toContain("Дата рождения *");
    expect(dialog?.querySelectorAll("input[required], select[required]")).toHaveLength(3);
    expect(dialog?.querySelectorAll('button[type="submit"][data-gafus-shared-button="primary"]'))
      .toHaveLength(1);
    expect(dialog?.querySelectorAll('button[type="button"][data-gafus-variant="red"]'))
      .toHaveLength(1);
    expect(dialog?.querySelector<HTMLInputElement>('input[autocomplete="bday"]')?.value)
      .toBe("15.06.2020");
    expect(dialog?.textContent).toContain("ДД.ММ.ГГГГ");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    await act(async()=>dialog?.querySelector("input")?.dispatchEvent(
      new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetcher.mock.calls.every(([,opts])=>opts?.method==="GET")).toBe(true);
  });
  it("cancel discards pending edit draft; reopening reads fresh owner snapshot",async()=>{
    await mount();await click("Развернуть карточку питомца Рекс");await flush();
    await click("Изменить данные");
    const name=document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[maxlength="50"]');
    expect(name?.value).toBe("Рекс");
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
      setter?.call(name,"Майк");
      name?.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await click("Отмена");
    await click("Изменить данные");
    expect(document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[maxlength="50"]')?.value).toBe("Рекс");
    expect(fetcher.mock.calls.every(([,opts])=>opts?.method==="GET")).toBe(true);
  });
  it("Next delete modal offers Да, удалить / Отмена; cancel is read-only",async()=>{
    await mount();
    await click("Развернуть карточку питомца Рекс");
    await flush();
    await click("Удалить питомца");
    const dialog=document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog?.textContent).toContain("Удалить питомца");
    expect(dialog?.querySelector<HTMLInputElement>("input")).toBeNull();
    expect(dialog?.textContent).toContain("Да, удалить");
    // The original Next SweetAlert focuses its confirm button by default.
    expect(document.activeElement?.textContent?.trim()).toBe("Да, удалить");
    expect(dialog?.querySelector<HTMLButtonElement>('button[type="button"]')?.textContent)
      .toBe("Отмена");
    expect(dialog?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    await click("Отмена");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetcher.mock.calls.every(([,opts])=>opts?.method==="GET")).toBe(true);
  });
  it("a late exact owner GET after collapse does not display or persist private notes",async()=>{
    let complete!:(value:Response)=>void;
    const held=new Promise<Response>(resolve=>{complete=resolve;});
    fetcher.mockImplementation(async(path:string,options?:RequestInit)=>{
      if(path==="/api/v1/pets"&&options?.method==="GET")return response(dogs);
      if(path==="/api/v1/pets/pet_A"&&options?.method==="GET")return held;
      if(/^\/api\/v1\/pets\/pet_A\/prevention$/.test(path)&&options?.method==="GET")return response([]);
      if(/^\/api\/v1\/pets\/pet_A\/documents$/.test(path)&&options?.method==="GET")return response([]);
      if(/^\/api\/v1\/pets\/pet_A\/weight$/.test(path)&&options?.method==="GET")
        return response({currentWeightKg:null,targetWeightKg:null,entries:[]});
      throw Error("UNEXPECTED_LATE_OWNER_HTTP:"+path);
    });
    await mount();
    await click("Развернуть карточку питомца Рекс");
    expect(host.textContent).toContain("Загружаем данные питомца");
    await click("Свернуть карточку питомца Рекс");
    await act(async()=>complete(response({...dogs[0],notes:"PRIVATE_LATE_VET_DATA",
      neckGirthCm:31,muzzleGirthCm:20,bellyGirthCm:45})));
    await flush();
    expect(host.textContent).not.toContain("PRIVATE_LATE_VET_DATA");
    expect(client.getQueryData(["pets","detail","owner_A","pet_A"]))
      .toBeUndefined();
    expect(JSON.stringify(client.getQueryData(["pets","mine","owner_A"])))
      .not.toContain("PRIVATE_LATE_VET_DATA");
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual(expect.arrayContaining([
      "/api/v1/pets","/api/v1/pets/pet_A",
      "/api/v1/pets/pet_A/prevention", "/api/v1/pets/pet_A/documents",
      "/api/v1/pets/pet_A/weight",
    ]));
  });
  it("principal rotation closes private card controls and notes",async()=>{
    await mount();
    await click("Развернуть карточку питомца Рекс");
    expect(host.textContent).toContain("PRIVATE_MEDICAL_A");
    expect(host.textContent).toContain("Заметка владельца");
    await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"owner_B",username:"other",role:"USER",
    }));
    await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Заметка владельца");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_A");
    expect(client.getQueryData(["pets","detail","owner_A","pet_A"]))
      .toBeUndefined();
    expect(client.getQueryData(["pets","prevention","owner_A","pet_A"]))
      .toBeUndefined();
  });
});
