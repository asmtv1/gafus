// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "./ProfileOverview";
import {type SyntheticReminderTransport} from "./remindersSourceMock";
import {reminder} from "./remindersSourceMock.test";
const defer=<T,>()=>{
  let resolve!:(v:T)=>void;
  const promise=new Promise<T>(ok=>resolve=ok);
  return {promise,resolve};
};
const newRecord={id:"created01",name:"Вечером",enabled:true,
  reminderTime:"09:00",reminderDays:null,timezone:"UTC"};
let host:HTMLElement,root:Root,cache:QueryClient;
let items:unknown[];
let create:ReturnType<typeof vi.fn<NonNullable<SyntheticReminderTransport["create"]>>>;
let list:ReturnType<typeof vi.fn<SyntheticReminderTransport["list"]>>;
let fetcher:ReturnType<typeof vi.fn>;
const pause=async()=>act(async()=>{await new Promise(done=>setTimeout(done,20));});
async function render(enable=true,withCreate=true){
  const transport:SyntheticReminderTransport={
    fixtureKind:"AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY",
    list,update:vi.fn().mockResolvedValue({httpStatus:200,success:true}),
    ...(withCreate?{create}:{}),
  };
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <ProfileOverview userId="A" showRemindersOptIn={enable}
      remindersSyntheticTransport={transport}/>
  </QueryClientProvider>));await pause();
}
async function click(text:string){
  const btn=[...host.querySelectorAll("button")].find(x=>x.textContent?.trim()===text);
  expect(btn,text).toBeDefined();
  await act(async()=>btn?.click());await pause();
}
async function open(){
  await render();await click("Напоминания о тренировках (макет)");
  await click("Добавить напоминание (макет)");
}
async function type(id:string,value:string){
  const input=host.querySelector<HTMLInputElement>("#"+id);
  expect(input).not.toBeNull();
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,value);
    input?.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function save(){
  const form=host.querySelector('form[aria-label="Создать напоминание"]');
  expect(form).not.toBeNull();
  await act(async()=>form?.dispatchEvent(new Event("submit",{
    bubbles:true,cancelable:true,
  })));await pause();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner",role:"USER"});
  items=[];
  list=vi.fn(async()=>items);
  create=vi.fn(async()=>({httpStatus:201,success:true,data:newRecord}));
  fetcher=vi.fn(async(path:string,opts:RequestInit)=>{
    if(path!=="/api/v1/user/profile"||opts?.method!=="GET")
      throw Error("NO_REAL_NETWORK");
    return new Response(JSON.stringify({success:true,data:{
      id:"A",username:"owner",email:"PRIVATE_EMAIL",
      profile:{fullName:"Owner",city:"Самара",about:"Собаки"},
    }}),{status:200});
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("AG2 Profile -> reminders POST opt-in synthetic form",()=>{
  it("C01 no fixture or create transport means no entry",async()=>{
    await render(false,false);expect(host.textContent).not.toContain("Добавить напоминание");
    await render(true,false);await click("Напоминания о тренировках (макет)");
    expect(host.textContent).not.toContain("Добавить напоминание");
    expect(create).not.toHaveBeenCalled();
  });
  it("C02 profile->reminders->create->POST-only synthetic->manual GET",async()=>{
    await open();await type("reminder-create-name","Вечером");await save();
    expect(create).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"POST",path:"/api/v1/reminders",
      body:{name:"Вечером",reminderTime:"09:00",reminderDays:null,timezone:"UTC"},
    });
    expect(host.textContent).toContain("Только синтетический ACK");
    items=[{...newRecord,userId:"PRIVATE_OWNER",endpoint:"PRIVATE_ENDPOINT"}];
    await click("Проверить список (макет)");
    expect(host.textContent).toContain("В синтетическом списке найден");
    await click("К списку напоминаний");
    expect(host.textContent).toContain("Вечером");
    const unrelatedGets=fetcher.mock.calls.map(([url])=>url);
    expect(unrelatedGets).toContain("/api/v1/user/profile");
    // Notes and Moments status run as independent optional widgets, not as
    // a network-order or GET-count contract of the reminder action.
    for(const endpoint of ["/api/v1/user/profile","/api/v1/feed/status","/api/v1/notes/student"])
      expect(unrelatedGets.filter(url=>url===endpoint).length).toBeLessThanOrEqual(1);
    expect(unrelatedGets.every(url=>[
      "/api/v1/user/profile","/api/v1/feed/status","/api/v1/notes/student",
    ].includes(url))).toBe(true);
    expect(fetcher.mock.calls.every(([,opts])=>!opts||opts.method==="GET")).toBe(true);
    expect(host.innerHTML).not.toMatch(/PRIVATE_EMAIL|PRIVATE_OWNER|PRIVATE_ENDPOINT/);
  });
  it("C03 blank/invalid name/timezone no POST",async()=>{
    await open();await save();expect(host.textContent).toContain("Название");
    await type("reminder-create-name","Вечером");
    await type("reminder-create-zone","SECRET_ZONE");
    await save();expect(host.textContent).toContain("часовой пояс");
    expect(create).not.toHaveBeenCalled();
  });
  it("C04 five existing reminders locks creation",async()=>{
    items=Array.from({length:5},(_,i)=>({...reminder,id:"rem"+i}));
    await render();await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("5 из 5");
    expect(host.textContent).not.toContain("Добавить напоминание");
    expect(create).not.toHaveBeenCalled();
  });
  it("C05 503 loss UNKNOWN -> exactly one create, manual GET cannot prove absence",async()=>{
    create.mockRejectedValueOnce(Error("PRIVATE_LOST_ACK"));
    await open();await type("reminder-create-name","Вечером");await save();
    expect(host.textContent).toContain("Результат создания неизвестен");
    await click("Проверить список (макет)");
    expect(host.textContent).toContain("Создание не подтверждено");
    expect(host.textContent).not.toContain("PRIVATE_LOST_ACK");
    expect(create).toHaveBeenCalledTimes(1);
    await click("К списку напоминаний");
    expect(host.textContent).not.toContain("Добавить напоминание");
  });
  it.each([400,401,403,429])("C06 rejected %d bounded",async(status)=>{
    create.mockResolvedValueOnce({httpStatus:status,success:false});
    await open();await type("reminder-create-name","Вечером");await save();
    expect(host.textContent).not.toContain("Только синтетический ACK");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("C10 concurrent submit only one POST even with delayed response",async()=>{
    const pending=defer<unknown>();create.mockReturnValueOnce(pending.promise);
    await open();await type("reminder-create-name","Вечером");
    const form=host.querySelector("form")!;
    await act(async()=>{
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async()=>pending.resolve({httpStatus:201,success:true,data:newRecord}));
    await pause();
    expect(host.textContent).toContain("синтетический ACK");
  });
  it("C11 same owner auth refresh does not fence active create form",async()=>{
    await open();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"owner-refresh",role:"USER",
    }));
    expect(host.querySelector('form[aria-label="Создать напоминание"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Сессия изменилась");
    await type("reminder-create-name","Вечером");
    await save();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("C12 A->B->A late POST never displays success / private form",async()=>{
    const pending=defer<unknown>();create.mockReturnValueOnce(pending.promise);
    await open();await type("reminder-create-name","PRIVATE_DRAFT");
    const form=host.querySelector("form")!;
    await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"other",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"owner",role:"USER",
    }));
    await act(async()=>pending.resolve({httpStatus:201,success:true,data:newRecord}));
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_DRAFT");
    expect(host.textContent).not.toContain("синтетический ACK");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
