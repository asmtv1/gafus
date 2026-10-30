// @vitest-environment jsdom
/** W1 G04 real React opt-in harness + injected Hono-shaped SOURCE MOCK.
 * NO fetch/HTTP, no route registration, no real account removal.
 */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {G04OptInHarness} from "./G04OptInHarness";
import {createG04SourceMockConsumer,type G04FixtureWire} from "./g04SourceMockConsumer";
const ack={status:200,body:{success:true}} as const;
const reply=(status:number,body:unknown={success:false,error:"SECRET_DB"}):{
  status:number;body:unknown;
}=>({status,body});
type FixtureReply=Awaited<ReturnType<G04FixtureWire>>;
const deferred=()=>{
  let resolve!:(result:FixtureReply)=>void;
  const promise=new Promise<FixtureReply>(yes=>{resolve=yes;});
  return {resolve,promise};
};
const actor=(id:string)=>({id,username:"actor_"+id,role:"USER" as const});
let root:Root,host:HTMLDivElement,cache:QueryClient;
let send:ReturnType<typeof vi.fn<G04FixtureWire>>;
async function mount(enabled=true,hasVerifiedEmail=true,id="A"){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <G04OptInHarness enabled={enabled} hasVerifiedEmail={hasVerifiedEmail}
      actorId={id} fixture={send}/>
  </QueryClientProvider>));
}
async function updateUser(id:string|null){
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    id?actor(id):null));
}
const btn=(id:string)=>host.querySelector<HTMLButtonElement>(
  '[data-testid="'+id+'"]');
const click=async(id:string)=>{await act(async()=>btn(id)?.click());};
async function code(value:string){
  const input=host.querySelector<HTMLInputElement>("#g04-code");
  if(!input)throw Error("NO_CODE_INPUT");
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function submitCode(){
  await act(async()=>host.querySelector<HTMLFormElement>("form")?.dispatchEvent(
    new Event("submit",{bubbles:true,cancelable:true})));
}
const check=async()=>{
  await act(async()=>host.querySelector<HTMLInputElement>(
    '[data-testid="g04-confirm-check"]')?.click());
};
async function toCode(){
  await mount();await click("g04-request-code");
  expect(host.querySelector("#g04-code")).not.toBeNull();
}
async function toReview(){
  await toCode();await code("123456");await submitCode();
  expect(btn("g04-confirm-delete")).not.toBeNull();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("REAL_NETWORK_FORBIDDEN");}));
  send=vi.fn<G04FixtureWire>().mockResolvedValue(ack);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A"));
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/profile");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("G04 W1 rendered opt-in harness: NON-DESTRUCTIVE source/mock",()=>{
  it("G04-M01 opt-in disabled never mounts form or invokes fixture",async()=>{
    await mount(false);
    expect(host.textContent).toContain("недоступно");
    expect(btn("g04-request-code")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("G04-M02 guest cannot request code and actual actor B never borrows A",async()=>{
    await updateUser(null);await mount();
    expect(host.textContent).toContain("Требуется авторизация");
    expect(send).not.toHaveBeenCalled();
    await updateUser("B");
    expect(btn("g04-request-code")).toBeNull();
  });
  it("G04-M03 missing email links to existing change-email/profile",async()=>{
    await mount(true,false);
    expect(host.querySelector('a[href="/profile/change-email"]')).not.toBeNull();
    expect(host.querySelector('a[href="/profile"]')).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("G04-M04 only existing two static Hono POST shapes; no GET/DELETE/fetch",async()=>{
    await toReview();await check();await click("g04-confirm-delete");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toEqual({
      operation:"requestCode",method:"POST",
      path:"/api/v1/user/account/deletion-code",ownerId:"A",json:{},
    });
    expect(send.mock.calls[1]![0]).toEqual({
      operation:"deleteAccount",method:"POST",
      path:"/api/v1/user/account/delete",ownerId:"A",json:{code:"123456"},
    });
    expect(host.textContent).toContain("Синтетическая проверка завершена");
    expect(host.textContent).not.toContain("Аккаунт удалён");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"A"});
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(host.querySelector('a[href="/profile"]')).not.toBeNull();
  });
  it("G04-M05 no 6 digits => zero irreversible mutation + focus",async()=>{
    await toCode();await code("12345");await submitCode();
    expect(send).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(host.querySelector("#g04-code"));
    expect(host.textContent).toContain("шесть цифр");
    expect(btn("g04-confirm-delete")).toBeNull();
  });
  it("G04-M06 review checkbox required; back restores code without implicit POST",async()=>{
    await toReview();
    expect(btn("g04-confirm-delete")?.disabled).toBe(true);
    await click("g04-confirm-delete");expect(send).toHaveBeenCalledTimes(1);
    await act(async()=>host.querySelector<HTMLButtonElement>(".button-secondary")?.click());
    expect(host.querySelector<HTMLInputElement>("#g04-code")?.value).toBe("123456");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G04-M07 double-click destructive mock is single-flight",async()=>{
    const hold=deferred();
    send.mockResolvedValueOnce(ack).mockReturnValueOnce(hold.promise);
    await toReview();await check();
    await act(async()=>{btn("g04-confirm-delete")?.click();btn("g04-confirm-delete")?.click();});
    expect(send).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Проверяем подтверждение");
    await act(async()=>hold.resolve(ack));
    expect(host.textContent).toContain("Синтетическая проверка завершена");
  });
  it("G04-M08 unknown after possibly committed synthetic delete is terminal",async()=>{
    send.mockResolvedValueOnce(ack).mockRejectedValueOnce(Error("SECRET_ACCOUNT_DELETED"));
    await toReview();await check();await click("g04-confirm-delete");
    expect(host.textContent).toContain("Результат запроса не подтверждён");
    expect(host.textContent).not.toContain("SECRET_ACCOUNT_DELETED");
    expect(host.querySelector("form")).toBeNull();
    expect(btn("g04-confirm-delete")).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("G04-M09 409 safe rejection keeps review but never auto-resends",async()=>{
    send.mockResolvedValueOnce(ack).mockResolvedValueOnce(reply(409));
    await toReview();await check();await click("g04-confirm-delete");
    expect(host.textContent).toContain("Конфликт");
    expect(host.textContent).not.toContain("SECRET_DB");
    expect(send).toHaveBeenCalledTimes(2);
    expect(btn("g04-confirm-delete")).not.toBeNull();
  });
  it("G04-M10 POST500 uncertain ACK prevents a third mutation",async()=>{
    send.mockResolvedValueOnce(ack).mockResolvedValueOnce(reply(500));
    await toReview();await check();await click("g04-confirm-delete");
    expect(host.textContent).toContain("Проверьте результат");
    expect(send).toHaveBeenCalledTimes(2);
    expect(btn("g04-confirm-delete")).toBeNull();
  });
  it("G04-M11 after code issue A->B->A old code/review never actionable",async()=>{
    await toReview();await updateUser("B");await updateUser("A");
    expect(btn("g04-confirm-delete")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G04-M12 A->B->A during request ACK never unlocks code",async()=>{
    const hold=deferred();send.mockReturnValueOnce(hold.promise);
    await mount();await click("g04-request-code");
    await updateUser("B");await updateUser("A");
    await act(async()=>hold.resolve(ack));
    expect(host.querySelector("#g04-code")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G04-M13 late success after unmount cannot navigate or clear new owner",async()=>{
    const hold=deferred();send.mockReturnValueOnce(hold.promise);
    await mount();await click("g04-request-code");
    await act(async()=>root.render(<p>Новый экран B</p>));
    await updateUser("B");
    await act(async()=>hold.resolve(ack));
    expect(host.textContent).toBe("Новый экран B");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"B"});
    expect(window.location.pathname).toBe("/profile");
  });
  it("G04-M14 401,403,400 use bounded safe errors; 429 no auto resend",async()=>{
    for(const status of [400,401,403,429]){
      const result=await createG04SourceMockConsumer(async()=>reply(status))
        .requestCode("A");
      expect(result.kind).toBe("rejected");
      expect(result.message).not.toContain("SECRET_DB");
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
