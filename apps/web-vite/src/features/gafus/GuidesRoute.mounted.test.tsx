// @vitest-environment jsdom
/** WEB-URL-026 actual App/router mounted source-only mini-guides, no unlock. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {navigate,routeForPath} from "../../shared/router/location";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {GuidesSourceMock} from "./guidesReadApi";
const actor=(id:string)=>({id,username:"user_"+id,role:"USER"});
const guide=(unlocked=true,id="g1",extra:Record<string,unknown>={})=>({
 courseId:id,title:unlocked?"Доступный гайд":"Закрытый гайд",
 description:"Тренировка с собакой",imageUrl:"PRIVATE_S3_SIGNED",
 unlocked,accessSource:unlocked?"SUBSCRIPTION":"NONE",expiresAt:null,
 canPurchase:true,price:1,secret:"SECRET_MAIL",...extra,
});
const content=(id="g1")=>({courseId:id,
 guideContent:"<h2>Шаги обучения</h2><script>PRIVATE_TOKEN</script>"});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
 const promise=new Promise<T>(ok=>resolve=ok);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:GuidesSourceMock;
let list:ReturnType<typeof vi.fn<GuidesSourceMock["list"]>>;
let read:ReturnType<typeof vi.fn<GuidesSourceMock["read"]>>;
let fetcher:ReturnType<typeof vi.fn>;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./GuidesOptIn"),
 import("../profile/ProfileOverview"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
async function mount(path="/gafus/guides",enabled=true,withWire=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showGuidesRouteOptIn={enabled} guidesRouteWire={withWire?wire:undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(el=>el.textContent?.trim()===label);
 expect(node,label).toBeDefined();await act(async()=>node?.click());await tick();
}
async function switchActor(id:string|null){
 await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,id?actor(id):null));
 await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A"));
 list=vi.fn(async()=>[guide(),guide(false,"g2")]);
 read=vi.fn(async(id:string)=>content(id));
 wire={fixtureKind:"AG2_GUIDES_SYNTHETIC_GET_ONLY",list,read};
 fetcher=vi.fn(async(url:string,opts?:RequestInit)=>{
  if(opts?.method&&opts.method!=="GET")throw Error("MUTATION_FORBIDDEN");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({success:true,
   data:{id:"A",username:"user_A",profile:{fullName:"Owner",city:"",about:""}}}),
   {status:200});
  throw Error("UNEXPECTED_API_"+url);
 });
 vi.stubGlobal("fetch",fetcher);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
describe("WEB-URL-026 exact owner mini-guide legacy URL",()=>{
 it("G01 exact route recognized, no malformed or reserved children",()=>{
  expect(routeForPath("/gafus/guides")).toBe("/gafus/guides");
  for(const path of ["/gafus/guides/a","/gafus%2Fguides","//gafus/guides"])
   expect(routeForPath(path)).toBeNull();
 });
 it("G02 default off/no fixture: 404 and no source reads",async()=>{
  await mount("/gafus/guides",false);expect(host.textContent).toContain("Страница не найдена");
  await mount("/gafus/guides",true,false);
  expect(host.textContent).toContain("Страница не найдена");
  expect(list).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it("G03 guest has login guard; no catalog or private content",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);await mount();
  expect(host.textContent).toContain("Сессия изменилась");
  expect(list).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it("G04 direct bookmark shows list, locked cannot read, no private fields",async()=>{
  await mount();expect(list).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Доступный гайд");
  expect(host.textContent).toContain("Закрытый гайд");
  expect(host.querySelectorAll(".guides-grid button")).toHaveLength(1);
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|imageUrl/);
  expect(read).not.toHaveBeenCalled();// The App shell independently checks onboarding state with a read-only GET.
  // These owner dashboards must never make any other network request or write.
  expect(fetcher.mock.calls.map(([path,opts])=>[path,opts?.method])).toEqual([
    ["/api/v1/user/onboarding-tour","GET"],
  ]);
 });
 it("G05 authorized GET reader is plain text, never script or unlock POST",async()=>{
  await mount();await click("Читать");
  expect(read).toHaveBeenCalledExactlyOnceWith("g1");
  expect(host.textContent).toContain("Шаги обучения");
  expect(host.innerHTML).not.toContain("PRIVATE_TOKEN");
  await click("К мини-гайдам");
  expect(host.textContent).toContain("Закрытый гайд");
  // The App shell independently checks onboarding state with a read-only GET.
  // These owner dashboards must never make any other network request or write.
  expect(fetcher.mock.calls.map(([path,opts])=>[path,opts?.method])).toEqual([
    ["/api/v1/user/onboarding-tour","GET"],
  ]);
 });
 it("G06 loading state blocks reader until catalog resolved",async()=>{
  const d=deferred<unknown>();list.mockReturnValueOnce(d.promise);await mount();
  expect(host.textContent).toContain("Загружаем мини-гайды");
  expect(read).not.toHaveBeenCalled();
  await act(async()=>d.resolve([guide()]));await tick();
  expect(host.textContent).toContain("Доступный гайд");
 });
 it("G07 empty catalog explicitly shown",async()=>{
  list.mockResolvedValueOnce([]);await mount();
  expect(host.textContent).toContain("Мини-гайды пока не опубликованы");
  expect(read).not.toHaveBeenCalled();
 });
 it("G08 catalog error generic, manual retry only",async()=>{
  list.mockRejectedValueOnce(Error("PRIVATE_PG"));await mount();
  expect(host.textContent).toContain("Не удалось загрузить мини-гайды");
  expect(host.innerHTML).not.toContain("PRIVATE_PG");
  expect(list).toHaveBeenCalledTimes(1);
  await click("Повторить список");
  expect(list).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Доступный гайд");
 });
 it("G09 malformed catalog fails closed without content GET",async()=>{
  list.mockResolvedValueOnce([guide(),guide()]);await mount();
  expect(host.textContent).toContain("Не удалось загрузить мини-гайды");
  expect(read).not.toHaveBeenCalled();
 });
 it("G10 forbidden server content GET hides data, manual retry",async()=>{
  read.mockRejectedValueOnce({status:403,message:"PRIVATE_403"});await mount();
  await click("Читать");
  expect(host.textContent).toContain("Не удалось прочитать мини-гайд");
  expect(host.innerHTML).not.toContain("PRIVATE_403");
  expect(read).toHaveBeenCalledTimes(1);
  await click("Повторить чтение");
  expect(read).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Шаги обучения");
 });
 it("G11 mismatched guide ID fails closed",async()=>{
  read.mockResolvedValueOnce(content("someone_else"));await mount();
  await click("Читать");
  expect(host.textContent).toContain("Не удалось прочитать мини-гайд");
  expect(host.textContent).not.toContain("Шаги обучения");
 });
 it("G12 late catalog A-B-A cannot leak to newly restored owner",async()=>{
  const d=deferred<unknown>();list.mockReturnValueOnce(d.promise);await mount();
  await switchActor("B");await switchActor("A");
  await act(async()=>d.resolve([guide()]));await tick();
  expect(host.textContent).not.toContain("Доступный гайд");
  expect(host.textContent).toContain("Личные данные скрыты");
 });
 it("G13 late content A-B-A cannot leak to restored owner",async()=>{
  const d=deferred<unknown>();read.mockReturnValueOnce(d.promise);
  await mount();await click("Читать");
  await switchActor("B");await switchActor("A");
  await act(async()=>d.resolve(content("g1")));await tick();
  expect(host.textContent).not.toContain("Шаги обучения");
 });
 it("G14 route exit before late guide content does not show stale content",async()=>{
  const d=deferred<unknown>();read.mockReturnValueOnce(d.promise);
  await mount();await click("Читать");
  await act(async()=>navigate("/courses"));await tick();
  await act(async()=>d.resolve(content("g1")));await tick();
  expect(host.querySelector(".guides-reader")).toBeNull();
 });
 it("G15 profile entry, back, direct popstate; no private source when off",async()=>{
  await mount("/profile");
  const link=host.querySelector<HTMLAnchorElement>('a[href="/gafus/guides"]');
  expect(link).not.toBeNull();
  await act(async()=>link?.dispatchEvent(new MouseEvent("click",{
   bubbles:true,cancelable:true,button:0})));await tick();
  expect(location.pathname).toBe("/gafus/guides");
  expect(host.textContent).toContain("Доступный гайд");
  await click("Мой профиль");expect(location.pathname).toBe("/profile");
  await act(async()=>{window.history.replaceState(null,"","/gafus/guides");
   window.dispatchEvent(new PopStateEvent("popstate"));});await tick();
  expect(host.textContent).toContain("Доступный гайд");
 });
});
