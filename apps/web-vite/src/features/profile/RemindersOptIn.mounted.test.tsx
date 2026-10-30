// @vitest-environment jsdom
import {act,type ReactNode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "./ProfileOverview";
import {RemindersOptIn} from "./RemindersOptIn";
import type {SyntheticReminderTransport} from "./remindersSourceMock";
import {reminder} from "./remindersSourceMock.test";
import type {PetEditWire} from "../pets/petEditSourceMock";
const later=<T,>()=>{
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(good=>{resolve=good;});
  return {promise,resolve};
};
let root:Root,host:HTMLDivElement,cache:QueryClient;
let list:ReturnType<typeof vi.fn<SyntheticReminderTransport["list"]>>;
let update:ReturnType<typeof vi.fn<SyntheticReminderTransport["update"]>>;
let remove:ReturnType<typeof vi.fn<NonNullable<SyntheticReminderTransport["delete"]>>>;
let transport:SyntheticReminderTransport;
let fetchMock:ReturnType<typeof vi.fn>;
let serverRows:unknown[];
async function flush(){await act(async()=>{await new Promise(ok=>setTimeout(ok,18));});}
async function render(node:ReactNode){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {node}
  </QueryClientProvider>));await flush();
}
async function mountProfile(hasReminder=true,hasPet=false){
  await render(<ProfileOverview userId="A"
    showRemindersOptIn={hasReminder} remindersSyntheticTransport={transport}
    showPetEditOptIn={hasPet} petEditSyntheticTransport={petWire}/>);
}
async function mountReminders(){
  await render(<RemindersOptIn enabled userId="A" transport={transport}/>);
}
async function click(label:string){
  const el=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent?.trim()===label);
  expect(el,"button "+label).toBeDefined();
  await act(async()=>el?.click());await flush();
}
const typeText=async(selector:string,value:string)=>{
  const el=host.querySelector<HTMLInputElement>(selector);
  expect(el,"input "+selector).not.toBeNull();
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(el,value);
    el?.dispatchEvent(new Event("input",{bubbles:true}));
  });
};
async function opened(){
  await mountReminders();
  await click("Напоминания о тренировках (макет)");
}
async function editing(){
  await opened();await click("Настроить");
}
async function save(){
  const form=host.querySelector<HTMLFormElement>(
    'form[aria-label="Изменить напоминание"]');
  expect(form).not.toBeNull();
  await act(async()=>form?.dispatchEvent(new Event("submit",{
    bubbles:true,cancelable:true,
  })));await flush();
}
let petWire:PetEditWire;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  cache=new QueryClient({defaultOptions:{queries:{
    retry:false,refetchOnWindowFocus:false,
  }}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"A",username:"ownerA",role:"USER",
  });
  serverRows=[reminder];
  list=vi.fn().mockImplementation(async()=>serverRows);
  update=vi.fn().mockImplementation(async({changes})=>({
    httpStatus:200,success:true,data:{...reminder,...changes},
  }));
  transport={fixtureKind:"AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY",list,update};
  remove=vi.fn(async()=>{
    serverRows=[];
    return {httpStatus:200,success:true};
  });
  petWire={fixtureKind:"AG2_PET_EDIT_SYNTHETIC_ONLY",
    update:vi.fn().mockResolvedValue({httpStatus:200,success:true}),
    readback:vi.fn().mockResolvedValue({})};
  fetchMock=vi.fn(async(path:string,options:RequestInit)=>{
    const data=path==="/api/v1/user/profile"?
      {id:"A",username:"ownerA",email:"SECRET_EMAIL",
        phone:"SECRET_PHONE",session:"SECRET_SESSION",
        profile:{fullName:"Владелец",city:"Самара",about:"Собаки"}}:
      path==="/api/v1/pets"?
        [{id:"pet123",name:"Барни",type:"DOG",breed:"Метис",
          showInProfile:true,ownerId:"SECRET_OWNER"}]:
        path==="/api/v1/pets/pet123"?
          {id:"pet123",name:"Барни",type:"DOG",breed:"Метис",showInProfile:true,
            birthDate:"2020-10-16T00:00:00Z",weightKg:15.5,heightCm:52,
            neckGirthCm:35,muzzleGirthCm:23,bellyGirthCm:54,notes:"Любит прогулки",
            ownerId:"SECRET_OWNER",photoUrl:"SECRET_PHOTO"}:null;
    if(options?.method!=="GET"||data===null)
      throw Error("UNAPPROVED_REAL_NETWORK_"+path);
    return new Response(JSON.stringify({success:true,data}),{status:200});
  });
  vi.stubGlobal("fetch",fetchMock);
  host=document.createElement("div");document.body.appendChild(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();
  vi.unstubAllGlobals();
});
describe("AG2 mounted Profile reminder prefs and pet edit opt-ins",()=>{
  it("M01 no opt-in means no reminders/profile pet transport",async()=>{
    await mountProfile(false,false);
    expect(host.textContent).not.toContain("Напоминания о тренировках (макет)");
    expect(host.textContent).not.toContain("Питомцы: посмотреть");
    expect(list).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("M02 actual Profile→reminder entry→list→form→partial PUT→readback→back",async()=>{
    await mountProfile(true,false);
    await click("Напоминания о тренировках (макет)");
    expect(list).toHaveBeenCalledExactlyOnceWith({ownerId:"A",
      method:"GET",path:"/api/v1/reminders"});
    expect(host.textContent).toContain("Утренняя тренировка");
    await click("Настроить");
    const enabled=host.querySelector<HTMLInputElement>('[name="enabled"]')!;
    await act(async()=>enabled.click());
    await save();
    expect(update).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"PUT",path:"/api/v1/reminders/rem1",
      changes:{enabled:false},
    });
    expect(host.textContent).toContain("Только синтетический ACK");
    serverRows=[{...reminder,enabled:false}];
    await click("Проверить настройку (макет)");
    expect(host.textContent).toContain("Данные совпали только");
    await click("К списку напоминаний");
    expect(host.textContent).toContain("Выключено");
    await click("Мой профиль");
    expect(host.textContent).toContain("Напоминания о тренировках (макет)");
    const unrelatedGets=fetchMock.mock.calls.map(([url])=>url);
    expect(unrelatedGets).toContain("/api/v1/user/profile");
    // Notes and Moments status run as independent optional widgets, not as
    // a network-order or GET-count contract of the reminder action.
    for(const endpoint of ["/api/v1/user/profile","/api/v1/feed/status","/api/v1/notes/student"])
      expect(unrelatedGets.filter(url=>url===endpoint).length).toBeLessThanOrEqual(1);
    expect(unrelatedGets.every(url=>[
      "/api/v1/user/profile","/api/v1/feed/status","/api/v1/notes/student",
    ].includes(url))).toBe(true);
    expect(fetchMock.mock.calls.every(([,opts])=>!opts||opts.method==="GET")).toBe(true);
  });
  it("M03 loading with delayed GET and empty",async()=>{
    const p=later<unknown>();list.mockReturnValueOnce(p.promise);
    await mountReminders();await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Загружаем напоминания");
    await act(async()=>p.resolve([]));await flush();
    expect(host.textContent).toContain("Напоминаний пока нет");
    expect(update).not.toHaveBeenCalled();
  });
  it("M04 401/403 list bounded and manual retry",async()=>{
    list.mockRejectedValueOnce({status:403});
    await opened();
    expect(host.textContent).toContain("Нет доступа");
    expect(list).toHaveBeenCalledTimes(1);
    await click("Повторить загрузку");
    expect(list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Утренняя тренировка");
  });
  it("M05 invalid values don't call synthetic PUT",async()=>{
    await editing();
    await typeText("#reminder-timezone","Bad/SecretZone");
    await save();expect(host.textContent).toContain("часовой пояс");
    expect(update).not.toHaveBeenCalled();
  });
  it("M06 identical draft doesn't send PUT",async()=>{
    await editing();await save();
    expect(host.textContent).toContain("Нет изменений");
    expect(update).not.toHaveBeenCalled();
  });
  it("M07 one-shot double submit single PUT while pending",async()=>{
    const p=later<unknown>();update.mockReturnValueOnce(p.promise);
    await editing();
    await act(async()=>host.querySelector<HTMLInputElement>('[name="enabled"]')?.click());
    const form=host.querySelector("form")!;
    await act(async()=>{
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async()=>p.resolve({httpStatus:200,success:true,
      data:{...reminder,enabled:false}}));await flush();
    expect(host.textContent).toContain("синтетический ACK");
  });
  it("M08 lost ACK unknown, no auto resend",async()=>{
    update.mockRejectedValueOnce(Error("SECRET_AFTER_COMMIT"));
    await editing();
    await act(async()=>host.querySelector<HTMLInputElement>('[name="enabled"]')?.click());
    await save();
    expect(host.textContent).toContain("Результат неизвестен");
    expect(host.textContent).not.toContain("SECRET_AFTER_COMMIT");
    await click("Проверить настройку (макет)");
    expect(host.textContent).toContain("не подтверждено");
    expect(update).toHaveBeenCalledTimes(1);
  });
  it.each([400,401,403,404,409,503])(
    "M09-M14 status %d never claims real saved",async(status)=>{
      update.mockResolvedValueOnce({httpStatus:status,success:false});
      await editing();
      await act(async()=>host.querySelector<HTMLInputElement>('[name="enabled"]')?.click());
      await save();
      expect(host.textContent).not.toContain("Настройки на сервере не изменены");
      expect(update).toHaveBeenCalledTimes(1);
      if(status>=500)expect(host.textContent).toContain("Результат неизвестен");
    });
  it("M15 A→B late GET never displays private reminder",async()=>{
    const p=later<unknown>();list.mockReturnValueOnce(p.promise);
    await mountReminders();await click("Напоминания о тренировках (макет)");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>p.resolve([reminder]));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Утренняя тренировка");
  });
  it("M16 A→B→A cannot resurrect old preferences",async()=>{
    await opened();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Утренняя тренировка");
  });
  it("M17 A→B late PUT and readback do not revive form",async()=>{
    const p=later<unknown>();update.mockReturnValueOnce(p.promise);
    await editing();
    await act(async()=>host.querySelector<HTMLInputElement>('[name="enabled"]')?.click());
    await act(async()=>host.querySelector("form")?.dispatchEvent(
      new Event("submit",{bubbles:true,cancelable:true})));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>p.resolve({httpStatus:200,success:true,
      data:{...reminder,enabled:false}}));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("синтетический ACK");
  });
  it("M18 legacy private fields never enter profile/reminder DOM",async()=>{
    await mountProfile(true,false);
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).not.toMatch(/SECRET_EMAIL|SECRET_PHONE|SECRET_SESSION|PRIVATE/);
    expect(host.querySelector("input[type=file]")).toBeNull();
    expect(host.textContent).toContain("без реальных сохранений");
  });
  it("M19 real Profile→pet list→details→edit synthetic only",async()=>{
    await mountProfile(false,true);
    await click("Питомцы: посмотреть и изменить (макет)");
    expect(host.textContent).toContain("Барни");
    await click("Открыть");
    expect(host.textContent).toContain("Любит прогулки");
    await click("Редактировать питомца (макет)");
    expect(host.querySelector('form[aria-label="Редактирование питомца"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/SECRET_OWNER|SECRET_PHOTO/);
    // The pet flow requires its own GETs; optional profile widgets may mount
    // in either order or not at all. Never allow mutation or foreign reads.
    const paths=fetchMock.mock.calls.map(([url])=>url);
    for(const endpoint of ["/api/v1/user/profile","/api/v1/pets","/api/v1/pets/pet123"])
      expect(paths).toContain(endpoint);
    expect(paths.every(url=>[
      "/api/v1/user/profile","/api/v1/pets","/api/v1/pets/pet123",
      "/api/v1/feed/status","/api/v1/notes/student",
    ].includes(url))).toBe(true);
    for(const endpoint of new Set(paths))
      expect(paths.filter(url=>url===endpoint)).toHaveLength(1);
    expect(fetchMock.mock.calls.every(([,opts])=>!opts||opts.method==="GET")).toBe(true);
  });
  it("M21 late profile owner A→B hides original city/bio/name",async()=>{
    await mountProfile(true,false);
    expect(host.textContent).toContain("Самара");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Самара");
    expect(host.textContent).not.toContain("Собаки");
    expect(host.textContent).not.toContain("Владелец");
  });
  it("M20 profile pet list foreign owner A→B hidden",async()=>{
    await mountProfile(false,true);
    await click("Питомцы: посмотреть и изменить (макет)");
    await click("Открыть");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Любит прогулки");
  });

  it("M22 quick toggle disabled: only enabled PUT plus immediate GET",async()=>{
    update.mockImplementationOnce(async({changes})=>{
      serverRows=[{...reminder,...changes,privateKey:"SECRET_OWNER"}];
      return {httpStatus:200,success:true,data:{...reminder,...changes}};
    });
    await opened();await click("Выключить (макет)");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"PUT",path:"/api/v1/reminders/rem1",
      changes:{enabled:false},
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Данные совпали только в синтетическом readback");
    await click("К списку напоминаний");
    expect(host.textContent).toContain("Выключено");
    expect(host.innerHTML).not.toContain("SECRET_OWNER");
  });
  it("M23 quick toggle enabled: changed boolean only",async()=>{
    serverRows=[{...reminder,enabled:false}];
    update.mockImplementationOnce(async({changes})=>{
      serverRows=[{...reminder,enabled:true}];
      return {httpStatus:200,success:true,data:{...reminder,...changes}};
    });
    await opened();await click("Включить (макет)");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"PUT",path:"/api/v1/reminders/rem1",
      changes:{enabled:true},
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("M24 DELETE only when explicit synthetic transport exists",async()=>{
    await opened();
    expect(host.textContent).not.toContain("Удалить (макет)");
    expect(remove).not.toHaveBeenCalled();
  });
  it("M25 DELETE confirmation cancel sends zero mutations",async()=>{
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    expect(host.textContent).toContain("Удалить «Утренняя тренировка»?");
    expect(remove).not.toHaveBeenCalled();
    await click("Отмена");
    expect(remove).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("M26 DELETE 200 Hono envelope no data -> automatic GET absence",async()=>{
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    await click("Подтвердить удаление (макет)");
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"DELETE",path:"/api/v1/reminders/rem1",
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Отсутствие ID подтверждено только синтетическим GET");
    await click("К списку напоминаний");
    expect(host.textContent).toContain("Напоминаний: 0 из 5");
  });
  it("M27 DELETE 200 but list still contains ID -> not proven",async()=>{
    remove.mockResolvedValueOnce({httpStatus:200,success:true});
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    await click("Подтвердить удаление (макет)");
    expect(host.textContent).toContain("Сохранение не подтверждено");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("M28 DELETE lost ACK, subsequent GET absent is not proof",async()=>{
    remove.mockImplementationOnce(async()=>{
      serverRows=[];throw Error("SECRET_LOST_ACK");
    });
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    await click("Подтвердить удаление (макет)");
    expect(host.textContent).toContain("Результат неизвестен");
    expect(host.textContent).toContain("Отсутствие ID подтверждено");
    expect(host.textContent).not.toContain("SECRET_LOST_ACK");
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it.each([401,403,404,409,503])("M29 DELETE %d sanitized and one shot",async(code)=>{
    remove.mockResolvedValueOnce({httpStatus:code,success:false,
      error:"SECRET_BACKEND"});
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    await click("Подтвердить удаление (макет)");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("SECRET_BACKEND");
    if(code===503)expect(host.textContent).toContain("Результат неизвестен");
  });
  it("M34 pending double DELETE: single mutation, then GET",async()=>{
    const d=later<unknown>();
    remove.mockReturnValueOnce(d.promise);
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.trim()==="Подтвердить удаление (макет)")!;
    await act(async()=>{button.click();button.click();});
    expect(remove).toHaveBeenCalledTimes(1);
    serverRows=[];
    await act(async()=>d.resolve({httpStatus:200,success:true}));await flush();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("M35 pending double toggle: single PUT and GET",async()=>{
    const d=later<unknown>();update.mockReturnValueOnce(d.promise);
    await opened();
    const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.trim()==="Выключить (макет)")!;
    await act(async()=>{button.click();button.click();});
    expect(update).toHaveBeenCalledTimes(1);
    serverRows=[{...reminder,enabled:false}];
    await act(async()=>d.resolve({httpStatus:200,success:true,
      data:{...reminder,enabled:false}}));await flush();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("M36 DELETE late response A->B->A never resurrects original",async()=>{
    const d=later<unknown>();remove.mockReturnValueOnce(d.promise);
    transport={...transport,delete:remove};
    await opened();await click("Удалить (макет)");
    const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.trim()==="Подтвердить удаление (макет)")!;
    await act(async()=>button.click());
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    await act(async()=>d.resolve({httpStatus:200,success:true}));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Утренняя тренировка");
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("M37 delayed GET A->B->A cannot reveal A after mutation",async()=>{
    const d=later<unknown>();
    list.mockImplementationOnce(async()=>serverRows).mockReturnValueOnce(d.promise);
    await opened();await click("Выключить (макет)");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    await act(async()=>d.resolve([{...reminder,name:"SECRET_LATE_A"}]));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("SECRET_LATE_A");
  });
  it("M38 same actor cache refresh must keep form",async()=>{
    await editing();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"new_name",role:"USER",
    }));
    expect(host.querySelector('form[aria-label="Изменить напоминание"]'))
      .not.toBeNull();
  });
  it("M39 completed toggle cannot be submitted again in same screen",async()=>{
    await opened();await click("Выключить (макет)");
    await click("К списку напоминаний");
    const active=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .filter(x=>x.textContent?.trim()==="Выключить (макет)"&&!x.disabled);
    expect(active).toHaveLength(0);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
