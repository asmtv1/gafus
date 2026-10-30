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

describe("Trainer actual entry → mark no-show → verified GET refresh",()=>{
  it("requires explicit consequential user approval, POST once, pending UI, and only then GET NO_SHOW updates list",async()=>{
    let finishPost!:(response:Response)=>void;
    const fetchImpl=vi.fn((url:RequestInfo|URL)=>{
      const path=String(url);
      if(path.endsWith("/no-show"))
        return new Promise<Response>(resolve=>{finishPost=resolve;});
      return Promise.resolve(ok([pending(fetchImpl.mock.calls.length===1?"CONFIRMED":"NO_SHOW")]));
    });
    await mountWith(fetchImpl);
    expect(mount.textContent).toContain("CONFIRMED");
    await click("Отметить неявку");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mount.textContent).toContain("Отметить неявку клиента в записи booking-1?");
    await click("Да, отметить неявку");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "/api/v1/consultations/trainer/bookings/booking-1/no-show"
    );
    expect(mount.textContent).toContain("Отмечаем неявку");
    await act(async()=>finishPost(ok({bookingId:"booking-1"})));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(mount.textContent).toContain("NO_SHOW");
    expect(mount.textContent).not.toContain("CONFIRMED");
    expect(mount.querySelector('li[data-booking-id="booking-1"]')).not.toBeNull();
  });
  it("cancelled no-show never sends POST",async()=>{
    const f=vi.fn(async()=>ok([pending()]));
    await mountWith(f);
    await click("Отметить неявку");
    await click("Отмена");
    expect(f).toHaveBeenCalledTimes(1);
    expect(mount.textContent).not.toContain("Отметить неявку клиента в записи booking-1?");
  });
  it("non-JSON mutation uncertainty never retries or claims saved",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>{
      if(String(url).endsWith("/no-show"))
        return new Response("proxy missing ACK",{status:500,headers:{"cache-control":"private, no-store"}});
      return ok([pending()]);
    });
    await mountWith(f);await click("Отметить неявку");await click("Да, отметить неявку");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
      "Результат отметки неявки неизвестен"
    );
    expect(mount.textContent).not.toContain("NO_SHOW");
  });
  it("mismatching no-show booking id blocks refreshed GET and success",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/no-show")
      ?ok({bookingId:"different"}):ok([pending()]));
    await mountWith(f);await click("Отметить неявку");await click("Да, отметить неявку");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.textContent).toContain("Результат отметки неявки неизвестен");
  });
  it("server 403 after one no-show attempt keeps CONFIRMED, never automatic retry",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/no-show")
      ?new Response(JSON.stringify({success:false,error:"Forbidden"}),{
          status:403,headers:{"cache-control":"private, no-store"}
        }):ok([pending()]));
    await mountWith(f);await click("Отметить неявку");await click("Да, отметить неявку");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.textContent).toContain("Результат отметки неявки неизвестен");
    expect(mount.textContent).toContain("CONFIRMED");
  });
  it("successful no-show POST with still-CONFIRMED server GET is uncertain, not completed",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/no-show")
      ?ok({bookingId:"booking-1"}):ok([pending()]));
    await mountWith(f);await click("Отметить неявку");await click("Да, отметить неявку");
    expect(f).toHaveBeenCalledTimes(3);
    expect(mount.textContent).toContain("Результат отметки неявки неизвестен");
    expect(mount.textContent).not.toContain("NO_SHOW");
  });
  it("server statuses PENDING_TRAINER_CONFIRMATION, COMPLETED and NO_SHOW never offer no-show",async()=>{
    for(const status of ["PENDING_TRAINER_CONFIRMATION","COMPLETED","NO_SHOW"]){
      const f=vi.fn(async()=>ok([pending(status)]));
      await mountWith(f);
      expect(mount.querySelectorAll("button")).toBeDefined();
      expect(Array.from(mount.querySelectorAll("button")).some(b=>
        b.textContent?.trim()==="Отметить неявку")).toBe(false);
      expect(f).toHaveBeenCalledTimes(1);
      await act(async()=>root?.unmount());
      root=null;
    }
  });
  it("consequence and second approval are visible before no-show POST",async()=>{
    const f=vi.fn(async()=>ok([pending()]));
    await mountWith(f);
    await click("Отметить неявку");
    expect(mount.textContent).toContain("клиент получит уведомление");
    expect(f).toHaveBeenCalledTimes(1);
    await click("Отмена");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("not-owner confirmed booking never reveals no-show action",async()=>{
    const f=vi.fn(async()=>ok([{
      ...pending(),cynologistUserId:"trainer-B"
    }]));
    await mountWith(f);
    expect(mount.querySelector('[role="alert"]')).not.toBeNull();
    // A denied READ may offer safe retry; it must not expose a consequential action.
    expect([...mount.querySelectorAll("button")].some(
      button => button.textContent?.trim() === "Отметить неявку",
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
      const f=vi.fn((url:RequestInfo|URL)=>String(url).endsWith("/no-show")
        ?new Promise<Response>(r=>{settle=r;})
        :Promise.resolve(ok([pending()])));
      await mountWith(f,()=>live);
      await click("Отметить неявку");
      await click("Да, отметить неявку");
      live=next as typeof live;
      await act(async()=>settle(ok({bookingId:"booking-1"})));
      expect(f).toHaveBeenCalledTimes(2);
      expect(mount.textContent).not.toContain("NO_SHOW");
    });
  }
  it("changed epoch while waiting for no-show readback suppresses stale success",async()=>{
    let live:typeof session|null={...session};
    let finishGET!:(response:Response)=>void;
    const f=vi.fn((url:RequestInfo|URL)=>{
      if(String(url).endsWith("/no-show"))return Promise.resolve(ok({bookingId:"booking-1"}));
      if(f.mock.calls.length===1)return Promise.resolve(ok([pending()]));
      return new Promise<Response>(r=>{finishGET=r;});
    });
    await mountWith(f,()=>live);
    await click("Отметить неявку");await click("Да, отметить неявку");
    expect(mount.textContent).toContain("Проверяем обновлённый список");
    live={...session,authEpoch:"epoch-B"};
    await act(async()=>finishGET(ok([pending("NO_SHOW")])));
    expect(mount.textContent).not.toContain("NO_SHOW");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
