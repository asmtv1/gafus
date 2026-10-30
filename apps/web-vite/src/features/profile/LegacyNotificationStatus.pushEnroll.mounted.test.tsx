// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
const wire=vi.hoisted(()=>({connect:vi.fn(),supported:vi.fn()}));
vi.mock("./browserPushEnrollment",()=>({
  connectBrowserPushOnUserGesture:wire.connect,
  browserPushSupported:wire.supported,
}));
import {LegacyNotificationStatus} from "./LegacyNotificationStatus";
let host:HTMLDivElement;
let root:ReturnType<typeof createRoot>;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
  vi.stubGlobal("Notification",{permission:"default"});
  vi.stubGlobal("PushManager",class PushManager{});
  wire.supported.mockReset().mockReturnValue(true);
  wire.connect.mockReset().mockResolvedValue({endpoint:"https://example.invalid/ownerA"});
  Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{
    getRegistration:async()=>undefined,
  }});
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    if(url==="/api/v1/user/push-subscription-status")
      return new Response(JSON.stringify({success:true,data:{active:false}}),{status:200});
    throw Error("UNEXPECTED_HTTP");
  }));
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator,"serviceWorker");
});
const render=(ownerId?:string)=>act(async()=>root.render(
  <LegacyNotificationStatus ownerId={ownerId}/>));

describe("Web push-only action in existing notification settings",()=>{
  it("never asks permission or registers automatically; connects on button click",async()=>{
    await render("owner-A");
    expect(wire.connect).not.toHaveBeenCalled();
    const button=[...host.querySelectorAll("button")]
      .find(button=>button.textContent?.includes("Включить уведомления"));
    expect(button).not.toBeNull();
    await act(async()=>button?.click());
    expect(wire.connect).toHaveBeenCalledTimes(1);
    const [getOwner,expectedOwner]=wire.connect.mock.calls[0] as [()=>string,string];
    expect(expectedOwner).toBe("owner-A");
    expect(getOwner()).toBe("owner-A");
    expect(host.textContent).toContain("✅ Активна");
    expect(host.textContent).toContain("✅ Разрешено");
    expect(host.textContent).not.toContain("Включить уведомления в браузере");
  });
  it("permission denial offers no subscribe action",async()=>{
    vi.stubGlobal("Notification",{permission:"denied"});
    await render("owner-A");
    expect(host.textContent).toContain("Уведомления заблокированы в браузере");
    expect(host.textContent).not.toContain("Включить уведомления в браузере");
  });
  it("failed enrollment never reports server-active success",async()=>{
    wire.connect.mockRejectedValue(new Error("PUSH_SUBSCRIPTION_UNCONFIRMED"));
    await render("owner-A");
    const button=[...host.querySelectorAll("button")]
      .find(button=>button.textContent?.includes("Включить уведомления"));
    await act(async()=>button?.click());
    expect(host.textContent).toContain("Не удалось подтвердить подключение");
    expect(host.textContent).toContain("❌ Неактивна");
  });
});
