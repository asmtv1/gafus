// @vitest-environment jsdom
/** WEB021 real App default owner route: same-tab principal retirement only. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
const user=(id:string)=>({id,username:"viewer"+id,role:"USER"});
const hiddenPage=(name="Анна",id="a1")=>({items:[{id,username:id==="a1"?"anna":"bella",
 name,avatarUrl:"SECRET_PRIVATE_AVATAR",contact:"SECRET_EMAIL"}],
 nextCursor:null,serverNow:"2026-10-22T12:00:00.000Z",internal:"SECRET_PAGE"});
const response=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
 const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
let cache:QueryClient,host:HTMLDivElement,root:Root,network:ReturnType<typeof vi.fn>;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./HiddenAuthorsOptIn"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
async function mount(initial:string|null="A"){
 cache.setQueryData(CURRENT_USER_QUERY_KEY,initial?user(initial):null);
 window.history.replaceState(null,"","/feed/hidden-authors");
 await act(async()=>root.render(<QueryClientProvider client={cache}><App/></QueryClientProvider>));
 await tick();
}
const readsOnly=()=>{
 expect(network.mock.calls.every(([,init])=>!init?.method||init.method==="GET")).toBe(true);
 expect(network.mock.calls.map(([url])=>String(url)).join(" ")).not.toMatch(
  /preferences|follow|unhide|POST|PATCH|DELETE|PUT/);
};
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 network=vi.fn(async(path:string)=>{
  if(path==="/api/v1/feed/status")return response({enabled:true});
  if(path.startsWith("/api/v1/feed/me/hidden-authors?pageSize=20"))return response(hiddenPage());
  throw Error("UNEXPECTED_REQUEST_"+path);
 });
 vi.stubGlobal("fetch",network);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
 window.history.replaceState(null,"","/");
});
describe("WEB021 real App Hono default route principal boundary",()=>{
 it("H01 reads registered GET without write, exposes only public link",async()=>{
  await mount();
  expect(host.textContent).toContain("Анна");
  expect(host.querySelector('a[href="/profile?username=anna"]')).not.toBeNull();
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|preferences/);
  expect(host.textContent).toContain("Показывать в «Моментах»");
  expect(network.mock.calls.map(([url])=>url)).toContain(
   "/api/v1/feed/me/hidden-authors?pageSize=20");readsOnly();
 });
 it("H02 same React session A -> B -> A permanently retires A private rows",async()=>{
  await mount();expect(host.textContent).toContain("Анна");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B")));await tick();
  expect(host.textContent).not.toContain("Анна");
  expect(host.textContent).toContain("Личные данные скрыты");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("A")));await tick();
  expect(host.textContent).not.toContain("Анна");readsOnly();
 });
 it("H03 late A reply after principal switch cannot reveal hidden list",async()=>{
  const late=deferred<Response>();
  network.mockImplementation(async(path:string)=>{
   if(path==="/api/v1/feed/status")return response({enabled:true});
   if(path.startsWith("/api/v1/feed/me/hidden-authors?pageSize=20"))
     return late.promise;
   throw Error("UNEXPECTED_REQUEST_"+path);
  });
  await mount();
  expect(host.textContent).toContain("Загружаем скрытых авторов");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B")));await tick();
  await act(async()=>late.resolve(response(hiddenPage("SECRET_OLD_OWNER"))));await tick();
  expect(host.textContent).not.toContain("SECRET_OLD_OWNER");
  expect(host.querySelectorAll(".hidden-authors-grid > li")).toHaveLength(0);
  readsOnly();
 });
 it("H04 guest gets login requirement and no owner GET",async()=>{
  await mount(null);
  expect(window.location.pathname).toBe("/");
  expect(host.textContent).toContain("Уверенность");
  expect(host.textContent).not.toContain("Анна");
  expect(network.mock.calls.some(([url])=>String(url).includes("hidden-authors"))).toBe(false);
  readsOnly();
 });
});
