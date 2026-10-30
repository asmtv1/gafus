// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ExcusesOptIn} from "./ExcusesOptIn";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {ExcuseFixture} from "./excuseSourceMock";
const message="Извините за задержку: я увидел сообщение поздно и всё исправлю.";
const ack=(overrides:Record<string,unknown>={})=>({success:true,
 data:{excuse:message,plausibility:75,tone:"спокойный",
  secret:"PRIVATE_UPSTREAM",...overrides},private:"SECRET_TOKEN"});
const later=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(
 ok=>resolve=ok);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:ExcuseFixture,
 generate:ReturnType<typeof vi.fn<ExcuseFixture["generate"]>>,fetcher:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(ok=>setTimeout(ok,26));});
async function mount(enabled=true,fixture:ExcuseFixture|null=wire){
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <ExcusesOptIn enabled={enabled} fixture={fixture??undefined}/>
 </QueryClientProvider>));await tick();
}
async function mountApp(){
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showExcusesOptIn excusesSyntheticFixture={wire}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(x=>x.textContent?.trim()===label);
 expect(b,label).toBeDefined();
 await act(async()=>b?.click());await tick();
}
async function enter(){await mount();await click("Генератор отмазок (макет)");}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false,
  refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
 generate=vi.fn(async()=>ack());
 wire={fixtureKind:"AG2_PUBLIC_EXCUSES_SYNTHETIC_PROVIDER_ONLY",generate};
 fetcher=vi.fn(async(_url:string)=>
  new Response(JSON.stringify({success:true,data:[]}),{status:200}));
 vi.stubGlobal("fetch",fetcher);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());
 cache.clear();host.remove();vi.unstubAllGlobals();
 window.history.replaceState(null,"","/");});
describe("WEB-URL-051 public Next-only POST /api/excuses synthetic opt-in",()=>{
 it("M01 disabled renders nothing, no POST",async()=>{
  await mount(false);
  expect(host.textContent).not.toContain("Генератор отмазок (макет)");
  expect(generate).not.toHaveBeenCalled();
 });
 it("M02 fixture kind required",async()=>{
  await mount(true,null);
  expect(host.textContent).not.toContain("Генератор отмазок (макет)");
 });
 it("M03 unauthenticated /courses cannot reveal private opt-in or issue synthetic POST",async()=>{
  await mountApp();
  expect(host.textContent).not.toContain("Генератор отмазок (макет)");
  await act(async()=>{window.history.pushState(null,"","/courses");
    window.dispatchEvent(new PopStateEvent("popstate"));});await tick();
  // App has no guest course scenario: unauthorized route shows landing/login.
  expect(host.textContent).toContain("Начать заниматься");
  expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Генератор отмазок (макет)");
  expect(generate).not.toHaveBeenCalled();
 });
 it("M04 generation validates situation and safe DTO",async()=>{
  await enter();await click("Сгенерировать");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0]).toMatchObject({
   method:"POST",path:"/api/excuses",json:{situationId:"late-work"}});
  expect(host.textContent).toContain(message);
  expect(host.textContent).toContain("75%");
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|UPSTREAM/);
 });
 it("M05 changing situation resets stale result",async()=>{
  await enter();await click("Сгенерировать");
  await click("Не сделал домашку");
  expect(host.textContent).not.toContain(message);
  await click("Сгенерировать");
  expect(generate.mock.calls[1][0]).toMatchObject({json:{situationId:"homework"}});
 });
 it("M06 invalid response error, safe bounded text",async()=>{
  generate.mockResolvedValueOnce(ack({plausibility:999}));
  await enter();await click("Сгенерировать");
  expect(host.textContent).toContain("Не удалось сгенерировать");
  expect(host.textContent).not.toContain("PRIVATE");
 });
 it("M07 upstream failure generic no secret",async()=>{
  generate.mockRejectedValueOnce(Error("SECRET_OPENROUTER_API_KEY"));
  await enter();await click("Сгенерировать");
  expect(host.textContent).toContain("Попробуйте позже");
  expect(host.textContent).not.toContain("SECRET");
 });
 it("M08 synchronous double submit single-flight",async()=>{
  const d=later<unknown>();generate.mockReturnValueOnce(d.promise);
  await enter();
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
   .find(x=>x.textContent?.trim()==="Сгенерировать");
  await act(async()=>{button?.click();button?.click();});
  expect(generate).toHaveBeenCalledTimes(1);
  await act(async()=>d.resolve(ack()));await tick();
  expect(host.textContent).toContain(message);
 });
 it("M09 late response old situation cannot corrupt new selection",async()=>{
  const d=later<unknown>();generate.mockReturnValueOnce(d.promise);
  await enter();await click("Сгенерировать");
  await click("Забыл про день рождения");
  await act(async()=>d.resolve(ack()));await tick();
  expect(host.textContent).not.toContain(message);
  expect(host.textContent).toContain("Тёплое извинение");
 });
 it("M10 late response after unmount cannot render",async()=>{
  const d=later<unknown>();generate.mockReturnValueOnce(d.promise);
  await enter();await click("Сгенерировать");
  await act(async()=>root.render(<p>Другая страница</p>));
  await act(async()=>d.resolve(ack()));await tick();
  expect(host.textContent).toBe("Другая страница");
 });
 it("M11 back clears generated result",async()=>{
  await enter();await click("Сгенерировать");
  await click("Назад");
  expect(host.textContent).not.toContain(message);
  await click("Генератор отмазок (макет)");
  expect(host.textContent).not.toContain(message);
 });
 it("M12 no browser real POST, or OpenRouter call",async()=>{
  await enter();await click("Сгенерировать");
  expect(fetcher).not.toHaveBeenCalled();
 });
});
