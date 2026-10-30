// @vitest-environment jsdom
/**
 * AG2 NEW G05 mounted S1 -> ordinary apiRequest(cookie fetch) -> HTTP response
 * tests. The only network function is strictly vi.stubGlobal("fetch").
 * NOT the standalone runner adapter, NOT a real localhost/production request.
 */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {PetCreateS1Form} from "./PetCreateS1Form";
import {
  submitPetCreateS1ViaCookieApi,refreshPetCreateS1SameOwner,
} from "./petCreateS1HttpSubmit";

type FetchArgs=[RequestInfo|URL,RequestInit|undefined];
const actor=(id:string)=>({id,username:"actor_"+id,role:"USER" as const});
const pet=(ownerId="A")=>({id:"pet_created_1",ownerId,
  name:"Тоби",type:"DOG"});
function response(status:number,data:Record<string,unknown>={}):Response{
  return new Response(JSON.stringify({
    success:status>=200&&status<300,
    ...(status>=200&&status<300?{data}:{code:"SYNTHETIC_ERROR",error:"SECRET_DB"}),
    ...data,
  }),{status,headers:{"content-type":"application/json"}});
}
function pending<T>(){
  let resolve!: (value:T)=>void;
  let reject!: (error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
let cache:QueryClient,host:HTMLDivElement,root:Root;
let fetchMock:ReturnType<typeof vi.fn<(...args:FetchArgs)=>Promise<Response>>>;
let onCancel:ReturnType<typeof vi.fn<()=>void>>;
const manual=()=>host.querySelector<HTMLButtonElement>("[data-testid='g05-manual-retry']");
const refresh=()=>host.querySelector<HTMLButtonElement>("[data-testid='g05-refresh-session']");
const paths=()=>fetchMock.mock.calls.map(([path])=>String(path));
async function render(){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <PetCreateS1Form actorId="A"
      submitSynthetic={json=>submitPetCreateS1ViaCookieApi(json)}
      refreshForManualRetry={refreshPetCreateS1SameOwner}
      onCancelIntent={onCancel}/>
  </QueryClientProvider>));
}
async function edit(name:string,value:string){
  const el=host.querySelector<HTMLInputElement>("#g05-"+name);
  if(!el)throw Error("MISSING_INPUT");
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));
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
async function click(element:HTMLButtonElement|null){
  await act(async()=>element?.click());
}
async function authChange(id:string|null){
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,id?actor(id):null));
}
const postCalls=()=>fetchMock.mock.calls.filter(([p])=>String(p)==="/api/v1/pets");
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  fetchMock=vi.fn<(...args:FetchArgs)=>Promise<Response>>();
  vi.stubGlobal("fetch",fetchMock);
  onCancel=vi.fn<()=>void>();
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A"));
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("G05 independent mounted S1 + ordinary cookie transport",()=>{
  it("M01 confirms ONLY HTTP201; cookie, no bearer/header/key duplicate",async()=>{
    fetchMock.mockResolvedValue(response(201,{data:pet()}));
    await render();await fill();await submit();
    expect(host.textContent).toContain("Питомец создан");
    expect(paths()).toEqual(["/api/v1/pets"]);
    const [,options]=postCalls()[0]!;
    expect(options?.credentials).toBe("include");
    expect(options?.headers).toMatchObject({"Content-Type":"application/json",
      "X-Gafus-Auth-Transport":"cookie"});
    expect(JSON.stringify(options)).not.toContain("Authorization");
    expect(JSON.stringify(options)).not.toContain("Idempotency-Key");
    expect(JSON.parse(String(options?.body))).toMatchObject({
      name:"Тоби",birthDate:"2020-03-15",
      clientRequestId:expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4/),
    });
  });
  it("M02 401 -> explicit refresh -> verified /me -> explicit SAME UUID POST",async()=>{
    fetchMock.mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200,{data:actor("A")}))
      .mockResolvedValueOnce(response(201,{data:pet()}));
    await render();await fill();await submit();
    expect(paths()).toEqual(["/api/v1/pets"]);
    expect(refresh()).not.toBeNull();
    expect(manual()).toBeNull();
    const firstBody=String(postCalls()[0]![1]?.body);
    await click(refresh());
    expect(paths()).toEqual(["/api/v1/pets","/api/v1/auth/refresh","/api/v1/auth/me"]);
    expect(manual()).not.toBeNull();
    expect(postCalls()).toHaveLength(1);
    await click(manual());
    expect(postCalls()).toHaveLength(2);
    expect(String(postCalls()[1]![1]?.body)).toBe(firstBody);
    expect(host.textContent).toContain("Питомец создан");
  });
  it("M03 auth A-B-A DURING refresh denies old intent and zero second POST",async()=>{
    const hold=pending<Response>();
    fetchMock.mockResolvedValueOnce(response(401))
      .mockReturnValueOnce(hold.promise)
      .mockResolvedValueOnce(response(200,{data:actor("A")}));
    await render();await fill();await submit();
    const refreshButton=refresh();
    await act(async()=>{refreshButton?.click();});
    expect(paths()).toEqual(["/api/v1/pets","/api/v1/auth/refresh"]);
    await authChange("B");await authChange("A");
    await act(async()=>hold.resolve(response(200)));
    expect(postCalls()).toHaveLength(1);
    expect(manual()).toBeNull();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("M04 refresh reveals different actual /me owner while Query still A",async()=>{
    fetchMock.mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200,{data:actor("B")}));
    await render();await fill();await submit();
    await click(refresh());
    expect(paths()).toHaveLength(3);
    expect(manual()).toBeNull();
    expect(postCalls()).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось подтвердить");
  });
  it("M05 lost POST ACK may already COMMIT; manual retry byte-identical",async()=>{
    fetchMock.mockRejectedValueOnce(Error("NETWORK_AFTER_SQL_COMMIT SECRET"))
      .mockResolvedValueOnce(response(201,{data:pet()}));
    await render();await fill();await submit();
    expect(host.textContent).toContain("Результат создания не подтверждён");
    const raw=String(postCalls()[0]![1]?.body);
    expect(postCalls()).toHaveLength(1);
    await click(manual());
    expect(postCalls()).toHaveLength(2);
    expect(String(postCalls()[1]![1]?.body)).toBe(raw);
    expect(host.textContent).toContain("Питомец создан");
    expect(host.textContent).not.toContain("SECRET");
  });
  it("M06 terminal409 from normal cookie transport forbids retry",async()=>{
    fetchMock.mockResolvedValue(response(409,{code:"PET_CREATE_RESULT_UNAVAILABLE"}));
    await render();await fill();await submit();
    expect(host.textContent).toContain("конфликт");
    expect(manual()).toBeNull();
    expect(postCalls()).toHaveLength(1);
    expect(host.textContent).not.toContain("SECRET_DB");
  });
  it("M07 HTTP200 success-looking body cannot confirm; explicit retry reuses JSON",async()=>{
    fetchMock.mockResolvedValueOnce(response(200,{data:pet()}))
      .mockResolvedValueOnce(response(201,{data:pet()}));
    await render();await fill();await submit();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(manual()).not.toBeNull();
    const body=String(postCalls()[0]![1]?.body);
    await click(manual());
    expect(host.textContent).toContain("Питомец создан");
    expect(String(postCalls()[1]![1]?.body)).toBe(body);
  });
  it("M08 stale 201 after unmount: no cache mutation or automatic navigation",async()=>{
    const hold=pending<Response>();
    fetchMock.mockReturnValue(hold.promise);
    await render();await fill();await submit();
    const before=cache.getQueryData(CURRENT_USER_QUERY_KEY);
    await act(async()=>root.render(<p data-testid="new-location">Другой экран</p>));
    await act(async()=>hold.resolve(response(201,{data:pet()})));
    expect(host.textContent).toBe("Другой экран");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBe(before);
    expect(onCancel).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(1);
  });
  it("M09 same owner Query authEpoch revision DURING refresh fences retry",async()=>{
    const hold=pending<Response>();
    fetchMock.mockResolvedValueOnce(response(401))
      .mockReturnValueOnce(hold.promise)
      .mockResolvedValueOnce(response(200,{data:actor("A")}));
    await render();await fill();await submit();
    await act(async()=>refresh()?.click());
    await authChange("A");
    await act(async()=>hold.resolve(response(200)));
    expect(postCalls()).toHaveLength(1);
    expect(manual()).toBeNull();
    expect(host.textContent).not.toContain("Питомец создан");
  });
  it("M10 refresh HTTP503 doesn't imply logout or retriable pet intent",async()=>{
    fetchMock.mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(503));
    await render();await fill();await submit();
    await click(refresh());
    expect(paths()).toEqual(["/api/v1/pets","/api/v1/auth/refresh"]);
    expect(manual()).toBeNull();
    expect(postCalls()).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось подтвердить");
  });
  it("M11 201 wrong owner from normal transport is UNKNOWN not ACK",async()=>{
    fetchMock.mockResolvedValueOnce(response(201,{data:pet("B")}))
      .mockResolvedValueOnce(response(201,{data:pet("A")}));
    await render();await fill();await submit();
    expect(host.textContent).not.toContain("Питомец создан");
    expect(manual()).not.toBeNull();
    const first=String(postCalls()[0]![1]?.body);
    await click(manual());
    expect(host.textContent).toContain("Питомец создан");
    expect(String(postCalls()[1]![1]?.body)).toBe(first);
  });
  it("M12 401 refresh after unmount cannot show retry or mutate cache",async()=>{
    const hold=pending<Response>();
    fetchMock.mockResolvedValueOnce(response(401))
      .mockReturnValueOnce(hold.promise)
      .mockResolvedValueOnce(response(200,{data:actor("A")}));
    await render();await fill();await submit();
    const identity=cache.getQueryData(CURRENT_USER_QUERY_KEY);
    await act(async()=>refresh()?.click());
    await act(async()=>root.render(<p>Перешли на другой экран</p>));
    await act(async()=>hold.resolve(response(200)));
    expect(host.textContent).toBe("Перешли на другой экран");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBe(identity);
    expect(postCalls()).toHaveLength(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
