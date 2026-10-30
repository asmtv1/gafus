// @vitest-environment jsdom
/** G05 actual S1 React handler regression: NOT a synthetic standalone adapter.
 * Injected submitSynthetic is the ONLY transport. No real HTTP or mounted route.
 */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {PetCreateS1Form} from "./PetCreateS1Form";
import type {PetCreateIntentS1,PetCreateJsonProposalS1} from "./petCreateIntentS1";
import type {PetReply} from "./petCreateS1";

type Submit=(dto:PetCreateJsonProposalS1,intent:PetCreateIntentS1)=>Promise<PetReply>;
const ack=(actor="A",data:Record<string,unknown>={})=>({
  status:201,body:{success:true,data:{
    id:"pet_1",ownerId:actor,name:"Тоби",type:"DOG",...data,
  }},
} satisfies PetReply);
const conflict=(code:string)=>({status:409,body:{
  success:false,code,error:"PRIVATE_POSTGRES_DETAILS",
}} satisfies PetReply);
function delayed(){
  let resolve!: (value:PetReply)=>void;
  const promise=new Promise<PetReply>(yes=>{resolve=yes;});
  return {promise,resolve};
}
let root:Root,host:HTMLDivElement,cache:QueryClient;
let send:ReturnType<typeof vi.fn<Submit>>;
let cancel:ReturnType<typeof vi.fn<()=>void>>;
const manual=()=>host.querySelector<HTMLButtonElement>("[data-testid='g05-manual-retry']");
async function render(){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <PetCreateS1Form actorId="A" submitSynthetic={send}
      onCancelIntent={cancel}/>
  </QueryClientProvider>));
}
async function edit(name:string,value:string){
  const el=host.querySelector<HTMLInputElement>("#g05-"+name);
  if(!el)throw Error("missing form input");
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(el,value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function fill(){
  await edit("name","Тоби");await edit("breed","Лабрадор");
  await edit("birthDate","15.03.2020");
}
async function submit(){
  await act(async()=>host.querySelector<HTMLFormElement>("form")?.dispatchEvent(
    new Event("submit",{bubbles:true,cancelable:true})));
}
async function switchPrincipal(id:string|null){
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    id?{id,username:"user_"+id,role:"USER"}:null));
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NETWORK_FORBIDDEN");}));
  send=vi.fn<Submit>().mockResolvedValue(ack());
  cancel=vi.fn<()=>void>();
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"A",role:"USER"});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
});

describe("G05 actual mounted S1 submit handler parity with Web real-consumer adapter",()=>{
  it("uses existing shared olive submit and red cancel on /profile/addPet",async()=>{
    await render();
    const submitButton=host.querySelector<HTMLButtonElement>('button[type="submit"]');
    const cancelButton=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Отмена");
    expect(submitButton?.textContent?.trim()).toBe("Добавить питомца");
    expect(submitButton?.dataset.gafusSharedButton).toBe("primary");
    expect(submitButton?.type).toBe("submit");
    expect(cancelButton?.dataset.gafusSharedButton).toBe("secondary");
    expect(cancelButton?.dataset.gafusVariant).toBe("red");
    expect(cancelButton?.type).toBe("button");
    await act(async()=>cancelButton?.click());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["PET_CREATE_REQUEST_CONFLICT","PET_CREATE_RESULT_UNAVAILABLE"])(
    "H01/H02 initial 409 %s terminal, sanitized, no retry",async code=>{
      send.mockResolvedValueOnce(conflict(code));
      await render();await fill();await submit();
      expect(send).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain("конфликт");
      expect(host.textContent).not.toContain("PRIVATE_POSTGRES_DETAILS");
      expect(host.textContent).not.toContain("Питомец создан");
      expect(host.querySelector("form")).toBeNull();
      expect(manual()).toBeNull();
      expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    },
  );
  it("H03 unknown503 then manual409 closes original UUID and disables 3rd POST",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"PRIVATE"}})
      .mockResolvedValueOnce(conflict("PET_CREATE_RESULT_UNAVAILABLE"));
    await render();await fill();await submit();
    const [first,identity]=send.mock.calls[0]!;
    expect(manual()).not.toBeNull();
    await act(async()=>manual()?.click());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual(first);
    expect(send.mock.calls[1]![1].requestId).toBe(identity.requestId);
    expect(manual()).toBeNull();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.textContent).not.toContain("PRIVATE_POSTGRES_DETAILS");
  });
  it.each([
    ["malformed", {status:201,body:{success:false}}],
    ["owner",ack("B")],
    ["name",ack("A",{name:"wrong"})],
    ["type",ack("A",{type:"CAT"})],
    ["id",ack("A",{id:"unsafe/id"})],
  ] as const)("H04 invalid 201 %s never confirms and preserves original key",async (_name,reply)=>{
    send.mockResolvedValueOnce(reply).mockResolvedValueOnce(ack());
    await render();await fill();await submit();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.textContent).toContain("Проверьте результат");
    expect(send).toHaveBeenCalledTimes(1);
    expect(manual()).not.toBeNull();
    const first=send.mock.calls[0]![0];
    await act(async()=>manual()?.click());
    expect(send.mock.calls[1]![0]).toEqual(first);
    expect(host.textContent).toContain("Питомец создан");
  });
  it("H05 delayed 201 A-B-A cannot confirm and must not offer unusable retry",async()=>{
    const pending=delayed();send.mockReturnValueOnce(pending.promise);
    await render();await fill();await submit();
    await switchPrincipal("B");await switchPrincipal("A");
    await act(async()=>pending.resolve(ack()));
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(manual()).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
  });
  it("H06 logout-relogin after 503 retains no valid manual replay",async()=>{
    send.mockResolvedValueOnce({status:503,body:{}});
    await render();await fill();await submit();
    const first=send.mock.calls[0]![0];
    await switchPrincipal(null);await switchPrincipal("A");
    await act(async()=>manual()?.click());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual(first);
    expect(host.textContent).not.toContain("Питомец создан");
  });
  it("H07 late invalid 201 after authEpoch switch never publishes petId",async()=>{
    const pending=delayed();send.mockReturnValueOnce(pending.promise);
    await render();await fill();await submit();
    await switchPrincipal("A");
    await act(async()=>pending.resolve(ack("B")));
    expect(host.querySelector("[data-testid='mock-created-pet-id']")).toBeNull();
    expect(manual()).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
