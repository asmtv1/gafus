// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { App } from "../../App";
import { AccountMutationPage } from "./AccountMutationPage";
import { EmailConfirmPage } from "./EmailConfirmPage";

const mock = vi.hoisted(() => ({
  email:vi.fn(),confirm:vi.fn(),set:vi.fn(),change:vi.fn(),
  logout:vi.fn(),me:vi.fn(),
}));
vi.mock("./accountApi", async (original) => ({
  ...await original(),
  requestEmailChange:mock.email,
  confirmEmailChange:mock.confirm,
  setAccountPassword:mock.set,
  changeAccountPassword:mock.change,
}));
vi.mock("../../shared/auth/authApi", async (original) => ({
  ...await original(),
  logout:mock.logout,
  getCurrentUser:mock.me,
}));
beforeAll(async()=>{await Promise.all([
  import("../profile/AccountDeleteConnected"),
  import("../pets/PetCreateConnectedPage"),
  import("./UsernameChangePage"),
  import("../../brand/PublicLanding"),
]);});
let host:HTMLDivElement,root:Root,cache:QueryClient;
function defer(){
  let resolve!:(value:unknown)=>void;
  let reject!:(cause:unknown)=>void;
  const promise=new Promise<unknown>((ok,bad)=>{
    resolve=ok;
    reject=bad;
  });
  return {promise,resolve,reject};
}
async function render(element:ReactNode){
  await act(async()=>root.render(
    <QueryClientProvider client={cache}>{element}</QueryClientProvider>,
  ));
}
function input(id:string,value:string){
  const el=host.querySelector<HTMLInputElement>("#"+id);
  if(!el)throw new Error("Input missing: "+id);
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
  if(!setter)throw new Error("No DOM setter");
  setter.call(el,value);
  el.dispatchEvent(new Event("input",{bubbles:true,cancelable:true}));
  el.dispatchEvent(new Event("change",{bubbles:true,cancelable:true}));
  return el;
}
async function fill(id:string,value:string){
  await act(async()=>{input(id,value);});
}
async function submit(){
  await act(async()=>{
    const form=host.querySelector("form");
    if(!form)throw new Error("No form available");
    form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  for(const spy of Object.values(mock))spy.mockReset();
  mock.logout.mockResolvedValue(undefined);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();window.history.replaceState(null,"","/");
});

describe("W1 local four Vite pages - mounted React and mock-only actions",()=>{
  it("public confirmation GET is inert and removes token from browser history, never fetches /me or action",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+("T".repeat(43))+"&tracking=ok");
    await render(<App/>);
    expect(host.textContent).toContain("Открытие ссылки ничего не изменяет");
    expect(host.textContent).not.toContain("T".repeat(43));
    expect(window.location.pathname).toBe("/profile/confirm-email");
    expect(window.location.search).toBe("?tracking=ok");
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(mock.me).not.toHaveBeenCalled();
    expect(host.querySelector("button[type=submit]")).not.toBeNull();
  });
  it("public confirmation explicit action; pending duplicate denied and success terminal",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+("a".repeat(40)));
    const deferred=defer();mock.confirm.mockReturnValue(deferred.promise);
    await render(<EmailConfirmPage/>);
    await submit();
    expect(mock.confirm).toHaveBeenCalledExactlyOnceWith("a".repeat(40));
    expect(host.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);
    await submit();
    expect(mock.confirm).toHaveBeenCalledTimes(1);
    await act(async()=>deferred.resolve(undefined));
    expect(host.textContent).toContain("Email подтверждён");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  });
  it("expired/invalid public token and HTTP 503 never confirm automatically",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token=short");
    await render(<EmailConfirmPage/>);
    expect(host.textContent).toContain("Ссылка недействительна");
    expect(host.querySelector("form")).toBeNull();
    expect(mock.confirm).not.toHaveBeenCalled();
    await render(null);
    window.history.replaceState(null,"","/profile/confirm-email?token="+("z".repeat(43)));
    mock.confirm.mockRejectedValue(new ApiError(503,"Failure","EMAIL_CHANGE_UNAVAILABLE"));
    await render(<EmailConfirmPage key="fresh" />);
    await submit();
    expect(host.textContent).toContain("Результат запроса неизвестен");
    expect(mock.confirm).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Email подтверждён");
  });
  it("expired or replayed public confirm 400 remains explicit error without automatic token resubmit",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+("r".repeat(43)));
    mock.confirm.mockRejectedValue(new ApiError(400,"Ссылка недействительна или устарела"));
    await render(<EmailConfirmPage/>);
    expect(mock.confirm).not.toHaveBeenCalled();
    await submit();
    expect(host.textContent).toContain("Ссылка недействительна или устарела");
    expect(host.textContent).not.toContain("Email подтверждён");
    expect(mock.confirm).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });
  it("S1_PRIVACY_DELTA echoed error stays out of mounted UI and history",async()=>{
    const secret="R".repeat(43);
    window.history.replaceState(null,"","/profile/confirm-email?token="+secret);
    mock.confirm.mockRejectedValue(new ApiError(400,"Rejected token="+secret));
    await render(<EmailConfirmPage/>);
    expect(window.location.href).not.toContain(secret);
    await submit();
    expect(mock.confirm).toHaveBeenCalledExactlyOnceWith(secret);
    expect(host.textContent).toContain("Ссылка недействительна или устарела");
    expect(host.innerHTML).not.toContain(secret);
    expect(host.innerHTML).not.toContain("Rejected token");
    expect(window.location.href).not.toContain(secret);
    expect(mock.confirm).toHaveBeenCalledTimes(1);
  });
  it("email form normalizes input, requires explicit 200, and returns success without auto-retry",async()=>{
    mock.email.mockResolvedValue(undefined);
    await render(<AccountMutationPage mode="email" actorId="A"/>);
    await fill("account-new-email","  NEW@Example.org  ");
    await submit();
    expect(mock.email).toHaveBeenCalledExactlyOnceWith("new@example.org", undefined);
    expect(host.textContent).toContain("Проверьте почту");
    expect(host.querySelector("form")).toBeNull();
    expect(mock.email).toHaveBeenCalledTimes(1);
  });
  it("email form sends current password for password-protected accounts", async () => {
    mock.email.mockResolvedValue(undefined);
    await render(<AccountMutationPage mode="email" actorId="A" />);
    await fill("account-new-email", "next@example.org");
    await fill("account-email-current-password", "CurrentPass123");
    await submit();
    expect(mock.email).toHaveBeenCalledExactlyOnceWith("next@example.org", "CurrentPass123");
  });
  it.each([
    [400,"Неверный email",true],
    [401,"Сессия завершена",false],
    [403,"Действие запрещено",false],
    [503,"Результат запроса неизвестен",false],
  ])("email server %i retains draft, shows safe error, no retry",async(status,text,showDetails)=>{
    mock.email.mockRejectedValue(new ApiError(status,"Неверный email"));
    await render(<AccountMutationPage mode="email" actorId="A"/>);
    await fill("account-new-email","kept@example.org");
    await submit();
    expect(mock.email).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLInputElement>("#account-new-email")?.value).toBe("kept@example.org");
    expect(host.textContent).toContain(text);
    expect(host.textContent).not.toContain("Проверьте почту");
    if(!showDetails)expect(host.textContent).not.toContain("Неверный email");
  });
  it("pending email double submit uses synchronous in-flight guard",async()=>{
    const deferred=defer();mock.email.mockReturnValue(deferred.promise);
    await render(<AccountMutationPage mode="email" actorId="A"/>);
    await fill("account-new-email","test@example.org");
    await submit();
    await submit();
    expect(mock.email).toHaveBeenCalledTimes(1);
    await act(async()=>deferred.reject(new Error("SYNTH_LOST_ACK")));
    expect(host.textContent).toContain("Результат запроса неизвестен");
    expect(mock.email).toHaveBeenCalledTimes(1);
  });
  it("set password succeeds once, invalidated-session logout 401 leads to login without mutation retry",async()=>{
    mock.set.mockResolvedValue(undefined);
    mock.logout.mockRejectedValue(new ApiError(401,"Unauthorized"));
    await render(<AccountMutationPage mode="set" actorId="A"/>);
    await fill("account-new-password","StrongPassword123");
    await fill("account-confirm-password","StrongPassword123");
    await submit();
    expect(mock.set).toHaveBeenCalledExactlyOnceWith("StrongPassword123");
    expect(mock.logout).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/login");
    expect(mock.set).toHaveBeenCalledTimes(1);
  });
  it("change password sends only current+new; 503 leaves form and never logs out",async()=>{
    mock.change.mockRejectedValue(new ApiError(503,"Unavailable","PASSWORD_OPERATION_UNAVAILABLE"));
    await render(<AccountMutationPage mode="change" actorId="A"/>);
    await fill("account-current-password","ExistingPassword1");
    await fill("account-new-password","AnotherPassword2");
    await fill("account-confirm-password","AnotherPassword2");
    await submit();
    expect(mock.change).toHaveBeenCalledExactlyOnceWith("ExistingPassword1","AnotherPassword2");
    expect(mock.logout).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат запроса неизвестен");
    expect(host.querySelector("form")).not.toBeNull();
  });
  it("W1_PASSWORD_ERROR_PRIVACY mounted change-password never echoes reflected submitted secret",async()=>{
    const secret="DontLeakPassword123";
    mock.change.mockRejectedValue(new ApiError(400,"Server saw "+secret));
    await render(<AccountMutationPage mode="change" actorId="A"/>);
    await fill("account-current-password","CurrentPassword123");
    await fill("account-new-password",secret);
    await fill("account-confirm-password",secret);
    await submit();
    expect(mock.change).toHaveBeenCalledTimes(1);
    const alert=host.querySelector('[role="alert"]')?.textContent??"";
    expect(alert).not.toContain(secret);
    expect(alert).toContain("парол");
    expect(host.querySelector("form")).not.toBeNull();
    expect(mock.logout).not.toHaveBeenCalled();
  });
  it("authenticated Vite route is not exposed to guest; public confirm is available without session",async()=>{
    window.history.replaceState(null,"","/profile/change-password");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
    await render(<App/>);
    // Next guest policy redirects protected routes to the public landing,
    // rather than rendering the obsolete protected-route error message.
    expect(window.location.pathname).toBe("/");
    expect(host.textContent).toContain("Начать заниматься");
    expect(host.querySelector("#account-new-password")).toBeNull();
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("old A logout response after password ACK never clears logged-in B's cache",async()=>{
    const pending=defer();
    mock.set.mockResolvedValue(undefined);
    mock.logout.mockReturnValue(pending.promise);
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner_A",role:"USER"});
    await render(<AccountMutationPage mode="set" actorId="A"/>);
    await fill("account-new-password","StrongPassword123");
    await fill("account-confirm-password","StrongPassword123");
    await submit();
    expect(mock.set).toHaveBeenCalledTimes(1);
    expect(mock.logout).toHaveBeenCalledTimes(1);
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"owner_B",role:"USER"});
    });
    await act(async()=>pending.reject(new ApiError(401,"Already revoked")));
    expect(cache.getQueryData<{id:string}>(CURRENT_USER_QUERY_KEY)?.id).toBe("B");
    expect(window.location.pathname).toBe("/");
    expect(mock.set).toHaveBeenCalledTimes(1);
  });
  it("old actor A pending server ACK cannot overwrite B or sign B out",async()=>{
    window.history.replaceState(null,"","/profile/change-email");
    const deferred=defer();
    mock.email.mockReturnValueOnce(deferred.promise);
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner_a",role:"USER"});
    await render(<App/>);
    await fill("account-new-email","a@safe.example");
    await submit();
    expect(mock.email).toHaveBeenCalledTimes(1);
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"owner_b",role:"USER"});
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    expect(host.querySelector<HTMLInputElement>("#account-new-email")?.value).toBe("");
    await fill("account-new-email","b@safe.example");
    await act(async()=>deferred.resolve(undefined));
    expect(host.querySelector<HTMLInputElement>("#account-new-email")?.value).toBe("b@safe.example");
    expect(host.textContent).not.toContain("Проверьте почту");
    expect(mock.logout).not.toHaveBeenCalled();
    expect(mock.email).toHaveBeenCalledTimes(1);
  });
  it("keeps account routes, connected delete-account and G05 add-pet route",async()=>{
    window.history.replaceState(null,"","/profile/set-password");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner_a",role:"USER"});
    await render(<App/>);
    expect(host.querySelector("#account-new-password")).not.toBeNull();
    await act(async()=>{
      window.history.pushState(null,"","/profile/change-password");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector("#account-current-password")).not.toBeNull();
    await act(async()=>{
      window.history.pushState(null,"","/profile/change-username");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // The username screen is a separate lazily imported route.
    await vi.waitFor(() => expect(host.querySelector("#account-new-username")).not.toBeNull(),
      { timeout: 1600 });
    expect(host.textContent).not.toContain("Страница не найдена");
    await act(async()=>{
      window.history.pushState(null,"","/profile/delete-account");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await vi.waitFor(()=>expect(host.querySelector("[data-next-account-deletion]"))
      .not.toBeNull(),{timeout:1500});
    expect(host.textContent).toContain("Удаление аккаунта");
    expect(host.textContent).toContain("Для подтверждения нужен шестизначный код");
    expect(mock.logout).not.toHaveBeenCalled();
    await act(async()=>{
      window.history.pushState(null,"","/profile/addPet");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.textContent).not.toContain("Страница не найдена");
    await vi.waitFor(()=>expect(host.textContent).toContain("Добавить питомца"),
      {timeout:1500});
    expect(host.querySelector("#account-new-username")).toBeNull();
    expect(mock.email).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.change).not.toHaveBeenCalled();
  });
  it("W1_A11Y_NAV_SESSION invalid email identifies and focuses labelled invalid input",async()=>{
    await render(<AccountMutationPage mode="email" actorId="A"/>);
    await fill("account-new-email","invalid-email");
    await submit();
    const field=host.querySelector<HTMLInputElement>("#account-new-email");
    const alert=host.querySelector('[role="alert"]');
    expect(mock.email).not.toHaveBeenCalled();
    expect(alert?.textContent).toContain("корректный email");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(field?.getAttribute("aria-describedby")).toBe("account-form-error");
    expect(alert?.getAttribute("id")).toBe("account-form-error");
    expect(document.activeElement).toBe(field);
  });
  it("W1_A11Y_NAV_SESSION password confirmation mismatch announces and focuses confirmation field",async()=>{
    await render(<AccountMutationPage mode="change" actorId="A"/>);
    await fill("account-current-password","CurrentPassword123");
    await fill("account-new-password","StrongPassword123");
    await fill("account-confirm-password","MismatchPassword123");
    await submit();
    const field=host.querySelector<HTMLInputElement>("#account-confirm-password");
    const alert=host.querySelector('[role="alert"]');
    expect(mock.change).not.toHaveBeenCalled();
    expect(alert?.textContent).toContain("повторите");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(field?.getAttribute("aria-describedby")).toBe("account-form-error");
    expect(alert?.getAttribute("id")).toBe("account-form-error");
    expect(document.activeElement).toBe(field);
  });
  it("W1_A11Y_NAV_SESSION request A completion after guest transition cannot logout or expose private panel",async()=>{
    const pending=defer();
    mock.change.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/change-password");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"account_A",role:"USER"});
    await render(<App/>);
    await fill("account-current-password","CurrentPassword123");
    await fill("account-new-password","StrongPassword123");
    await fill("account-confirm-password","StrongPassword123");
    await submit();
    expect(mock.change).toHaveBeenCalledTimes(1);
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    // Next guest policy redirects protected routes to the public landing,
    // rather than rendering the obsolete protected-route error message.
    expect(window.location.pathname).toBe("/");
    expect(host.textContent).toContain("Начать заниматься");
    expect(host.querySelector("#account-current-password")).toBeNull();
    await act(async()=>pending.resolve(undefined));
    expect(mock.logout).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Пароль сохранён");
    expect(window.location.pathname).toBe("/");
  });
  it("W1_A11Y_NAV_SESSION success navigation uses accessible real anchor and no second mutation",async()=>{
    mock.email.mockResolvedValue(undefined);
    await render(<AccountMutationPage mode="email" actorId="A"/>);
    await fill("account-new-email","visible@example.org");
    await submit();
    const link=host.querySelector<HTMLAnchorElement>('a[href="/profile"]');
    expect(link?.textContent).toBe("В профиль");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Запрос принят");
    expect(link?.getAttribute("href")).toBe("/profile");
    await act(async()=>{
      link?.dispatchEvent(new MouseEvent("click",{button:0,bubbles:true,cancelable:true}));
    });
    expect(window.location.pathname).toBe("/profile");
    expect(mock.email).toHaveBeenCalledExactlyOnceWith("visible@example.org", undefined);
  });
  it("W1_A11Y_NAV_SESSION redirected guest never regains protected form from cache-only login",async()=>{
    window.history.replaceState(null,"","/profile/set-password");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
    await render(<App/>);
    // Next guest policy redirects protected routes to the public landing,
    // rather than rendering the obsolete protected-route error message.
    expect(window.location.pathname).toBe("/");
    expect(host.textContent).toContain("Начать заниматься");
    expect(host.querySelector("#account-new-password")).toBeNull();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"account_A",role:"USER"});
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    // A cache-only identity must not undo the middleware-style guest redirect.
    // Explicit navigation after real login is a separate user action.
    expect(host.querySelector("#account-new-password")).toBeNull();
    expect(mock.set).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toBe("/profile/set-password");
  });
  it("W1_A11Y_NAV_SESSION cancel protected change form navigates through anchor without POST or draft URL leak",async()=>{
    window.history.replaceState(null,"","/profile/change-password");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"account_A",role:"USER"});
    await render(<App/>);
    await fill("account-current-password","NeverPutCurrentInURL1");
    const link=Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href="/profile"]'))
      .find(anchor=>anchor.textContent==="Отмена");
    expect(link?.getAttribute("href")).toBe("/profile");
    await act(async()=>{
      link?.dispatchEvent(new MouseEvent("click",{button:0,bubbles:true,cancelable:true}));
    });
    expect(window.location.pathname).toBe("/profile");
    expect(window.location.href).not.toContain("NeverPutCurrentInURL1");
    expect(mock.change).not.toHaveBeenCalled();
    expect(mock.logout).not.toHaveBeenCalled();
    expect(host.querySelector("#account-current-password")).toBeNull();
  });
  it("authenticated account switch A to B on same route drops A draft",async()=>{
    window.history.replaceState(null,"","/profile/change-email");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"account_A",role:"USER"});
    await render(<App/>);
    await fill("account-new-email","private-A@example.org");
    expect(host.querySelector<HTMLInputElement>("#account-new-email")?.value)
      .toBe("private-A@example.org");
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{
        id:"B",username:"account_B",role:"USER",
      });
      await new Promise(resolve=>setTimeout(resolve,30));
    });
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({username:"account_B"});
    expect(host.querySelector<HTMLInputElement>("#account-new-email")?.value).toBe("");
    expect(mock.email).not.toHaveBeenCalled();
  });
});
