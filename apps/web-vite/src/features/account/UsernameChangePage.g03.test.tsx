// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate } from "../../shared/router/location";
import type * as AuthApi from "../../shared/auth/authApi";
import { UsernameChangePage } from "./UsernameChangePage";

const mock=vi.hoisted(()=>({
  avail:vi.fn(),change:vi.fn(),me:vi.fn(),refresh:vi.fn(),
}));
vi.mock("./usernameApi",()=>({
  getUsernameAvailability:mock.avail,
  changeUsername:mock.change,
}));
vi.mock("../../shared/auth/authApi",async(importOriginal)=>{
  const original=await importOriginal<typeof AuthApi>();
  return {...original,getCurrentUser:mock.me,refreshSession:mock.refresh};
});
vi.mock("../profile/ProfileOverview",()=>({
  ProfileOverview:({userId}:{userId:string})=>
    <section data-testid="username-profile">Profile owner {userId}</section>,
}));
const actor=(id:string,username:string)=>({id,username,role:"USER" as const});
const ack=(username="new_login")=>({
  kind:"committed" as const,source:"hono" as const,actorId:"A",
  canonicalUsername:username,profileHref:"/profile?username="+username,
  role:"USER",serverPrincipalValidated:true,
});
const unknown=()=>({kind:"not-confirmed" as const,error:"unknown-outcome" as const,
  message:"Ответ сервера не подтверждает результат. Проверьте логин перед новой попыткой.",
  autoRetry:false as const});
beforeAll(async()=>{await import("../../brand/PublicLanding");});
let host:HTMLDivElement,root:Root,cache:QueryClient;
async function mount(element:ReactNode){
  await act(async()=>root.render(
    <QueryClientProvider client={cache}>{element}</QueryClientProvider>,
  ));
}
async function update(id:string,value:string){
  const field=host.querySelector<HTMLInputElement>("#"+id);
  if(!field)throw new Error("Missing username input");
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(!setter)throw new Error("No DOM setter");
    setter.call(field,value);
    field.dispatchEvent(new Event("input",{bubbles:true,cancelable:true}));
  });
}
async function submit(){
  await act(async()=>{
    const form=host.querySelector("form");
    if(!form)throw new Error("No form");
    form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });
}
function defer<T>(){
  let resolve!:(x:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  mock.avail.mockReset();mock.change.mockReset();mock.me.mockReset();mock.refresh.mockReset();
  mock.avail.mockResolvedValue({kind:"known",available:true});
  mock.change.mockResolvedValue(ack());
  mock.me.mockResolvedValue(actor("A","new_login"));
  mock.refresh.mockResolvedValue(undefined);
  cache=new QueryClient({
    defaultOptions:{
      queries:{retry:false,refetchOnWindowFocus:false},
    },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  host.remove();cache.clear();window.history.replaceState(null,"","/");
});

describe("G03 exact source-only Vite route, mounted React + synthetic API",()=>{
  it("source route registration navigates guarded path and excludes unapproved account routes",async()=>{
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    expect(host.textContent).toContain("Изменить логин");
    expect(host.querySelector("#account-new-username")).not.toBeNull();
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("guest cannot see private G03 form or send GET/POST",async()=>{
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
    await mount(<App/>);
    expect(host.textContent).toContain("Начать заниматься");
    expect(window.location.pathname).toBe("/");
    expect(host.querySelector("#account-new-username")).toBeNull();
    expect(mock.avail).not.toHaveBeenCalled();
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("guest redirect remains closed until explicit route navigation after verified login",async()=>{
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
    await mount(<App/>);
    expect(host.querySelector("#account-new-username")).toBeNull();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    expect(host.querySelector("#account-new-username")).toBeNull();
    await act(async()=>navigate("/profile/change-username"));
    expect(host.querySelector("#account-new-username")).not.toBeNull();
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("invalid format focuses username, announces accessible error and never POSTs",async()=>{
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","bad-name");
    await submit();
    const field=host.querySelector<HTMLInputElement>("#account-new-username");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(field?.getAttribute("aria-describedby")).toBe("username-form-error");
    expect(document.activeElement).toBe(field);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("3–50");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("attempt to rename to the same existing username fails locally",async()=>{
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username"," OLD_LOGIN ");
    await submit();
    expect(host.textContent).toContain("Укажите новый логин");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("confirmed 200 updates actor A by /me then navigates to profile once",async()=>{
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    window.history.replaceState(null,"","/profile/change-username");
    await mount(<App/>);
    await update("account-new-username"," NEW_login ");
    await submit();
    expect(mock.change).toHaveBeenCalledExactlyOnceWith("new_login","A");
    expect(mock.me).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({
      id:"A",username:"new_login"});
    expect(window.location.pathname).toBe("/profile");
    expect(host.querySelector('[data-testid="username-profile"]')).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("pending mutation duplicate submissions cannot replay (including programmatic)",async()=>{
    const pending=defer<ReturnType<typeof ack>>();
    mock.change.mockReturnValueOnce(pending.promise);
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","pending_1");
    await submit();
    expect(mock.change).toHaveBeenCalledExactlyOnceWith("pending_1","A");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await submit();
    expect(mock.change).toHaveBeenCalledTimes(1);
    await act(async()=>pending.resolve(ack()));
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("unknown 500 after possible commit blocks second POST and shows safe follow-up",async()=>{
    mock.change.mockResolvedValueOnce(unknown());
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.textContent).toContain("Проверьте результат");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('a[href="/profile"]')).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(mock.me).not.toHaveBeenCalled();
  });
  it("unexpected adapter exception is an unknown ACK and the form never retries",async()=>{
    mock.change.mockRejectedValueOnce(new Error("synthetic adapter exception with raw secret"));
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.textContent).toContain("Проверьте результат");
    expect(host.textContent).not.toContain("raw secret");
    expect(host.querySelector("form")).toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("current Hono 400 remains ambiguous format/collision, not invented HTTP409",async()=>{
    mock.change.mockResolvedValueOnce({kind:"not-confirmed",
      error:"validation-or-conflict-unfrozen",message:"Проверьте логин. Возможно, он уже занят.",
      autoRetry:false});
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Возможно, он уже занят");
    expect(host.querySelector("form")).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("post-commit identity remains OLD: show reauth, never retry G03 mutation",async()=>{
    mock.me.mockResolvedValueOnce(actor("A","old_login"));
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.textContent).toContain("Логин изменён");
    expect(host.textContent).toContain("сессию обновить не удалось");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.querySelector("form")).toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("post-commit /me rejected: still show saved + login, no server replay",async()=>{
    mock.me.mockRejectedValueOnce(new Error("session refresh failed"));
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.textContent).toContain("Логин изменён");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("successful mutation rotates username-bearing access JWT BEFORE /me and profile cache update",async()=>{
    const sequence:string[]=[];
    mock.change.mockImplementationOnce(async()=>{
      sequence.push("change");return ack();
    });
    mock.refresh.mockImplementationOnce(async()=>{
      sequence.push("refresh");
    });
    mock.me.mockImplementationOnce(async()=>{
      sequence.push("me");return actor("A","new_login");
    });
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","new_login");
    await submit();
    expect(sequence).toEqual(["change","refresh","me"]);
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(mock.refresh).toHaveBeenCalledTimes(1);
    expect(mock.me).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({
      id:"A",username:"new_login"});
    expect(window.location.pathname).toBe("/profile");
  });
  it("refresh fails after committed POST: preserve prior cached principal and require reauth, never replay",async()=>{
    mock.refresh.mockRejectedValueOnce(new Error("SYNTHETIC_REFRESH_SECRET"));
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(host.textContent).toContain("Логин изменён");
    expect(host.textContent).not.toContain("SYNTHETIC_REFRESH_SECRET");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(mock.refresh).toHaveBeenCalledTimes(1);
    expect(mock.me).not.toHaveBeenCalled();
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({
      id:"A",username:"old_login"});
  });
  it("actor A's pending refresh completes after B login: no A /me or cache overwrite",async()=>{
    const pending=defer<void>();
    mock.refresh.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","new_login");
    await submit();
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(mock.refresh).toHaveBeenCalledTimes(1);
    expect(mock.me).not.toHaveBeenCalled();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("B","b_login"));
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    await act(async()=>pending.resolve());
    expect(mock.me).not.toHaveBeenCalled();
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({
      id:"B",username:"b_login"});
    expect(window.location.pathname).toBe("/profile/change-username");
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("after rotated access still returns OLD username: fail closed and do not overwrite cached identity",async()=>{
    mock.me.mockResolvedValueOnce(actor("A","old_login"));
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","new_login");
    await submit();
    expect(mock.refresh).toHaveBeenCalledTimes(1);
    expect(mock.me).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Логин изменён");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"A",username:"old_login"});
  });
  it("actor A pending ACK after switch to B does not show A success or mutate B",async()=>{
    const pending=defer<ReturnType<typeof ack>>();
    mock.change.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","new_login");
    await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("B","b_login"));
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    expect(host.querySelector<HTMLInputElement>("#account-new-username")?.value).toBe("");
    await act(async()=>pending.resolve(ack()));
    expect(mock.me).not.toHaveBeenCalled();
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"B",username:"b_login"});
    expect(mock.change).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Логин сохранён");
  });
  it("A pending /me after server ACK cannot replace newer B identity",async()=>{
    const pending=defer<ReturnType<typeof actor>>();
    mock.me.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","new_login");
    await submit();
    expect(mock.change).toHaveBeenCalledTimes(1);
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("B","b_login"));
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    await act(async()=>pending.resolve(actor("A","new_login")));
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"B",username:"b_login"});
    expect(window.location.pathname).toBe("/profile/change-username");
    expect(mock.change).toHaveBeenCalledTimes(1);
  });
  it("availability GET after 450ms uses normalized candidate and announces hint",async()=>{
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","  Available_1 ");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,490));});
    expect(mock.avail).toHaveBeenCalledExactlyOnceWith("available_1","A",expect.any(Number));
    expect(host.querySelector('[role="status"]')?.textContent).toContain("предварительно свободен");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("known taken availability blocks submit with accessible error; never trusts preliminary hint as final claim",async()=>{
    mock.avail.mockResolvedValueOnce({kind:"known",available:false});
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","taken_1");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,490));});
    await submit();
    expect(host.textContent).toContain("Логин недоступен");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("stale availability for old candidate cannot mark the new draft available",async()=>{
    const older=defer<{kind:"known";available:boolean}>();
    mock.avail.mockReturnValueOnce(older.promise);
    await mount(<UsernameChangePage actorId="A" currentUsername="old_login"/>);
    await update("account-new-username","first_name");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,490));});
    expect(mock.avail).toHaveBeenCalledTimes(1);
    await update("account-new-username","second_name");
    await act(async()=>older.resolve({kind:"known",available:false}));
    expect(host.textContent).not.toContain("Логин занят");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,490));});
    expect(mock.avail).toHaveBeenNthCalledWith(2,"second_name","A",expect.any(Number));
    expect(host.textContent).toContain("предварительно свободен");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("availability response for A after principal B signs in never leaks A status",async()=>{
    const older=defer<{kind:"known";available:boolean}>();
    mock.avail.mockReturnValueOnce(older.promise);
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","private_a_1");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,490));});
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("B","b_login"));
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    await act(async()=>older.resolve({kind:"known",available:false}));
    expect(host.querySelector<HTMLInputElement>("#account-new-username")?.value).toBe("");
    expect(host.textContent).not.toContain("Логин занят");
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("cancel navigates to profile without mutation or query draft leakage",async()=>{
    window.history.replaceState(null,"","/profile/change-username");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","old_login"));
    await mount(<App/>);
    await update("account-new-username","private_user_name");
    const link=Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href="/profile"]'))
      .find(el=>el.textContent==="Отмена");
    expect(link).toBeDefined();
    await act(async()=>link?.dispatchEvent(new MouseEvent("click",
      {button:0,bubbles:true,cancelable:true})));
    expect(window.location.pathname).toBe("/profile");
    expect(window.location.href).not.toContain("private_user_name");
    expect(mock.change).not.toHaveBeenCalled();
  });
});
