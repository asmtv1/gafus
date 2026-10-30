// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request=vi.hoisted(()=>vi.fn());
vi.mock("../../shared/api/client",()=>({apiRequest:request}));
import { browserPushSupported, connectBrowserPushOnUserGesture } from "./browserPushEnrollment";

const key=btoa(String.fromCharCode(4,...new Array(64).fill(7)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
let currentOwner="A";
const endpoint="https://example.invalid/gafus-test-device";
const subscribe=vi.fn();
const readyRegistration={active:{scriptURL:"http://localhost/push-sw.js"}};
const register=vi.fn();
const permission=vi.fn();
const statusResponse={determined:true,hasThisDeviceSubscription:true};
function fakeSubscription(){
  return { endpoint, getKey:(name:string)=>name==="p256dh"
    ? new Uint8Array([1,2,3]).buffer : new Uint8Array([4,5,6]).buffer };
}
beforeEach(()=>{
  vi.clearAllMocks();currentOwner="A";
  Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
  vi.stubGlobal("PushManager",class PushManager{});
  vi.stubGlobal("Notification",{permission:"default",requestPermission:permission});
  permission.mockResolvedValue("granted");
  subscribe.mockResolvedValue(fakeSubscription());
  register.mockResolvedValue({pushManager:{
    getSubscription:vi.fn().mockResolvedValue(null),subscribe,
  }});
  Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{
    register,ready:Promise.resolve(readyRegistration),
  }});
  request.mockImplementation(async(path:string)=>{
    if(path.endsWith("public-key"))return {publicKey:key};
    if(path.endsWith("device-status"))return statusResponse;
    return undefined;
  });
});
afterEach(()=>{vi.unstubAllGlobals();Reflect.deleteProperty(navigator,"serviceWorker");});

describe("explicit browser push enrollment, no PWA",()=>{
  it("requests permission before any network call; registers push-only worker and confirms owner",async()=>{
    const connected=connectBrowserPushOnUserGesture(()=>currentOwner,"A");
    expect(permission).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    expect(await connected).toEqual({endpoint});
    expect(register).toHaveBeenCalledWith("/push-sw.js",{scope:"/",updateViaCache:"none"});
    const save=request.mock.calls.find(([path])=>path==="/api/v1/subscriptions/push");
    expect(save?.[1]).toMatchObject({method:"POST",browserAuth:true,
      json:{endpoint,keys:{p256dh:"AQID",auth:"BAUG"}}});
    const receipt=request.mock.calls.find(([path])=>path.endsWith("device-status"));
    expect(receipt?.[1].json).toEqual({endpoints:[endpoint]});
    expect(subscribe).toHaveBeenCalledWith({userVisibleOnly:true,
      applicationServerKey:expect.any(Uint8Array)});
  });
  it("permission denial makes zero subscription/network calls",async()=>{
    permission.mockResolvedValue("denied");
    await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .rejects.toThrow("BROWSER_PUSH_PERMISSION_DENIED");
    expect(request).not.toHaveBeenCalled();expect(register).not.toHaveBeenCalled();
  });
  it("missing server VAPID never registers a worker",async()=>{
    request.mockRejectedValue(new Error("WEB_PUSH_NOT_CONFIGURED"));
    await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .rejects.toThrow("WEB_PUSH_NOT_CONFIGURED");
    expect(register).not.toHaveBeenCalled();
  });
  it("owner transition before registration never creates subscription",async()=>{
    request.mockImplementation(async(path:string)=>{
      if(path.endsWith("public-key")){currentOwner="B";return {publicKey:key};}
      return statusResponse;
    });
    await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .rejects.toThrow("OWNER_CHANGED");
    expect(register).not.toHaveBeenCalled();
  });
  it("requires authoritative owner readback, never trusts a POST alone",async()=>{
    request.mockImplementation(async(path:string)=>{
      if(path.endsWith("public-key"))return {publicKey:key};
      if(path.endsWith("device-status"))return {
        determined:true,hasThisDeviceSubscription:false,
      };
      return undefined;
    });
    await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .rejects.toThrow("PUSH_SUBSCRIPTION_UNCONFIRMED");
  });
  it("allows confirmed readback after unknown HTTP POST acknowledgement",async()=>{
    request.mockImplementation(async(path:string)=>{
      if(path.endsWith("public-key"))return {publicKey:key};
      if(path.endsWith("device-status"))return statusResponse;
      throw Error("LOST_POST_ACK");
    });
    expect(await connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .toEqual({endpoint});
  });
  it("does not offer PWA WebPush in regular iPhone Safari",async()=>{
    const original=navigator.userAgent;
    try {
      Object.defineProperty(navigator,"userAgent",{configurable:true,
        value:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Safari"});
      expect(browserPushSupported()).toBe(false);
      await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
        .rejects.toThrow("BROWSER_PUSH_UNSUPPORTED");
      expect(register).not.toHaveBeenCalled();
      expect(permission).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator,"userAgent",{configurable:true,value:original});
    }
  });
  it("fails closed in insecure context and never auto-registers",async()=>{
    Object.defineProperty(window,"isSecureContext",{configurable:true,value:false});
    expect(browserPushSupported()).toBe(false);
    await expect(connectBrowserPushOnUserGesture(()=>currentOwner,"A"))
      .rejects.toThrow("BROWSER_PUSH_UNSUPPORTED");
    expect(permission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
