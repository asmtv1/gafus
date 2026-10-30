// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {AuthPanel} from "../../shared/auth/AuthPanel";
import type {VkConsentWire} from "./vkConsentSource";
const ctx="syntheticcontexttoken_xxxxxxxxxxxxxxxxxxxxxxx";
const state="syntheticstatevalue_yyyyyyyyyyyyyyyyyyyyyy";
const ack=()=>({user:{id:"PRIVATE_USER",username:"student",role:"USER"},
 accessToken:"SECRET_ACCESS",refreshToken:"PRIVATE_REFRESH",needsPhone:false});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
 const promise=new Promise<T>(res=>resolve=res);return {promise,resolve};};
let host:HTMLDivElement,root:Root,client:QueryClient,wire:VkConsentWire;
let inspect:ReturnType<typeof vi.fn<VkConsentWire["inspect"]>>;
let submit:ReturnType<typeof vi.fn<VkConsentWire["submit"]>>;
let http:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,25));});
async function mount(enabled=true,transport:VkConsentWire|null=wire){
 await act(async()=>root.render(<QueryClientProvider client={client}>
  <AuthPanel showVkConsentOptIn={enabled}
    vkContextToken={ctx} vkState={state}
    vkConsentSyntheticTransport={transport??undefined}/>
 </QueryClientProvider>));
 await tick();
}
async function click(label:string){
 const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(node=>node.textContent?.trim()===label);
 expect(button,label).toBeDefined();
 await act(async()=>button?.click());await tick();
}
async function enter(){await mount();await click("Согласия VK (макет)");}
async function checked(){
 for(const checkbox of [...host.querySelectorAll<HTMLInputElement>(
  '.vk-consent-panel input[type="checkbox"]')]){
  await act(async()=>checkbox.click());await tick();
 }
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 client=new QueryClient({defaultOptions:{queries:{retry:false,
  refetchOnWindowFocus:false}}});
 client.setQueryData(CURRENT_USER_QUERY_KEY,null);
 inspect=vi.fn(async()=>({savedPromoCode:"PROMO123",completed:false,
  private:"SECRET_CONTEXT"}));
 submit=vi.fn(async()=>ack());
 wire={fixtureKind:"AG2_VK_CONSENT_SYNTHETIC_NO_REAL_AUTH",inspect,submit};
 http=vi.fn(async(url:string,options:RequestInit)=>{
  if(url!=="/api/v1/auth/me"||options.method!=="GET")
   throw Error("UNEXPECTED_REAL_HTTP");
  return new Response(JSON.stringify({success:true,data:null}),{status:200});
 });
 vi.stubGlobal("fetch",http);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 client.clear();host.remove();vi.unstubAllGlobals();
});
describe("WEB-URL-004 exact guest AuthPanel synthetic consent flow",()=>{
 it("M01 default off: no entry, no VK GET/POST",async()=>{
  await mount(false);
  expect(host.textContent).not.toContain("Согласия VK (макет)");
  expect(inspect).not.toHaveBeenCalled();expect(submit).not.toHaveBeenCalled();
 });
 it("M02 no explicit fixture: no entry",async()=>{
  await mount(true,null);
  expect(host.textContent).not.toContain("Согласия VK (макет)");
 });
 it("M03 entry inspects existing API shape; checks and links visible",async()=>{
  await enter();
  expect(inspect).toHaveBeenCalledExactlyOnceWith(ctx,state);
  expect(host.textContent).toContain("Согласия для регистрации через VK");
  expect(host.textContent).toContain("PROMO123");
  expect(host.querySelectorAll('.vk-consent-panel input[type="checkbox"]'))
   .toHaveLength(3);
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|syntheticcontexttoken|syntheticstatevalue/);
  await click("К регистрации");
  expect(host.textContent).toContain("Согласия VK (макет)");
 });
 it("M04 unchecked cannot submit",async()=>{
  await enter();
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
   .find(x=>x.textContent?.trim()==="Принять и продолжить");
  expect(button?.disabled).toBe(true);
  expect(submit).not.toHaveBeenCalled();
 });
 it("M05 exactly one consent ack; no login or credential DOM",async()=>{
  await enter();await checked();await click("Принять и продолжить");
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toEqual({
   contextToken:ctx,state,consentPayload:{
    acceptPersonalData:true,acceptPrivacyPolicy:true,
    acceptDataDistribution:true,
   },
  });
  expect(host.textContent).toContain("Web-вход не выполнялся");
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|accessToken|refreshToken/);
  expect(client.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull();
 });
 it("M06 completed context has no form and no submit",async()=>{
  inspect.mockResolvedValueOnce({savedPromoCode:null,completed:true});
  await enter();
  expect(host.textContent).toContain("уже завершён");
  expect(submit).not.toHaveBeenCalled();
 });
 it("M07 invalid context error redacted; manual GET retry",async()=>{
  inspect.mockRejectedValueOnce(Error("PRIVATE_STACK"));
  await enter();expect(host.textContent).toContain("недействительна");
  expect(host.textContent).not.toContain("PRIVATE_STACK");
  await click("Повторить проверку");
  expect(inspect).toHaveBeenCalledTimes(2);
 });
 it("M08 server 400 definite: one POST, one readback",async()=>{
  submit.mockRejectedValueOnce({status:400,code:"CONTEXT_EXPIRED"});
  await enter();await checked();await click("Принять и продолжить");
  expect(host.textContent).toContain("Сервер отклонил подтверждение");
  await click("Проверить статус вручную");
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Повторная отправка запрещена");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M09 unknown 5xx, completed context after readback not login",async()=>{
  submit.mockRejectedValueOnce(Error("SECRET_NETWORK"));
  inspect.mockResolvedValueOnce({savedPromoCode:null,completed:false})
   .mockResolvedValueOnce({savedPromoCode:null,completed:true});
  await enter();await checked();await click("Принять и продолжить");
  expect(host.textContent).toContain("Результат подтверждения неизвестен");
  await click("Проверить статус вручную");
  expect(host.textContent).toContain("Web не подтверждён");
  expect(client.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull();
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M10 late POST guest -> authenticated -> guest blocked A-B-A",async()=>{
  const d=deferred<unknown>();submit.mockReturnValueOnce(d.promise);
  await enter();await checked();await click("Принять и продолжить");
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"someone"}));
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,null));
  await act(async()=>d.resolve(ack()));await tick();
  // AuthPanel unmounts the guest-only form on login; it must not resurrect
  // a submitted form when returning to guest with a stale response.
  // Guest reentry may show a fresh form or the stricter session-change fence.
  // Neither is allowed to resurrect the former confirmation or POST.
  expect(host.textContent).not.toContain("Синтетическое подтверждение принято");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M11 late context A-B-A never shows promo",async()=>{
  const d=deferred<unknown>();inspect.mockReturnValueOnce(d.promise);
  await enter();
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"someone"}));
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,null));
  await act(async()=>d.resolve({savedPromoCode:"PRIVATE_LATE",completed:false}));
  await tick();
  // A-B-A may remount a blank guest form or stay on the session fence.
  // Protected content from the retired inspector must not be displayed.
  expect(host.textContent).not.toContain("PRIVATE_LATE");
  expect(inspect).toHaveBeenCalledTimes(1);
 });
 it("M12 invalid ACK unknown, never retries POST",async()=>{
  submit.mockResolvedValueOnce({success:true,accessToken:"PRIVATE"});
  await enter();await checked();await click("Принять и продолжить");
  expect(host.textContent).toContain("Результат подтверждения неизвестен");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M13 only AuthPanel /me real GET, no real VK send",async()=>{
  await enter();await checked();await click("Принять и продолжить");
  // The preseeded guest auth query is already fresh; no extra HTTP needed.
  expect(http.mock.calls.map(([url])=>url)).toEqual([]);
  expect(http.mock.calls.every(([,init])=>init.method==="GET")).toBe(true);
 });
});
