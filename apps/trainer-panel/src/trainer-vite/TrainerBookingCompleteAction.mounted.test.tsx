// @vitest-environment jsdom
import {act} from "react";
import type {Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";

let mount:HTMLDivElement;
let root:Root|null;
const owner:PanelActor={id:"trainer-A",role:"TRAINER"};
const pending=(status="CONFIRMED")=>({
  id:"booking-1",status,cynologistUserId:"trainer-A",
  confirmationDeadlineAt:"2026-10-20T08:00:00.000Z",
  createdAt:"2026-10-17T10:00:00.000Z",
  slot:{id:"slot-A",startAtUtc:"2026-10-20T09:00:00.000Z",endAtUtc:"2026-10-20T10:00:00.000Z"}
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{
  status:200,headers:{"cache-control":"private, no-store"}
});
const click=async(label:string)=>{
  const button=Array.from(mount.querySelectorAll("button")).find(
    el=>el.textContent?.trim()===label
  );
  expect(button,"missing button "+label).toBeDefined();
  await act(async()=>button?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
};
const session={actor:owner,token:"synthetic-JWT",authEpoch:"epoch-A"};
const mountWith=async(
  fetchImpl:typeof fetch,
  getCurrentSession?:()=>typeof session|null
)=>{
  await act(async()=>{
    root=mountTrainerEntry(mount,{
      pathname:"/main-panel/consultations",...session,fetchImpl,getCurrentSession
    });
  });
};
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  mount=document.createElement("div");document.body.append(mount);root=null;
});
afterEach(async()=>{
  if(root)await act(async()=>root?.unmount());
  mount.remove();
});

describe("Trainer actual entry → complete booking → verified GET refresh",()=>{
  it("requires one user approval, POST once, pending UI, and only then GET COMPLETED updates list",async()=>{
    let finishPost!:(response:Response)=>void;
    const fetchImpl=vi.fn((url:RequestInfo|URL)=>{
      const path=String(url);
      if(path.endsWith("/complete"))
        return new Promise<Response>(resolve=>{finishPost=resolve;});
      return Promise.resolve(ok([pending(fetchImpl.mock.calls.length===1?"CONFIRMED":"COMPLETED")]));
    });
    await mountWith(fetchImpl);
    expect(mount.textContent).toContain("CONFIRMED");
    await click("Завершить");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mount.textContent).toContain("Завершить консультацию booking-1?");
    await click("Да, завершить");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "/api/v1/consultations/trainer/bookings/booking-1/complete"
    );
    expect(mount.textContent).toContain("Завершаем консультацию");
    await act(async()=>finishPost(ok({bookingId:"booking-1"})));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(mount.textContent).toContain("COMPLETED");
    expect(mount.textContent).not.toContain("CONFIRMED");
    expect(mount.querySelector('li[data-booking-id="booking-1"]')).not.toBeNull();
  });
  it("cancelled completion never sends POST",async()=>{
    const f=vi.fn(async()=>ok([pending()]));
    await mountWith(f);
    await click("Завершить");
    await click("Отмена");
    expect(f).toHaveBeenCalledTimes(1);
    expect(mount.textContent).not.toContain("Завершить консультацию booking-1?");
  });
  it("non-JSON mutation uncertainty never retries or claims saved",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>{
      if(String(url).endsWith("/complete"))
        return new Response("proxy missing ACK",{status:500,headers:{"cache-control":"private, no-store"}});
      return ok([pending()]);
    });
    await mountWith(f);await click("Завершить");await click("Да, завершить");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
      "Результат завершения неизвестен"
    );
    expect(mount.textContent).not.toContain("COMPLETED");
  });
  it("mismatching completed booking id blocks refreshed GET and success",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/complete")
      ?ok({bookingId:"different"}):ok([pending()]));
    await mountWith(f);await click("Завершить");await click("Да, завершить");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.textContent).toContain("Результат завершения неизвестен");
  });
  it("server 403 after one complete attempt keeps CONFIRMED, never automatic retry",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/complete")
      ?new Response(JSON.stringify({success:false,error:"Forbidden"}),{
          status:403,headers:{"cache-control":"private, no-store"}
        }):ok([pending()]));
    await mountWith(f);await click("Завершить");await click("Да, завершить");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.textContent).toContain("Результат завершения неизвестен");
    expect(mount.textContent).toContain("CONFIRMED");
  });
  it("successful POST with still-CONFIRMED server GET is uncertain, not completed",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/complete")
      ?ok({bookingId:"booking-1"}):ok([pending()]));
    await mountWith(f);await click("Завершить");await click("Да, завершить");
    expect(f).toHaveBeenCalledTimes(3);
    expect(mount.textContent).toContain("Результат завершения неизвестен");
    expect(mount.textContent).not.toContain("COMPLETED");
  });
  it("not-owner confirmed booking never reveals completion action",async()=>{
    const f=vi.fn(async()=>ok([{
      ...pending(),cynologistUserId:"trainer-B"
    }]));
    await mountWith(f);
    expect(mount.querySelector('[role="alert"]')).not.toBeNull();
    // A denied READ may offer safe retry; it must not expose a consequential action.
    expect([...mount.querySelectorAll("button")].some(
      button => button.textContent?.trim() === "Завершить",
    )).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  for(const [reason,next] of [
    ["logout",null],
    ["owner", {actor:{id:"trainer-B",role:"TRAINER"},token:"new-JWT",authEpoch:"epoch-B"}],
    ["role", {actor:{id:"trainer-A",role:"USER"},token:"synthetic-JWT",authEpoch:"epoch-A"}],
    ["epoch", {actor:owner,token:"synthetic-JWT",authEpoch:"epoch-B"}]
  ] as const){
    it("post-await "+reason+" change blocks stale refresh / UI success without rerender",async()=>{
      let live: {actor:PanelActor;token:string;authEpoch:string}|null={...session};
      let settle!:(response:Response)=>void;
      const f=vi.fn((url:RequestInfo|URL)=>String(url).endsWith("/complete")
        ?new Promise<Response>(r=>{settle=r;})
        :Promise.resolve(ok([pending()])));
      await mountWith(f,()=>live);
      await click("Завершить");
      await click("Да, завершить");
      live=next as typeof live;
      await act(async()=>settle(ok({bookingId:"booking-1"})));
      expect(f).toHaveBeenCalledTimes(2);
      expect(mount.textContent).not.toContain("COMPLETED");
    });
  }
  it("changed epoch while waiting for confirmation readback suppresses stale success",async()=>{
    let live:typeof session|null={...session};
    let finishGET!:(response:Response)=>void;
    const f=vi.fn((url:RequestInfo|URL)=>{
      if(String(url).endsWith("/complete"))return Promise.resolve(ok({bookingId:"booking-1"}));
      if(f.mock.calls.length===1)return Promise.resolve(ok([pending()]));
      return new Promise<Response>(r=>{finishGET=r;});
    });
    await mountWith(f,()=>live);
    await click("Завершить");await click("Да, завершить");
    expect(mount.textContent).toContain("Проверяем обновлённый список");
    live={...session,authEpoch:"epoch-B"};
    await act(async()=>finishGET(ok([pending("COMPLETED")])));
    expect(mount.textContent).not.toContain("COMPLETED");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
