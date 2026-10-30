// @vitest-environment jsdom
/** WEB046 real App canonical GET: exact same-tab principal retirement. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";

const user=(id:string)=>({id,username:"viewer"+id,role:"USER"});
const reminder=(name:string)=>({id:"r_1",name,enabled:true,
 reminderTime:"09:30",reminderDays:null,timezone:"Europe/Moscow",
 privateField:"SECRET_PRIVATE_REMINDER_TOKEN"});
const response=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
 const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
let cache:QueryClient,host:HTMLDivElement,root:Root,network:ReturnType<typeof vi.fn>;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./RemindersConnectedPage"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
async function mount(initial:string|null="A"){
 cache.setQueryData(CURRENT_USER_QUERY_KEY,initial?user(initial):null);
 window.history.replaceState(null,"","/reminders");
 await act(async()=>root.render(<QueryClientProvider client={cache}><App/></QueryClientProvider>));
 await tick();
}
const noWrites=()=>{
 expect(network.mock.calls.every(([,init])=>!init?.method||init.method==="GET")).toBe(true);
 expect(network.mock.calls.map(([path])=>String(path)).join(" ")).not.toMatch(
  /create|update|delete|push|sw\.js|reminder\/operation|POST|PUT|PATCH|DELETE/);
};
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 network=vi.fn(async(path:string)=>{
  if(path==="/api/v1/reminders")return response([reminder("Напоминание владельца А")]);
  throw Error("UNEXPECTED_REQUEST_"+path);
 });
 vi.stubGlobal("fetch",network);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
 window.history.replaceState(null,"","/");
});
describe("WEB046 default registered GET /reminders owner boundary",()=>{
 it("R01 renders only validated owner schedule from registered GET, no mutation",async()=>{
  await mount();
  expect(host.textContent).toContain("Напоминание владельца А");
  // Live reminders keep the IANA timezone in the expanded editor, not
  // the collapsed summary card. Opening the editor must not issue a write.
  await act(async()=>host.querySelector<HTMLButtonElement>(
    'button[aria-label="Развернуть"]')?.click());
  expect(host.querySelector<HTMLSelectElement>(
    'form[aria-label^="Изменить напоминание"] select')?.value).toBe("Europe/Moscow");
  expect(host.textContent).toContain("без выбора — каждый день");
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_REMINDER_TOKEN/);
  expect(network.mock.calls.map(([path])=>path)).toContain("/api/v1/reminders");
  expect(host.querySelector('a[href="/profile"]')).not.toBeNull();
  noWrites();
 });
 it("R02 revokes same-tab A -> B -> A without resurrecting A data",async()=>{
  await mount();expect(host.textContent).toContain("Напоминание владельца А");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B")));await tick();
  expect(host.textContent).not.toContain("Напоминание владельца А");
  expect(host.textContent).toContain("Личные данные скрыты");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("A")));await tick();
  expect(host.textContent).not.toContain("Напоминание владельца А");
  noWrites();
 });
 it("R03 ignores delayed A GET after session switches to B",async()=>{
  const late=deferred<Response>();
  network.mockImplementation(async(path:string)=>{
   if(path==="/api/v1/reminders")return late.promise;
   throw Error("UNEXPECTED_REQUEST_"+path);
  });
  await mount();
  expect(host.textContent).toContain("Загрузка напоминаний…");
  expect(network.mock.calls.map(([path])=>path)).toContain("/api/v1/reminders");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B")));await tick();
  await act(async()=>late.resolve(response([reminder("SECRET_OLD_OWNER_SCHEDULE")])));await tick();
  expect(host.textContent).not.toContain("SECRET_OLD_OWNER_SCHEDULE");
  expect(host.querySelectorAll(".reminder-list > li")).toHaveLength(0);
  noWrites();
 });
 it("R04 shows guest login gate and performs no reminder GET",async()=>{
  await mount(null);
  expect(host.textContent).toContain("Начать заниматься");
  expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  expect(network.mock.calls.some(([path])=>path==="/api/v1/reminders")).toBe(false);
  noWrites();
 });
});
