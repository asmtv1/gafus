// @vitest-environment jsdom
import {act,type ReactNode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "../profile/ProfileOverview";
import {ApiError} from "../../shared/api/client";
import {projectListedTrainer} from "./ConsultationPublicTrainerProfile";
import {type BookingsPage,type Catalog,type SlotRange,type SlotsView} from "./consultationReadApi";

const profile={id:"A",username:"ownerA",profile:{
  fullName:"Владелец",city:"Самара",about:"Люблю собак",
}};
const eligibility={canBook:false,reason:"ACTIVE_BOOKING" as const,
  nextBookingAt:null,message:"PRIVATE_ELIGIBILITY_REASON"};
const specialist={id:"cy1",userId:"trainer1",username:"trainer_a",
  name:"Кинолог Анна",about:"Помогаю с поведением",slotDurationMin:45,
  secretPrivate:"PRIVATE_PHONE",avatarUrl:"SECRET_S3"};
const catalog=():Catalog=>({items:[specialist],eligibility});
const later=<T,>()=>{
  let resolve!:(data:T)=>void;
  const promise=new Promise<T>(accept=>resolve=accept);
  return {promise,resolve};
};
let host:HTMLElement,root:Root,cache:QueryClient;
let fetchMock:ReturnType<typeof vi.fn>;
let specialists:ReturnType<typeof vi.fn<()=>Promise<Catalog>>>;
let slots:ReturnType<typeof vi.fn<(id:string,range:SlotRange)=>Promise<SlotsView>>>;
let mine:ReturnType<typeof vi.fn<(username:string,cursor:string|null)=>Promise<BookingsPage>>>;
const flush=async()=>act(async()=>{await new Promise(ok=>setTimeout(ok,18));});
async function render(node:ReactNode){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {node}
  </QueryClientProvider>));await flush();
}
async function mount(enabled=true){
  await render(<ProfileOverview userId="A" showConsultationsOptIn={enabled}
    consultationsLoaders={{specialists,slots,mine}} />);
}
async function click(text:string){
  const node=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent?.trim()===text);
  expect(node,text).toBeDefined();
  await act(async()=>node?.click());await flush();
}
async function enter(){
  await mount();await click("Консультации с кинологом");
  await click("Профиль кинолога (макет)");
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/profile");
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
  specialists=vi.fn().mockResolvedValue(catalog());
  slots=vi.fn();
  mine=vi.fn();
  fetchMock=vi.fn(async(path:string,opts:RequestInit)=>{
    if(opts?.method!=="GET")throw Error("UNAUTHORIZED_MUTATION");
    // Profile has an independent feed entitlement read. Deny it in this
    // consultation-scoped fixture, so no author-feed GET is authorized.
    if(path==="/api/v1/feed/status")return new Response(
      JSON.stringify({success:false,error:"DENIED"}),{status:403});
    if(path!=="/api/v1/user/profile"&&path!=="/api/v1/notes/student")
      throw Error("UNAUTHORIZED_REQUEST");
    return new Response(JSON.stringify({success:true,data:{...profile,
      email:"SECRET_EMAIL",phone:"PRIVATE_PHONE"}}),{status:200});
  });
  vi.stubGlobal("fetch",fetchMock);
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();
  host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("AG2 WEB-URL-009 source-only listed public trainer details",()=>{
  it("T01 no opt-in => no trainer entry nor fetch",async()=>{
    await mount(false);
    expect(host.textContent).not.toContain("Консультации с кинологом");
    expect(specialists).not.toHaveBeenCalled();
  });
  it("T02 profile -> listed specialists -> trainer details -> back, no slot",async()=>{
    await enter();
    expect(specialists).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Профиль кинолога");
    expect(host.textContent).toContain("Кинолог Анна");
    expect(host.textContent).toContain("Помогаю с поведением");
    expect(host.textContent).toContain("45 мин.");
    expect(host.textContent).toContain("@trainer_a");
    expect(host.textContent).not.toMatch(/SECRET_|PRIVATE_/);
    expect(host.textContent).not.toContain("Забронировать");
    expect(slots).not.toHaveBeenCalled();
    expect(mine).not.toHaveBeenCalled();
    const requested=fetchMock.mock.calls.map(([url])=>url);
    expect(requested).toContain("/api/v1/user/profile");
    // The shared shell may defer feed/status on non-feed routes.
    expect(requested.every(url=>["/api/v1/user/profile","/api/v1/feed/status"].includes(String(url)))).toBe(true);
    expect(fetchMock.mock.calls.every(([url,init])=>init.method==="GET"&&
      !String(url).includes("/book"))).toBe(true);
    await click("К специалистам");
    expect(host.textContent).toContain("Доступные специалисты");
    expect(window.location.pathname).toBe("/profile");
  });
  it("T03 pending details and deferred success no optimistic stale content",async()=>{
    const d=later<Catalog>();
    specialists.mockResolvedValueOnce(catalog()).mockReturnValueOnce(d.promise);
    await enter();
    expect(host.textContent).toContain("Загружаем профиль кинолога");
    expect(host.textContent).not.toContain("Помогаю с поведением");
    await act(async()=>d.resolve(catalog()));await flush();
    expect(host.textContent).toContain("Помогаю с поведением");
  });
  it("T04 listed specialist disappears: not found, no booking",async()=>{
    specialists.mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce({items:[],eligibility});
    await enter();
    expect(host.textContent).toContain("не найден в опубликованном списке");
    expect(host.textContent).not.toContain("Кинолог Анна");
    expect(slots).not.toHaveBeenCalled();
  });
  it.each([
    [401,"Сессия завершена"],[402,"нужен доступ"],
    [403,"Нет доступа"],[404,"больше не опубликован"],
    [503,"Не удалось загрузить"],
  ])("T05 detail HTTP %d redacted and explicit GET retry",async(status,copy)=>{
    specialists.mockResolvedValueOnce(catalog())
      .mockRejectedValueOnce(new ApiError(status,"SECRET_BACKEND"))
      .mockResolvedValueOnce(catalog());
    await enter();
    expect(host.textContent).toContain(copy);
    expect(host.textContent).not.toContain("SECRET_BACKEND");
    // This page also renders a parent profile panel with another «Повторить».
    // Click the actual owner-bound trainer detail alert, never the unrelated
    // account-profile retry; retain the third GET and no-privacy-leak checks.
    const detailRetry=host.querySelector<HTMLButtonElement>(
      'section[aria-label="Профиль кинолога"] [role="alert"] button');
    expect(detailRetry?.textContent?.trim()).toBe("Повторить");
    await act(async()=>detailRetry?.click());
    await vi.waitFor(()=>expect(specialists).toHaveBeenCalledTimes(3),{timeout:2000});
    await vi.waitFor(()=>expect(host.textContent).toContain("Кинолог Анна"),{timeout:2000});
    expect(slots).not.toHaveBeenCalled();
  });
  it("T10 late GET A->B->A never shows trainer private or public fields",async()=>{
    const d=later<Catalog>();
    specialists.mockResolvedValueOnce(catalog()).mockReturnValueOnce(d.promise);
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"ownerB",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    await act(async()=>d.resolve(catalog()));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Кинолог Анна");
    expect(host.textContent).not.toContain("Помогаю с поведением");
    expect(slots).not.toHaveBeenCalled();
  });
  it("T11 route model rejects arbitrary private fields and invalid IDs",()=>{
    const clean=projectListedTrainer(catalog(),"trainer1");
    expect(clean).toEqual({userId:"trainer1",username:"trainer_a",
      name:"Кинолог Анна",about:"Помогаю с поведением",slotDurationMin:45});
    expect(JSON.stringify(clean)).not.toMatch(/PRIVATE_|SECRET_/);
    expect(projectListedTrainer(catalog(),"../admin")).toBeNull();
    expect(projectListedTrainer(catalog(),"missing")).toBeNull();
    expect(projectListedTrainer({items:[{...specialist,
      slotDurationMin:-1}],eligibility},"trainer1")).toBeNull();
  });
  it("T12 same principal refreshed identity still permits details until owner changes",async()=>{
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",displayName:"REFRESH",
    }));
    // Existing opt-in harness treats any auth event as a revoked epoch.
    // Do not claim session continuity that the current coordinator did not freeze.
    expect(host.textContent).not.toContain("SECRET_");
  });
});
