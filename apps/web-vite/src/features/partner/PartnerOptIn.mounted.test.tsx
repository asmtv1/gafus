// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "../profile/ProfileOverview";
import type {PartnerSourceWire} from "./partnerReadApi";
const dto=(more:Record<string,unknown>={})=>({
 referralCode:"PARTNER_2026",referrals:3,earnedKopecks:152500,
 reservedKopecks:50000,availableKopecks:102500,active:true,
 private:"SECRET_PARTNER_BANK",...more,
});
const deferred=<T,>()=>{let resolve!:(data:T)=>void;
 const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
let host:HTMLDivElement,root:Root,client:QueryClient,wire:PartnerSourceWire;
let read:ReturnType<typeof vi.fn<PartnerSourceWire["get"]>>;
let network:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(ok=>setTimeout(ok,25));});
async function mount(enabled=true,transport:PartnerSourceWire|null=wire,owner="owner"){
 await act(async()=>root.render(<QueryClientProvider client={client}>
  <ProfileOverview userId={owner} showPartnerOptIn={enabled}
   partnerSyntheticTransport={transport??undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const el=[...host.querySelectorAll<HTMLButtonElement>("button")]
   .find(node=>node.textContent?.trim()===label);
 expect(el,label).toBeDefined();
 await act(async()=>el?.click());await tick();
}
async function enter(){await mount();await click("Партнёрский кабинет (макет)");}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 client=new QueryClient({defaultOptions:{queries:{retry:false,
  refetchOnWindowFocus:false}}});
 client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"partner",role:"PARTNER"});
 read=vi.fn(async()=>dto());
 wire={fixtureKind:"AG2_PARTNER_READONLY_SYNTHETIC",get:read};
 network=vi.fn(async(url:string,init:RequestInit)=>{
  if(url!=="/api/v1/user/profile"||init.method!=="GET")
   throw Error("UNEXPECTED_REAL_CALL");
  return new Response(JSON.stringify({success:true,data:{
   id:"owner",username:"partner",
   profile:{fullName:"Партнёр",city:"Самара",about:"Кинолог"},
   email:"SECRET_EMAIL",
  }}),{status:200});
 });
 vi.stubGlobal("fetch",network);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 client.clear();host.remove();vi.unstubAllGlobals();
});
describe("WEB-URL-028 PARTNER-only read dashboard actual owner Profile entry",()=>{
 it("M01 default off no entry/no partner query",async()=>{
  await mount(false);
  expect(host.textContent).not.toContain("Партнёрский кабинет (макет)");
  expect(read).not.toHaveBeenCalled();
 });
 it("M02 synthetic fixture required",async()=>{
  await mount(true,null);
  expect(host.textContent).not.toContain("Партнёрский кабинет (макет)");
 });
 it("M03 after opt-in financial display, private bank never DOM",async()=>{
  await enter();
  expect(read).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Приглашено учеников");
  expect(host.textContent).toContain("Доступно к выплате");
  expect(host.querySelector<HTMLInputElement>("#partner-readonly-link")?.value)
   .toContain("/register?promoCode=PARTNER_2026");
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|bankAccount/);
  expect(host.textContent).toContain("Заявка на выплату недоступна");
  expect([...host.querySelectorAll("button")].some(x=>x.textContent?.includes("Запросить выплату")))
   .toBe(false);
  await click("Мой профиль");
  expect(host.textContent).not.toContain("Доступно к выплате");
 });
 it("M04 disabled partner is read-only status",async()=>{
  read.mockResolvedValueOnce(dto({active:false}));
  await enter();expect(host.textContent).toContain("неактивна");
 });
 it("M05 malformed amount denied; no private data",async()=>{
  read.mockResolvedValueOnce(dto({availableKopecks:999}));
  await enter();
  expect(host.textContent).toContain("Кабинет партнёра недоступен");
  expect(host.textContent).not.toContain("SECRET_PARTNER_BANK");
 });
 it("M06 403 unauthorized without replay",async()=>{
  read.mockRejectedValueOnce({status:403,error:"SECRET_DB"});
  await enter();
  expect(host.textContent).toContain("нет партнёрских прав");
  expect(host.textContent).not.toContain("SECRET_DB");
  expect(read).toHaveBeenCalledTimes(1);
 });
 it("M07 error manual retry explicit",async()=>{
  read.mockRejectedValueOnce(Error("SECRET_NETWORK"));
  await enter();
  // The owner profile also mounts Moments, whose own failure has a button
  // with the same visible label. Click the partner dashboard's button only.
  const partner=host.querySelector<HTMLElement>(
    'section[aria-label="Партнёрская программа (макет)"]');
  const retry=[...(partner?.querySelectorAll<HTMLButtonElement>("button")??[])]
    .find(button=>button.textContent?.trim()==="Повторить проверку");
  expect(retry).toBeDefined();
  await act(async()=>retry?.click());await tick();
  expect(read).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Партнёрская программа");
 });
 it("M08 PARTNER role required, even if source would return balance",async()=>{
  client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"USER"});
  await mount();
  expect(host.textContent).not.toContain("Партнёрский кабинет (макет)");
  expect(read).not.toHaveBeenCalled();
 });
 it("M09 foreign owner cannot access",async()=>{
  await mount(true,wire,"someone_else");
  expect(host.textContent).not.toContain("PARTNER_2026");
  expect(read).not.toHaveBeenCalled();
 });
 it("M10 owner A->B->A pending response never displayed",async()=>{
  const d=deferred<unknown>();read.mockReturnValueOnce(d.promise);
  await enter();
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other",role:"PARTNER"}));
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"PARTNER"}));
  await act(async()=>d.resolve(dto()));await tick();
  expect(host.textContent).toContain("Сессия изменилась");
  expect(host.textContent).not.toContain("Доступно к выплате");
 });
 it("M11 role upgrade after mount never enables old instance",async()=>{
  client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"USER"});
  await mount();
  await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",role:"PARTNER"}));
  expect(host.textContent).not.toContain("Партнёрский кабинет (макет)");
  expect(read).not.toHaveBeenCalled();
 });
 it("M12 no partner GET or payout POST, only existing Profile GET",async()=>{
  await enter();
  expect(network.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/user/profile", "/api/v1/feed/status",
    ]);
  expect(network.mock.calls.every(([,init])=>init.method==="GET")).toBe(true);
 });
});
