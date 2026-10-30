// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyNotificationStatus } from "./LegacyNotificationStatus";
let element:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  element=document.createElement("div");document.body.append(element);
  root=createRoot(element);
});
afterEach(async()=>{
  await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator,"serviceWorker");
  Reflect.deleteProperty(window,"isSecureContext");
  vi.restoreAllMocks();
});
const render=(ownerId?:string)=>act(async()=>root.render(
  <LegacyNotificationStatus ownerId={ownerId}/>));
describe("WEB1 Next notification status visual parity: never fake provider subscription",()=>{
  it("reports the unsupported status without registering service workers",async()=>{
    await render();
    expect(element.textContent).toContain("Этот браузер не поддерживает push-уведомления");
    expect(element.textContent).toContain("Статус аккаунта не означает");
    expect(element.querySelector("details")?.open).toBe(false);
  });
  it("reflects denied browser permission and real absent local registration",async()=>{
    vi.stubGlobal("Notification",{permission:"denied"});
    vi.stubGlobal("PushManager",class PushManager{});
    const registration=vi.fn(async()=>undefined);
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:registration},
    });
    await render();
    expect(element.textContent).toContain("❌ Отклонено");
    expect(element.textContent).toContain("❌ Неактивна");
    expect(element.querySelector("details")?.open).toBe(false);
    expect(registration).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll("button")).toHaveLength(0);
  });
  it("reads account-only Hono boolean without exposing endpoints or keys",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:{active:true}}),{
      status:200,headers:{"content-type":"application/json"},
    }));
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    expect(element.textContent).toContain("✅ Активна");
    expect(element.textContent).toContain("Серверная подписка:");
    expect(element.querySelector("details")?.open).toBe(false);
    expect(element.innerHTML).not.toContain("endpoint");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe("/api/v1/user/push-subscription-status");
    expect(options.method).toBe("GET");
  });
  it("old owner response cannot mark another account subscribed",async()=>{
    let deliver!: (response:Response)=>void;
    const deferred=new Promise<Response>(resolve=>{deliver=resolve;});
    const fetcher=vi.fn()
      .mockImplementationOnce(()=>deferred)
      .mockImplementationOnce(async()=>new Response(JSON.stringify({
        success:true,data:{active:false},
      }),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    await render("owner-B");
    await act(async()=>deliver(new Response(JSON.stringify({success:true,data:{active:true}}),{
      status:200,headers:{"content-type":"application/json"},
    })));
    expect(element.textContent).toContain("❌ Неактивна");
    expect(element.textContent).not.toContain("✅ Активна");
  });
  it("deletes only the current device endpoint after Hono readback, never retries",async()=>{
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    let onServer=true;
    const unsubscribe=vi.fn(async()=>true);
    const endpoint="https://push.example.test/current-device";
    const subscription={endpoint,unsubscribe};
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>({
        pushManager:{getSubscription:async()=>subscription},
      })},
    });
    const calls:string[]=[];
    const fetcher=vi.fn(async(url:string,options:RequestInit)=>{
      calls.push(`${options.method} ${url}`);
      if(url==="/api/v1/user/push-subscription-status")
        return new Response(JSON.stringify({success:true,data:{active:onServer}}),{status:200});
      if(url==="/api/v1/subscriptions/push/device-status")
        return new Response(JSON.stringify({success:true,
          data:{determined:true,hasThisDeviceSubscription:onServer}}),{status:200});
      if(url==="/api/v1/subscriptions/push"&&options.method==="DELETE"){
        expect(JSON.parse(String(options.body))).toEqual({endpoint});
        onServer=false;
        return new Response(JSON.stringify({success:true}),{status:200});
      }
      throw Error("UNEXPECTED_API_PATH");
    });
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    const button=Array.from(element.querySelectorAll("button"))
      .find(x=>x.textContent?.includes("Отключить уведомления"));
    expect(button).toBeDefined();
    await act(async()=>button?.click());
    expect(calls.filter(x=>x==="DELETE /api/v1/subscriptions/push")).toHaveLength(1);
    expect(calls.filter(x=>x==="POST /api/v1/subscriptions/push/device-status"))
      .toHaveLength(2);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(element.textContent).toContain("❌ Неактивна");
  });
  it("shows the main red off action when server subscriptions are active",async()=>{
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>undefined},
    });
    const fetcher=vi.fn(async(url:string)=>{
      expect(url).toBe("/api/v1/user/push-subscription-status");
      return new Response(JSON.stringify({success:true,data:{active:true}}),{status:200});
    });
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    const off=element.querySelector<HTMLButtonElement>(
      'button[data-gafus-variant="red"]');
    expect(off?.textContent).toContain("Выключить уведомления");
    expect(off?.getAttribute("data-gafus-shared-button")).toBe("secondary");
    expect(element.textContent).not.toContain("Включить уведомления в браузере");
    expect(element.textContent).toContain("На всех устройствах");
    expect(element.querySelector("details")?.open).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("requires explicit consent and server GET confirmation before changing red to olive",async()=>{
    Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>undefined},
    });
    let active=true;
    const confirmed=vi.spyOn(window,"confirm").mockReturnValue(false);
    const requests:string[]=[];
    const fetcher=vi.fn(async(url:string, options:RequestInit)=>{
      requests.push(`${options.method} ${url}`);
      if(url==="/api/v1/user/push-subscription-status")
        return new Response(JSON.stringify({success:true,data:{active}}),{status:200});
      if(url==="/api/v1/subscriptions/push"&&options.method==="DELETE"){
        expect(JSON.parse(String(options.body))).toEqual({deleteAll:true});
        active=false;
        return new Response(JSON.stringify({success:true}),{status:200});
      }
      throw Error("UNEXPECTED_REQUEST");
    });
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    const red=element.querySelector<HTMLButtonElement>('button[data-gafus-variant="red"]');
    expect(red).not.toBeNull();
    await act(async()=>red?.click());
    expect(requests).toEqual(["GET /api/v1/user/push-subscription-status"]);
    expect(element.textContent).toContain("Выключить уведомления");
    confirmed.mockReturnValue(true);
    await act(async()=>red?.click());
    expect(requests).toEqual([
      "GET /api/v1/user/push-subscription-status",
      "DELETE /api/v1/subscriptions/push",
      "GET /api/v1/user/push-subscription-status",
    ]);
    expect(confirmed).toHaveBeenCalledTimes(2);
    expect(element.querySelector('button[data-gafus-variant="red"]')).toBeNull();
    expect(element.querySelector('button[data-gafus-shared-button="primary"]')?.textContent)
      .toContain("Включить уведомления в браузере");
    expect(element.textContent).toContain("❌ Неактивна");
    confirmed.mockRestore();
  });
  it("does not claim disconnected when account unsubscribe receipt remains active",async()=>{
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>undefined},
    });
    vi.spyOn(window,"confirm").mockReturnValue(true);
    const fetcher=vi.fn(async(url:string, options:RequestInit)=>{
      if(url==="/api/v1/user/push-subscription-status")
        return new Response(JSON.stringify({success:true,data:{active:true}}),{status:200});
      if(url==="/api/v1/subscriptions/push"&&options.method==="DELETE")
        return new Response(JSON.stringify({success:false,code:"SERVER_ERROR"}),{status:503});
      throw Error("UNEXPECTED_REQUEST");
    });
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    await act(async()=>element.querySelector<HTMLButtonElement>(
      'button[data-gafus-variant="red"]')?.click());
    expect(element.textContent).toContain("Отключение не подтверждено сервером");
    expect(element.querySelector('button[data-gafus-variant="red"]')?.textContent)
      .toContain("Выключить уведомления");
    expect(fetcher.mock.calls.filter(([url,init])=>url==="/api/v1/subscriptions/push"&&
      init.method==="DELETE")).toHaveLength(1);
    vi.restoreAllMocks();
  });
  it("on account-wide opt-out unsubscribes only verified owner browser endpoint",async()=>{
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    vi.spyOn(window,"confirm").mockReturnValue(true);
    const endpoint="https://push.example.test/confirmed";
    const unsubscribe=vi.fn(async()=>true);
    const registration={pushManager:{getSubscription:async()=>({endpoint,unsubscribe})}};
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>registration},
    });
    let active=true;
    const fetcher=vi.fn(async(url:string, options:RequestInit)=>{
      if(url==="/api/v1/user/push-subscription-status")
        return new Response(JSON.stringify({success:true,data:{active}}),{status:200});
      if(url==="/api/v1/subscriptions/push/device-status")
        return new Response(JSON.stringify({success:true,data:{determined:true,
          hasThisDeviceSubscription:true}}),{status:200});
      if(url==="/api/v1/subscriptions/push"&&options.method==="DELETE"){
        active=false;
        return new Response(JSON.stringify({success:true}),{status:200});
      }
      throw Error("UNEXPECTED_REQUEST");
    });
    vi.stubGlobal("fetch",fetcher);
    await render("owner-A");
    await act(async()=>element.querySelector<HTMLButtonElement>(
      'button[data-gafus-variant="red"]')?.click());
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(element.textContent).toContain("❌ Неактивна");
    expect(element.textContent).not.toContain("Выключить уведомления");
    vi.restoreAllMocks();
  });
  it("does not confuse locally subscribed PushManager with server ACK",async()=>{
    vi.stubGlobal("Notification",{permission:"granted"});
    vi.stubGlobal("PushManager",class PushManager{});
    Object.defineProperty(navigator,"serviceWorker",{
      configurable:true,value:{getRegistration:async()=>({
        pushManager:{getSubscription:async()=>({endpoint:"https://example.invalid/fixture"})},
      })},
    });
    await render();
    expect(element.textContent).toContain("✅ Разрешено");
    expect(element.textContent).toContain("✅ Создана");
    expect(element.textContent).toContain("Статус аккаунта не означает");
  });
});
