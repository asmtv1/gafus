// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {PetDetails} from "./PetDetails";
import type {PetEditWire} from "./petEditSourceMock";
import {pet} from "./petEditSourceMock.test";
const deferred=<T,>()=>{
  let resolve!:(v:T)=>void;
  const promise=new Promise<T>(res=>{resolve=res;});
  return {promise,resolve};
};
let root:Root,host:HTMLDivElement,cache:QueryClient;
let update:ReturnType<typeof vi.fn<PetEditWire["update"]>>;
let readback:ReturnType<typeof vi.fn<PetEditWire["readback"]>>;
let transport:PetEditWire;
let detailsFetch:ReturnType<typeof vi.fn>;
async function flush(){await act(async()=>{await new Promise(r=>setTimeout(r,18));});}
async function mount(enabled=true,inject=true){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <PetDetails userId="ownerA" petId="pet123"
      showEditOptIn={enabled}
      editMockTransport={inject?transport:undefined}/>
  </QueryClientProvider>));await flush();
}
async function click(label:string){
  const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent?.trim()===label);
  expect(b,"missing button "+label).toBeDefined();
  await act(async()=>b?.click());await flush();
}
async function open(){
  await mount();
  await click("Редактировать питомца (макет)");
}
async function change(field:string,value:string){
  const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(
    '[name="'+field+'"]');
  if(!el)throw Error("MISSING_FIELD_"+field);
  const proto=el instanceof HTMLTextAreaElement?
    HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(el,value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  });
}
async function save(){
  const form=host.querySelector<HTMLFormElement>("form[aria-label='Редактирование питомца']");
  expect(form).not.toBeNull();
  await act(async()=>{
    form?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  cache=new QueryClient({defaultOptions:{queries:{
    retry:false,refetchOnWindowFocus:false,
  }}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"ownerA",username:"ownerA",role:"USER",
  });
  detailsFetch=vi.fn(async(input:string,opts:RequestInit)=>{
    if(input!=="/api/v1/pets/pet123"||opts?.method!=="GET")
      throw Error("UNEXPECTED_REAL_PET_MUTATION");
    return new Response(JSON.stringify({success:true,data:{
      ...pet,ownerId:"PRIVATE_OWNER_ID",
      photoUrl:"PRIVATE_UNTRUSTED_IMAGE",
    }}),{status:200});
  });
  vi.stubGlobal("fetch",detailsFetch);
  update=vi.fn().mockImplementation(async({body})=>({
    httpStatus:200,success:true,data:{...pet,...body},
  }));
  readback=vi.fn().mockResolvedValue({...pet,name:"Жучка"});
  transport={fixtureKind:"AG2_PET_EDIT_SYNTHETIC_ONLY",update,readback};
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("AG2 pet details -> real mounted synthetic edit + readback",()=>{
  it("E01 default no transport: original read-only details remains",async()=>{
    await mount(false);
    expect(host.textContent).toContain("Барни");
    expect(host.textContent).not.toContain("Редактировать питомца (макет)");
    await mount(true,false);
    expect(host.textContent).not.toContain("Редактировать питомца (макет)");
    expect(update).not.toHaveBeenCalled();
  });
  it("E02 details -> form -> partial PUT 200 -> mock-only ACK -> readback -> return",async()=>{
    await open();
    await change("name","Жучка");
    await save();
    expect(update).toHaveBeenCalledExactlyOnceWith({
      ownerId:"ownerA",method:"PUT",path:"/api/v1/pets/pet123",
      body:{name:"Жучка"},
    });
    expect(host.textContent).toContain("только синтетического обновления");
    await click("Проверить карточку (макет)");
    expect(readback).toHaveBeenCalledExactlyOnceWith({
      ownerId:"ownerA",method:"GET",path:"/api/v1/pets/pet123",
    });
    expect(host.textContent).toContain("совпадают только в синтетическом");
    await click("К карточке питомца");
    expect(host.textContent).toContain("Барни");
    expect(host.textContent).not.toContain("Редактировать питомца (макет)");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it("E19 cancel without PUT is allowed to reopen and keep original data",async()=>{
    await open();
    await change("name","Жучка");
    await click("Отмена");
    expect(update).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Барни");
    await click("Редактировать питомца (макет)");
    expect(host.querySelector<HTMLInputElement>('[name="name"]')?.value)
      .toBe("Барни");
    expect(update).not.toHaveBeenCalled();
  });
  it("E03 empty unchanged values never submit",async()=>{
    await open();await save();
    expect(host.textContent).toContain("Изменений для сохранения нет");
    expect(update).not.toHaveBeenCalled();
  });
  it("E04 invalid name and numeric range blocks update",async()=>{
    await open();await change("name","1");await save();
    expect(host.textContent).toContain("Имя: 2–50");
    await change("name","Барни");await change("weightKg","400");
    await save();expect(host.textContent).toContain("Вес должен");
    expect(update).not.toHaveBeenCalled();
  });
  it("E05 double submit while pending sends exactly one PUT",async()=>{
    const pending=deferred<unknown>();update.mockReturnValueOnce(pending.promise);
    await open();await change("name","Жучка");
    const form=host.querySelector("form")!;
    await act(async()=>{
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async()=>pending.resolve({httpStatus:200,success:true,
      data:{...pet,name:"Жучка"}}));await flush();
    expect(host.textContent).toContain("только синтетического");
  });
  it("E06 thrown/lost ACK terminal unknown, no auto retry",async()=>{
    update.mockRejectedValueOnce(Error("LOST_ACK_MAY_HAVE_COMMITTED"));
    await open();await change("name","Жучка");await save();
    expect(host.textContent).toContain("Результат неизвестен");
    expect(host.textContent).not.toContain("LOST_ACK");
    await click("Проверить карточку (макет)");
    expect(update).toHaveBeenCalledTimes(1);
  });
  it.each([[400,"не принял"],[401,"Сессия завершена"],
    [403,"запрещено"],[404,"не найден"],[409,"конфликтуют"]])(
    "E07-11 terminal server %d and no repeat",async(status,message)=>{
      update.mockResolvedValueOnce({httpStatus:status,success:false});
      await open();await change("name","Жучка");await save();
      expect(host.textContent).toContain(message);
      expect(update).toHaveBeenCalledTimes(1);
    },
  );
  it("E12 503 result is UNKNOWN, not proof of failure",async()=>{
    update.mockResolvedValueOnce({httpStatus:503,success:false});
    await open();await change("name","Жучка");await save();
    expect(host.textContent).toContain("Результат неизвестен");
  });
  it("E13 readback mismatch is NOT_PROVEN, not a failure claim",async()=>{
    readback.mockResolvedValueOnce({...pet});
    await open();await change("name","Жучка");await save();
    await click("Проверить карточку (макет)");
    expect(host.textContent).toContain("не подтверждено");
    expect(host.textContent).toContain("не доказывает");
  });
  it("E14 owner A->B while PUT pending: old ACK not shown",async()=>{
    const pending=deferred<unknown>();update.mockReturnValueOnce(pending.promise);
    await open();await change("name","Жучка");
    await act(async()=>host.querySelector("form")?.dispatchEvent(
      new Event("submit",{bubbles:true,cancelable:true})));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"ownerB",username:"ownerB",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve({httpStatus:200,success:true,
      data:{...pet,name:"Жучка"}}));await flush();
    expect(host.textContent).not.toContain("Получен ACK");
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("E15 owner ABA cannot resurrect private draft",async()=>{
    await open();await change("name","Жучка");await save();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"ownerB",username:"ownerB",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"ownerA",username:"ownerA",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Получен ACK");
  });
  it("E16 late readback after logout does not reveal outcome",async()=>{
    const pending=deferred<unknown>();readback.mockReturnValueOnce(pending.promise);
    await open();await change("name","Жучка");await save();
    await click("Проверить карточку (макет)");
    await act(async()=>cache.clear());
    await act(async()=>pending.resolve({...pet,name:"Жучка"}));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("совпадают только");
  });
  it("E17 error/malformed ACK can never claim real saved",async()=>{
    update.mockResolvedValueOnce({httpStatus:200,success:true,
      data:{...pet,id:"other",name:"Жучка"}});
    await open();await change("name","Жучка");await save();
    expect(host.textContent).toContain("Результат неизвестен");
  });
  it("E20 owner transition removes the entire private pet card from DOM",async()=>{
    await open();
    expect(host.textContent).toContain("Барни");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"ownerB",username:"ownerB",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Барни");
    expect(host.textContent).not.toContain("Любит прогулки");
    expect(host.textContent).not.toContain("15.5");
    expect(update).not.toHaveBeenCalled();
  });
  it("E18 absence of photo/documents or destructive controls",async()=>{
    await open();
    // Editing text fields must not contain an upload control; the restored
    // independent Next-style avatar picker lives outside this edit form.
    expect(host.querySelector('.pet-editor-connected input[type="file"]')).toBeNull();
    expect([...host.querySelectorAll("button")].some(x=>
      x.textContent?.includes("Удалить питомца"))).toBe(false);
    expect(host.textContent).not.toContain("PRIVATE_UNTRUSTED_IMAGE");
  });
});
