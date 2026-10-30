// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "./ProfileOverview";
import type {SyntheticAccountDeletion} from "./accountDeleteReview";
const hold=<T,>()=>{let resolve!:(v:T)=>void;
 const promise=new Promise<T>(ok=>resolve=ok);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:SyntheticAccountDeletion;
let eligibility:ReturnType<typeof vi.fn<SyntheticAccountDeletion["eligibility"]>>;
let request:ReturnType<typeof vi.fn<SyntheticAccountDeletion["requestCode"]>>;
let submit:ReturnType<typeof vi.fn<SyntheticAccountDeletion["submit"]>>;
let readback:ReturnType<typeof vi.fn<SyntheticAccountDeletion["readback"]>>;
let fetcher:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,24));});
async function mount(enabled=true,fixture:SyntheticAccountDeletion|null=wire,owner="owner"){
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <ProfileOverview userId={owner} showDeleteAccountOptIn={enabled}
   deleteAccountSyntheticTransport={fixture??undefined}/>
 </QueryClientProvider>));await tick();
}
const button=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>("button")]
 .find(b=>b.textContent?.trim()===label);
async function click(label:string){
 expect(button(label),label).toBeDefined();
 await act(async()=>button(label)?.click());await tick();
}
async function input(selector:string,value:string){
 const node=host.querySelector<HTMLInputElement>(selector);
 expect(node).not.toBeNull();
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(node,value);
  node?.dispatchEvent(new Event("input",{bubbles:true}));
 });await tick();
}
async function enter(){await mount();await click("Удаление аккаунта (макет)");}
async function code(){await enter();await click("Отправить код на email (mock)");}
async function review(){
 await code();await input("#g04-code","012345");
 await click("Продолжить");
}
async function consent(){
 await input("#g04-confirm-username","student");
 await act(async()=>host.querySelector<HTMLInputElement>(
  '[data-testid="g04-confirm-check"]')?.click());await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"student",role:"USER"});
 eligibility=vi.fn(async()=>({emailReady:true,email:"PRIVATE_EMAIL"}));
 request=vi.fn(async()=>({success:true,secret:"SECRET_TOKEN"}));
 submit=vi.fn(async()=>({success:true,userId:"PRIVATE_ID"}));
 readback=vi.fn(async()=>({active:true,userId:"PRIVATE_ID"}));
 wire={fixtureKind:"AG2_ACCOUNT_DELETE_REVIEW_SYNTHETIC_NEVER_REAL",
  eligibility,requestCode:request,submit,readback};
 fetcher=vi.fn(async(url:string,opts:RequestInit)=>{
  if(url!=="/api/v1/user/profile"||opts.method!=="GET")
   throw Error("REAL_MUTATION_FORBIDDEN");
  return new Response(JSON.stringify({success:true,data:{
   id:"owner",username:"student",profile:{
    fullName:"Студент",city:"Самара",about:"Питомец"},
   email:"PRIVATE_MAIL",token:"SECRET_COOKIE",
  }}),{status:200});
 });
 vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{await act(async()=>root.unmount());
 cache.clear();host.remove();vi.unstubAllGlobals();});
describe("WEB-URL-038 reuses SINGLE canonical G04 account deletion form",()=>{
 it("M01 default off does not mount canonical form",async()=>{
  await mount(false);
  expect(host.textContent).not.toContain("Удаление аккаунта (макет)");
  expect(eligibility).not.toHaveBeenCalled();
 });
 it("M02 untrusted/missing fixture rejected",async()=>{
  await mount(true,null);
  expect(host.textContent).not.toContain("Удаление аккаунта (макет)");
 });
 it("M03 exact G04 only; owner eligibility private fields stripped",async()=>{
  await enter();
  expect(eligibility).toHaveBeenCalledExactlyOnceWith({ownerId:"owner"});
  expect(host.textContent).toContain("Необратимое действие");
  expect(host.querySelector("#g04-title")).not.toBeNull();
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_/);
  expect(host.querySelector("#delete-review-code")).toBeNull();
  expect(host.querySelector("#delete-review-name")).toBeNull();
  await click("В профиль");
  expect(host.querySelector("#g04-title")).toBeNull();
 });
 it("M04 no email does not permit G04 request",async()=>{
  eligibility.mockResolvedValueOnce({emailReady:false});
  await enter();
  expect(host.textContent).toContain("сначала укажите email");
  expect(request).not.toHaveBeenCalled();
 });
 it("M05 only exact Hono-shaped synthetic request-code POST",async()=>{
  await code();
  expect(request).toHaveBeenCalledExactlyOnceWith({
   ownerId:"owner",method:"POST",path:"/api/v1/user/account/deletion-code"});
  expect(host.querySelector("#g04-code")).not.toBeNull();
  expect(submit).not.toHaveBeenCalled();
 });
 it("M06 username, code, checkbox and G04 review are mandatory",async()=>{
  await review();
  expect(button("Удалить навсегда (только mock)")?.disabled).toBe(true);
  await act(async()=>host.querySelector<HTMLInputElement>(
   '[data-testid="g04-confirm-check"]')?.click());
  await tick();
  expect(button("Удалить навсегда (только mock)")?.disabled).toBe(true);
  await input("#g04-confirm-username","student");
  expect(button("Удалить навсегда (только mock)")?.disabled).toBe(false);
  await click("Удалить навсегда (только mock)");
  expect(submit).toHaveBeenCalledExactlyOnceWith({
   ownerId:"owner",method:"POST",path:"/api/v1/user/account/delete",
   json:{code:"012345"}});
  expect(host.textContent).toContain("Синтетическая проверка завершена");
  expect(host.textContent).not.toContain("Аккаунт удалён");
  expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"owner"});
 });
 it("M07 POST timeout request unknown, no automatic second request",async()=>{
  request.mockRejectedValueOnce(Error("SECRET_MAIL_TIMEOUT"));
  await code();
  expect(host.textContent).toContain("Результат запроса не подтверждён");
  await click("Проверить состояние вручную");
  expect(readback).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
 });
 it("M08 definite 403 code rejected with bounded error",async()=>{
  request.mockRejectedValueOnce({status:403});
  await code();expect(host.textContent).toContain("Недостаточно прав");
  expect(host.textContent).not.toContain("SECRET");
 });
 it("M09 unknown delete result manual status does not prove intact",async()=>{
  submit.mockRejectedValueOnce(Error("SECRET_DELETE_TIMEOUT"));
  await review();await consent();await click("Удалить навсегда (только mock)");
  expect(host.textContent).toContain("Результат запроса не подтверждён");
  await click("Проверить состояние вручную");
  expect(host.textContent).toContain("не доказывает");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M10 unauthenticated synthetic GET never proves deletion",async()=>{
  submit.mockRejectedValueOnce(Error("timeout"));
  readback.mockResolvedValueOnce({active:false});
  await review();await consent();await click("Удалить навсегда (только mock)");
  await click("Проверить состояние вручную");
  expect(host.textContent).toContain("НЕ подтверждает удаление");
 });
 it("M11 invalid 200 ACK enters G04 unknown state",async()=>{
  submit.mockResolvedValueOnce({success:false});
  await review();await consent();await click("Удалить навсегда (только mock)");
  expect(host.textContent).toContain("Проверьте результат");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M12 failed manual readback never repeats POST",async()=>{
  submit.mockRejectedValueOnce(Error("timeout"));
  readback.mockRejectedValueOnce(Error("SECRET_READBACK"));
  await review();await consent();await click("Удалить навсегда (только mock)");
  await click("Проверить состояние вручную");
  expect(host.textContent).toContain("Проверка состояния не удалась");
  expect(host.textContent).not.toContain("SECRET_READBACK");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("M13 A-B-A on pending canonical G04 POST fences old ACK",async()=>{
  const deferred=hold<unknown>();submit.mockReturnValueOnce(deferred.promise);
  await review();await consent();await click("Удалить навсегда (только mock)");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other",role:"USER"}));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"USER"}));
  await act(async()=>deferred.resolve({success:true}));await tick();
  expect(host.textContent).toContain("Сессия изменилась");
  expect(host.textContent).not.toContain("Синтетическая проверка завершена");
 });
 it("M14 ADMIN not eligible for G04 self delete",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"ADMIN"});
  await mount();
  expect(host.textContent).not.toContain("Удаление аккаунта (макет)");
 });
 it("M15 foreign owner rejected",async()=>{
  await mount(true,wire,"other");
  expect(host.textContent).not.toContain("Удаление аккаунта (макет)");
 });
 it("M16 absolutely zero actual /account/delete POST",async()=>{
  await review();await consent();await click("Удалить навсегда (только mock)");
  expect(fetcher.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/user/profile", "/api/v1/feed/status",
    ]);
  expect(fetcher.mock.calls.every(([,opts])=>opts.method==="GET")).toBe(true);
 });
});
