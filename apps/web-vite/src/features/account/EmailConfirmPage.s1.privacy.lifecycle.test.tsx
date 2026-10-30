// @vitest-environment jsdom
import htmlEntrySource from "../../../index.html?raw";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailConfirmPage } from "./EmailConfirmPage";

const mocks=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock("./accountApi",()=>({
  confirmEmailChange:mocks.confirm,
  accountOperationError:()=> "Ссылка недействительна или устарела.",
}));
vi.mock("../../shared/router/location",()=>({
  RouteLink:({to,children}:{to:string;children:React.ReactNode})=>
    <a href={to} rel="noreferrer">{children}</a>,
}));
const A="a".repeat(43);
const B="b".repeat(43);
let root:Root;
let host:HTMLDivElement;
function changeURL(search:string,type:"popstate"|"gafus:route-change"="popstate"){
  window.history.pushState(null,"","/profile/confirm-email"+search);
  window.dispatchEvent(new Event(type));
}
async function mount(){
  await act(async()=>root.render(<EmailConfirmPage/>));
}
async function submit(){
  await act(async()=>{
    const form=host.querySelector("form");
    if(!form)throw new Error("Expected explicit confirmation button");
    form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });
}
function deferred(){
  let resolve!:(v:unknown)=>void;
  let reject!:(reason:unknown)=>void;
  const promise=new Promise<unknown>((ok,no)=>{resolve=ok;reject=no;});
  return {promise,resolve,reject};
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  mocks.confirm.mockReset();
  window.history.replaceState(null,"","/");
  host=document.createElement("div");
  document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  host.remove();
  window.history.replaceState(null,"","/");
});

describe("W1 S1 public email capability lifecycle — mounted, privacy only",()=>{
  it("static SPA entry sets no-referrer before JS and contains no capability literal",()=>{
    const html=htmlEntrySource;
    const policy=html.indexOf("<meta name=\"referrer\" content=\"no-referrer\"");
    const firstScript=html.indexOf("<script ");
    expect(policy).toBeGreaterThan(-1);
    expect(firstScript).toBeGreaterThan(policy);
    expect(html).not.toContain("token=");
    // Static source only, not proof of HTTP GET response headers or CDN logs.
  });
  it("initial token from deep-link is scrubbed with unrelated query/hash preserved before user interaction",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+A+"&campaign=legit#instructions");
    await mount();
    expect(window.location.search).toBe("?campaign=legit");
    expect(window.location.hash).toBe("#instructions");
    expect(window.location.href).not.toContain(A);
    expect(host.innerHTML).not.toContain(A);
    expect(host.querySelector('a[href*="token"]')).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Открытие ссылки ничего не изменяет");
  });
  it("duplicate token parameters fail closed and BOTH values are scrubbed",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+A+"&keep=yes&token="+B);
    await mount();
    expect(window.location.search).toBe("?keep=yes");
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Ссылка недействительна");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("same-route popstate with NEW link replaces stale token and demands new explicit click",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await act(async()=>changeURL("?token="+B+"&keep=1"));
    expect(window.location.search).toBe("?keep=1");
    expect(host.innerHTML).not.toContain(A);
    expect(host.innerHTML).not.toContain(B);
    expect(mocks.confirm).not.toHaveBeenCalled();
    await submit();
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(B);
  });
  it("same-route SPA navigation event with token changes value without auto-POST",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await act(async()=>changeURL("?token="+B,"gafus:route-change"));
    expect(window.location.search).toBe("");
    expect(mocks.confirm).not.toHaveBeenCalled();
    await submit();
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(B);
  });
  it("Back or Forward to a scrubbed no-token route cannot reuse old in-memory capability",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await act(async()=>changeURL("?keep=back"));
    expect(window.location.search).toBe("?keep=back");
    expect(host.querySelector("form")).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("late successful A POST after navigating to B cannot display success for B",async()=>{
    const pending=deferred();
    mocks.confirm.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await submit();
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(A);
    await act(async()=>changeURL("?token="+B));
    expect(host.textContent).not.toContain("Email подтверждён");
    await act(async()=>pending.resolve(undefined));
    expect(host.textContent).not.toContain("Email подтверждён");
    expect(host.querySelector("form")).not.toBeNull();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    await submit();
    expect(mocks.confirm).toHaveBeenNthCalledWith(2,B);
  });
  it("S1_PRIVACY_DELTA pending A success after tokenless popstate cannot resurrect expired capability",async()=>{
    const pending=deferred();
    mocks.confirm.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await submit();
    await act(async()=>changeURL("?campaign=no-token#safe"));
    expect(host.querySelector("form")).toBeNull();
    expect(window.location.search).toBe("?campaign=no-token");
    expect(window.location.hash).toBe("#safe");
    await act(async()=>pending.resolve(undefined));
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Ссылка недействительна");
    expect(host.textContent).not.toContain("Email подтверждён");
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(A);
    expect(host.innerHTML).not.toContain(A);
  });
  it("S1_PRIVACY_DELTA percent-encoded duplicate token keys are denied and both scrubbed",async()=>{
    window.history.replaceState(null,"","/profile/confirm-email?%74oken="+A+"&other=ok&token="+B+"#notice");
    await mount();
    expect(window.location.search).toBe("?other=ok");
    expect(window.location.hash).toBe("#notice");
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Ссылка недействительна");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(A);
    expect(window.location.href).not.toContain(B);
  });
  it("late A POST failure cannot show an A error after switching to B",async()=>{
    const pending=deferred();
    mocks.confirm.mockReturnValueOnce(pending.promise);
    window.history.replaceState(null,"","/profile/confirm-email?token="+A);
    await mount();
    await submit();
    await act(async()=>changeURL("?token="+B));
    await act(async()=>pending.reject(new Error("old A unknown ACK")));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector("form")).not.toBeNull();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });
});
