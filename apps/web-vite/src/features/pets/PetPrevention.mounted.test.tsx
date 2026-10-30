// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {PetPrevention} from "./PetPrevention";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {projectPreventionList} from "./petPreventionApi";
const entry=(id="procedure_1")=>({
  id,type:"VACCINATION",performedAt:"2026-10-10T00:00:00.000Z",productName:"Препарат А",
  notes:"Ветеринар",reminderEnabled:true,reminderKind:"AFTER_DAYS",
  reminderDaysAfter:365,reminderOnDate:null,remindAt:"2027-10-10T00:00:00.000Z",
  reminderTimes:["09:00"],clientId:null,privateMedicalMarker:"NEVER_PROJECT",
});
const response=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status>=200&&status<300,data,
}),{status,headers:{"content-type":"application/json"}});
let root:Root,host:HTMLDivElement,client:QueryClient;
let fetcher:ReturnType<typeof vi.fn>,items:ReturnType<typeof entry>[];
let current:boolean,lostPost:boolean;
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
const click=async(name:string)=>{
  const b=[...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(button=>button.textContent?.trim()===name);
  expect(b,name).toBeDefined();
  await act(async()=>b?.click());await tick();
};
const mount=(inCard=false)=>act(async()=>root.render(<QueryClientProvider client={client}>
  <PetPrevention ownerId="owner_A" petId="pet_A" isCurrent={()=>current} inCard={inCard}/>
</QueryClientProvider>));
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  items=[entry()];current=true;lostPost=false;
  fetcher=vi.fn(async(url:string,request:RequestInit)=>{
    if(url==="/api/v1/pets/pet_A/prevention"){
      if(request.method==="GET")return response(items);
      if(request.method==="POST"){
        if(lostPost)throw Error("ACK_LOST");
        const draft=JSON.parse(String(request.body));
        items=[...items,{...entry("procedure_2"),...draft,
          performedAt:new Date(draft.performedAt).toISOString(),
          remindAt:"2027-10-10T00:00:00.000Z"}];
        return response(items.at(-1),201);
      }
    }
    if(/^\/api\/v1\/pets\/pet_A\/prevention\/procedure_[12]$/.test(url)){
      if(request.method==="PUT"){
        const draft=JSON.parse(String(request.body));
        items=[{...entry(),...draft,performedAt:new Date(draft.performedAt).toISOString()}];
        return response(items[0]);
      }
      if(request.method==="DELETE"){
        items=items.filter(item=>url!==`/api/v1/pets/pet_A/prevention/${item.id}`);
        return response({id:url.split("/").at(-1)});
      }
    }
    throw Error("UNEXPECTED_HTTP:"+request.method+":"+url);
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  client=new QueryClient({
    defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}},
  });
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  client.clear();host.remove();vi.unstubAllGlobals();
});
describe("owner pet prevention Next Hono CRUD and privacy",()=>{
  it("expanded card adds/edits prevention in Next modal with non-writing cancel",async()=>{
    await mount(true);await tick();
    const add=document.querySelector('section[aria-label="Записи о процедурах"] button');
    expect(add?.textContent).toContain("Добавить запись");
    await click("+ Добавить запись");
    const dialog=document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
    expect(dialog?.textContent).toContain("Добавить запись");
    expect(dialog?.querySelector("select")?.value).toBe("VACCINATION");
    // Portal is outside .gafus-app. Both native selects must inherit the
    // shared SelectChevron.svg rule instead of rendering browser arrows.
    const sharedCss=readFileSync("src/shared/ui/SelectChevron.css","utf8");
    const selector=sharedCss.match(/^(:is\([^\n]+\) select:not\([^\n]+) \{/m)?.[1];
    expect(selector).toBeDefined();
    const modalSelects=[...(dialog?.querySelectorAll<HTMLSelectElement>("select")??[])];
    expect(modalSelects).toHaveLength(2);
    expect(modalSelects.map(select=>select.closest("label")?.textContent?.trim().split("\n")[0]))
      .toEqual(expect.arrayContaining([expect.stringContaining("Тип"),
        expect.stringContaining("Когда напомнить")]));
    expect(modalSelects.every(select=>select.matches(selector!))).toBe(true);
    expect(sharedCss).toContain("background-image: url(\"./SelectChevron.svg\") !important;");
    expect(sharedCss).toContain("appearance: none !important;");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    await act(async()=>dialog?.querySelector("select")?.dispatchEvent(new KeyboardEvent(
      "keydown",{key:"Escape",bubbles:true})));
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(fetcher.mock.calls.every(([,req])=>req.method==="GET")).toBe(true);
    await click("Редактировать");
    expect(document.querySelector("[role='dialog']")?.textContent)
      .toContain("Редактировать запись");
    const cancel = dialog?.querySelector<HTMLButtonElement>(
      'button[data-gafus-shared-button="secondary"][data-gafus-variant="red"]',
    );
    expect(cancel?.textContent).toBe("Отмена");
    expect(cancel?.type).toBe("button");
    await click("Отмена");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(fetcher.mock.calls.every(([,req])=>req.method==="GET")).toBe(true);
  });
  it("groups each added time and its delete button in one row without saving",async()=>{
    await mount(true);await tick();
    await click("+ Добавить запись");
    await click("+ Ещё одно напоминание");
    let rows=document.querySelectorAll('[class*="nextTimeRow"]');
    expect(rows).toHaveLength(2);
    for(let i=0;i<rows.length;i++){
      expect(rows[i].querySelector("label")?.textContent).toContain(`Время ${i+1}`);
      expect(rows[i].querySelector('input[type="time"]')).not.toBeNull();
      const remove=rows[i].querySelector<HTMLButtonElement>(
        `button[aria-label="Убрать время ${i+1}"]`,
      );
      expect(remove?.type).toBe("button");
      expect(remove?.dataset.gafusVariant).toBe("red");
      expect(remove?.querySelector("svg")).not.toBeNull();
      expect(remove?.closest("label")).toBeNull();
    }
    await click("+ Ещё одно напоминание");
    rows=document.querySelectorAll('[class*="nextTimeRow"]');
    expect(rows).toHaveLength(3);
    const removeSecond=rows[1].querySelector<HTMLButtonElement>(
      'button[aria-label="Убрать время 2"]',
    );
    expect(removeSecond).not.toBeNull();
    await act(async()=>removeSecond?.click());
    rows=document.querySelectorAll('[class*="nextTimeRow"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector("input[type=time]")?.getAttribute("value")).toBe("09:00");
    expect(rows[1].querySelector("input[type=time]")?.getAttribute("value")).toBe("18:00");
    await click("Отмена");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetcher.mock.calls.every(([,req])=>req.method==="GET")).toBe(true);
  });
  it("only loads on expand, strips private fields and never reads foreign pet",async()=>{
    await mount();expect(fetcher).not.toHaveBeenCalled();
    await click("Записи о процедурах");
    expect(host.textContent).toContain("Прививка");
    expect(host.textContent).toContain("Напоминание:");
    expect(JSON.stringify(client.getQueryData(["pets","prevention","owner_A","pet_A"])))
      .not.toContain("NEVER_PROJECT");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/pets/pet_A/prevention");
  });
  it("real client POST 201 → owner GET and DELETE → owner GET",async()=>{
    items=[];
    client.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"owner_A",username:"owner",role:"USER"});
    client.setQueryData(["pets","mine","owner_A"],[{
      id:"pet_A",name:"Рекс",type:"DOG",breed:"Метис",showInProfile:true,
      preventionCount:0,documentCount:2,
    }]);
    await mount();await click("Записи о процедурах");
    await click("Добавить запись");await click("Сохранить процедуру");
    expect(host.textContent).toContain("Запись о процедуре сохранена.");
    expect(items).toHaveLength(1);
    expect(client.getQueryData<{preventionCount:number}[]>(
      ["pets","mine","owner_A"])?.[0]?.preventionCount).toBe(1);
    await click("Удалить");
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="DELETE")).toHaveLength(0);
    await click("Да, удалить запись");
    expect(items).toHaveLength(0);
    expect(client.getQueryData<{preventionCount:number}[]>(
      ["pets","mine","owner_A"])?.[0]?.preventionCount).toBe(0);
    expect(host.textContent).toContain("Запись удалена.");
    expect(fetcher.mock.calls.map(([,req])=>req.method)).toEqual([
      "GET","POST","GET","DELETE","GET",
    ]);
  });
  it("owner PUT → persisted GET, then refuse stale same record on logout",async()=>{
    await mount();await click("Записи о процедурах");
    await click("Редактировать");
    await click("Сохранить процедуру");
    expect(host.textContent).toContain("Запись о процедуре сохранена.");
    expect(fetcher.mock.calls.map(([,req])=>req.method)).toEqual(["GET","PUT","GET"]);
    current=false;
    await click("Удалить");
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="DELETE")).toHaveLength(0);
  });
  it("lost POST ACK blocks duplicate and only allows manual owner GET",async()=>{
    lostPost=true;items=[];await mount();await click("Записи о процедурах");
    await click("Добавить запись");await click("Сохранить процедуру");
    expect(host.textContent).toContain("Повторные изменения заблокированы");
    await click("Сохранить процедуру");
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="POST")).toHaveLength(1);
    await click("Перечитать журнал без повторной записи");
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="POST")).toHaveLength(1);
  });
  it("malformed DTO, duplicate rows and invalid IDs fail closed",()=>{
    expect(()=>projectPreventionList([entry(),entry()])).toThrow();
    expect(()=>projectPreventionList([entry(),{...entry("x"),reminderTimes:["25:00"]}]))
      .toThrow();
    expect(()=>projectPreventionList([entry(),{...entry("x"),id:"id/foreign"}]))
      .toThrow();
  });
});
