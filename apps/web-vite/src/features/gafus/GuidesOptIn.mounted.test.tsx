// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "../profile/ProfileOverview";
import type {GuidesSourceMock} from "./guidesReadApi";
const guide=(unlocked=true,id="g1")=>({
  courseId:id,title:unlocked?"Доступный гайд":"Закрытый гайд",
  description:"Занимаемся с собакой",imageUrl:"SECRET_S3",
  unlocked,accessSource:unlocked?"SUBSCRIPTION":"NONE",
  expiresAt:null,canPurchase:true,price:1,private:"PRIVATE_EMAIL",
});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
  const promise=new Promise<T>(ok=>resolve=ok);return {promise,resolve};};
let host:HTMLElement,root:Root,cache:QueryClient,wire:GuidesSourceMock;
let list:ReturnType<typeof vi.fn<GuidesSourceMock["list"]>>;
let read:ReturnType<typeof vi.fn<GuidesSourceMock["read"]>>;
let fetcher:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(ok=>setTimeout(ok,20));});
async function render(enabled=true,transport:GuidesSourceMock|null=wire,userId="owner"){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <ProfileOverview userId={userId} showGuidesOptIn={enabled}
      guidesSyntheticTransport={transport??undefined}/>
  </QueryClientProvider>));await tick();
}
async function click(text:string){
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(el=>el.textContent?.trim()===text);
  expect(button,text).toBeDefined();
  await act(async()=>button?.click());await tick();
}
async function enter(){await render();await click("Мини-гайды за гафусы (макет)");}
const env=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"owner"});
  list=vi.fn(async()=>[guide(),guide(false,"g2")]);
  read=vi.fn(async(id:string)=>({courseId:id,
    guideContent:"<h2>Безопасный текст</h2><script>PRIVATE_SCRIPT</script>"}));
  wire={fixtureKind:"AG2_GUIDES_SYNTHETIC_GET_ONLY",list,read};
  fetcher=vi.fn(async(url:string)=>{
    if(url!=="/api/v1/user/profile")throw Error("UNAPPROVED_API");
    return env({id:"owner",username:"owner",
      profile:{fullName:"Владелец",city:"Самара",about:"Собака"},
      email:"PRIVATE_PROFILE_MAIL"});
  });
  vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();
  vi.unstubAllGlobals();
});
describe("WEB-URL-026 owner Profile -> guides source/mock",()=>{
  it("M01 default off no entry or guide reads",async()=>{
    await render(false);expect(host.textContent).not.toContain("Мини-гайды за гафусы (макет)");
    expect(list).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it("M02 missing explicit transport no entry",async()=>{
    await render(true,null);expect(host.textContent).not.toContain("Мини-гайды за гафусы (макет)");
  });
  it("M03 user-entry opens catalog, locked not readable, return",async()=>{
    await enter();
    expect(list).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Закрытый гайд");
    expect(host.textContent).toContain("Для открытия требуется доступ");
    expect(read).not.toHaveBeenCalled();
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|imageUrl/);
    expect(host.querySelectorAll(".guides-grid button")).toHaveLength(1);
    await click("Читать");expect(read).toHaveBeenCalledExactlyOnceWith("g1");
    expect(host.textContent).toContain("Безопасный текст");
    expect(host.textContent).not.toContain("PRIVATE_SCRIPT");
    await click("К мини-гайдам");
    expect(host.textContent).toContain("Закрытый гайд");
    await click("Мой профиль");expect(host.textContent).toContain("Мини-гайды за гафусы (макет)");
  });
  it("M04 empty catalog",async()=>{
    list.mockResolvedValueOnce([]);await enter();
    expect(host.textContent).toContain("Мини-гайды пока не опубликованы");
    expect(read).not.toHaveBeenCalled();
  });
  it("M05 loading state",async()=>{
    const d=deferred<unknown>();list.mockReturnValueOnce(d.promise);await enter();
    expect(host.textContent).toContain("Загружаем мини-гайды");
    await act(async()=>d.resolve([guide()]));await tick();
    expect(host.textContent).toContain("Доступный гайд");
  });
  it("M06 list error redacted, retry",async()=>{
    list.mockRejectedValueOnce(Error("PRIVATE_STACK"));await enter();
    expect(host.textContent).toContain("Не удалось загрузить мини-гайды");
    expect(host.textContent).not.toContain("PRIVATE_STACK");
    await click("Повторить список");expect(host.textContent).toContain("Доступный гайд");
  });
  it("M07 unauthorized guide read stays error, no unlock",async()=>{
    read.mockRejectedValueOnce(Error("PRIVATE_403"));await enter();await click("Читать");
    expect(host.textContent).toContain("Не удалось прочитать мини-гайд");
    expect(host.textContent).not.toContain("PRIVATE_403");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("M08 invalid list DTO refused",async()=>{
    list.mockResolvedValueOnce([guide(),guide()]);await enter();
    expect(host.textContent).toContain("Не удалось загрузить мини-гайды");
  });
  it("M09 late list A-B-A cannot show old data",async()=>{
    const d=deferred<unknown>();list.mockReturnValueOnce(d.promise);await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner"}));
    await act(async()=>d.resolve([guide()]));await tick();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Доступный гайд");
  });
  it("M10 late guide content A-B-A never reaches DOM",async()=>{
    const d=deferred<unknown>();read.mockReturnValueOnce(d.promise);
    await enter();await click("Читать");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner"}));
    await act(async()=>d.resolve({courseId:"g1",guideContent:"PRIVATE_LATE_CONTENT"}));
    await tick();expect(host.textContent).not.toContain("PRIVATE_LATE_CONTENT");
  });
  it("M11 login identity mismatch denies entrance",async()=>{
    await render(true,wire,"another");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(list).not.toHaveBeenCalled();
  });
  it("M12 no mutation APIs in source/mock path",async()=>{
    await enter();await click("Читать");
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/user/profile", "/api/v1/feed/status",
    ]);
    expect(fetcher.mock.calls.every(([,o])=>o.method==="GET")).toBe(true);
  });
});
