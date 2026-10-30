// @vitest-environment jsdom
/** WEB-URL-051: PUBLIC App route, injected synthetic provider only. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {routeForPath} from "../../shared/router/location";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {ExcuseFixture} from "./excuseSourceMock";
const text="Сегодня задержался по дороге и заранее предупредил коллег о переносе встречи.";
const response=(extra:Record<string,unknown>={})=>({success:true,
 data:{excuse:text,plausibility:82,tone:"Уважительный",
  secret:"PRIVATE_GENERATION_TOKEN",...extra}});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,fixture:ExcuseFixture;
let generate:ReturnType<typeof vi.fn<ExcuseFixture["generate"]>>;
let network:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,25));});
async function mount(path="/otmazki",enabled=true,withFixture=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showExcusesOptIn={enabled}
   excusesSyntheticFixture={withFixture?fixture:undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const found=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(b=>b.textContent?.trim()===label);
 expect(found,label).toBeDefined();await act(async()=>found?.click());await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,null); // Explicit guest
 generate=vi.fn(async()=>response());
 fixture={fixtureKind:"AG2_PUBLIC_EXCUSES_SYNTHETIC_PROVIDER_ONLY",generate};
 network=vi.fn(async()=>{throw Error("UNEXPECTED_NETWORK_CALL");});
 vi.stubGlobal("fetch",network);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();host.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("WEB-URL-051 /otmazki public App opt-in only",()=>{
 it("R01 exact bookmarked URL; malformed/encoded children never accepted",()=>{
  expect(routeForPath("/otmazki")).toBe("/otmazki");
  for(const path of ["/otmazki/secret","/otmazki%2Fadmin","//otmazki"])
   expect(routeForPath(path)).not.toBe("/otmazki");
 });
 it("R02 default OFF or missing fixture 404 without generation",async()=>{
  await mount("/otmazki",false);expect(host.textContent).toContain("Страница не найдена");
  await mount("/otmazki",true,false);
  expect(host.textContent).toContain("Страница не найдена");
  expect(generate).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
 });
 it("R03 guest direct URL displays public five choices with accessible group",async()=>{
  await mount();
  expect(host.textContent).toContain("Генератор отмазок");
  expect(host.querySelector("[role=\"group\"][aria-label=\"Выберите ситуацию\"]")).not.toBeNull();
  const choices=host.querySelectorAll(".excuses-options button[aria-pressed]");
  expect(choices).toHaveLength(5);
  expect(choices[0]?.getAttribute("aria-pressed")).toBe("true");
  expect(host.textContent).not.toContain("Требуется авторизация");
  expect(generate).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
 });
 it("R04 synthetic POST-typed request is NOT actual browser POST",async()=>{
  await mount();await click("Сгенерировать");
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0]).toMatchObject({method:"POST",path:"/api/excuses",
   json:{situationId:"late-work"}});
  expect(host.textContent).toContain(text);
  expect(host.querySelector<HTMLProgressElement>("progress[aria-label=\"Правдоподобность\"]")?.value)
   .toBe(82);
  expect(host.innerHTML).not.toContain("PRIVATE_GENERATION_TOKEN");
  expect(network).not.toHaveBeenCalled();
 });
 it("R05 changed situation resets previous generated response",async()=>{
  await mount();await click("Сгенерировать");await click("Не сделал домашку");
  expect(host.textContent).not.toContain(text);
  expect(host.querySelector('button[aria-pressed="true"]')?.textContent)
   .toContain("Не сделал домашку");
  await click("Сгенерировать");
  expect(generate.mock.calls[1][0]).toMatchObject({json:{situationId:"homework"}});
 });
 it("R06 async pending displays accessible status and disabled submit",async()=>{
  const d=deferred<unknown>();generate.mockReturnValueOnce(d.promise);
  await mount();await click("Сгенерировать");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Ожидаем");
  expect(host.querySelector<HTMLButtonElement>("button:disabled")?.textContent)
   .toContain("Генерируем");
  await act(async()=>d.resolve(response()));await tick();
  expect(host.textContent).toContain(text);
 });
 it("R07 empty result is strict error, manual retry only",async()=>{
  generate.mockResolvedValueOnce(response({excuse:""}));
  await mount();await click("Сгенерировать");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось");
  expect(host.textContent).not.toContain("PRIVATE_");
  expect(generate).toHaveBeenCalledTimes(1);
  await click("Сгенерировать");
  expect(generate).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain(text);
 });
 it("R08 provider error message never leaks; retry explicit",async()=>{
  generate.mockRejectedValueOnce(Error("SECRET_PROVIDER_KEY"));
  await mount();await click("Сгенерировать");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Попробуйте позже");
  expect(host.innerHTML).not.toContain("SECRET_PROVIDER_KEY");
  await click("Сгенерировать");
  expect(host.textContent).toContain(text);
 });
 it("R09 late old situation response discarded",async()=>{
  const d=deferred<unknown>();generate.mockReturnValueOnce(d.promise);
  await mount();await click("Сгенерировать");
  await click("Пропустил встречу");
  await act(async()=>d.resolve(response()));await tick();
  expect(host.textContent).not.toContain(text);
  expect(host.querySelector('button[aria-pressed="true"]')?.textContent)
   .toContain("Пропустил встречу");
 });
 it("R10 navigate back while response pending never paints stale result",async()=>{
  const d=deferred<unknown>();generate.mockReturnValueOnce(d.promise);
  await mount();await click("Сгенерировать");await click("Назад");
  expect(location.pathname).toBe("/");
  await act(async()=>d.resolve(response()));await tick();
  expect(host.textContent).not.toContain(text);
  expect(host.querySelector(".excuses-panel")).toBeNull();
 });
 it("R11 direct navigation/back/forward simulate reload bookmark",async()=>{
  await mount();await click("Назад");expect(location.pathname).toBe("/");
  await act(async()=>{window.history.replaceState(null,"","/otmazki");
   window.dispatchEvent(new PopStateEvent("popstate"));});await tick();
  expect(host.textContent).toContain("Генератор отмазок");
  expect(host.querySelector('.excuses-options button[aria-pressed="true"]'))
   .not.toBeNull();
  // Back visits the separate public landing; only non-mutating public GET.
  expect(network.mock.calls.length).toBeGreaterThan(0);
  expect(network.mock.calls.every(([path,init])=>
   ["/api/v1/public/courses","/api/v1/public/platform-stats"].includes(path)&&
     init?.method==="GET")).toBe(true);
  expect(generate).not.toHaveBeenCalled();
 });
 it("R12 unsupported/empty scenario cannot trigger any real API",async()=>{
  await mount();await click("Сгенерировать");
  expect(network).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Публичный синтетический режим");
 });
});
