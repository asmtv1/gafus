// @vitest-environment jsdom
import {act} from "react";
import type {Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";

let mount:HTMLDivElement;
let root:Root|null;
const owner:PanelActor={id:"trainer-A",role:"TRAINER"};
const pending=(status="PENDING_TRAINER_CONFIRMATION")=>({
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

describe("Trainer actual entry → confirm booking → verified GET refresh",()=>{
  it("requires confirmation, POST once, pending UI, and only then GET CONFIRMED updates list",async()=>{
    let finishPost!:(response:Response)=>void;
    const fetchImpl=vi.fn((url:RequestInfo|URL)=>{
      const path=String(url);
      if(path.endsWith("/confirm"))
        return new Promise<Response>(resolve=>{finishPost=resolve;});
      return Promise.resolve(ok([pending(fetchImpl.mock.calls.length===1?"PENDING_TRAINER_CONFIRMATION":"CONFIRMED")]));
    });
    await mountWith(fetchImpl);
    expect(mount.textContent).toContain("PENDING_TRAINER_CONFIRMATION");
    await click("Подтвердить");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mount.textContent).toContain("Подтвердить запись booking-1?");
    await click("Да, подтвердить");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "/api/v1/consultations/trainer/bookings/booking-1/confirm"
    );
    expect(mount.textContent).toContain("Подтверждаем запись");
    await act(async()=>finishPost(ok({bookingId:"booking-1"})));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(mount.textContent).toContain("CONFIRMED");
    expect(mount.textContent).not.toContain("PENDING_TRAINER_CONFIRMATION");
    expect(mount.querySelector('li[data-booking-id="booking-1"]')).not.toBeNull();
  });
  it("cancelled confirmation never sends POST",async()=>{
    const f=vi.fn(async()=>ok([pending()]));
    await mountWith(f);
    await click("Подтвердить");
    await click("Отмена");
    expect(f).toHaveBeenCalledTimes(1);
    expect(mount.textContent).not.toContain("Подтвердить запись booking-1?");
  });
  it("non-JSON mutation uncertainty never retries or claims saved",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>{
      if(String(url).endsWith("/confirm"))
        return new Response("proxy missing ACK",{status:500,headers:{"cache-control":"private, no-store"}});
      return ok([pending()]);
    });
    await mountWith(f);await click("Подтвердить");await click("Да, подтвердить");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
      "Результат подтверждения неизвестен"
    );
    expect(mount.textContent).not.toContain("CONFIRMED");
  });
  it("mismatching confirmed booking id blocks refreshed GET and success",async()=>{
    const f=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/confirm")
      ?ok({bookingId:"different"}):ok([pending()]));
    await mountWith(f);await click("Подтвердить");await click("Да, подтвердить");
    expect(f).toHaveBeenCalledTimes(2);
    expect(mount.textContent).toContain("Результат подтверждения неизвестен");
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
      const f=vi.fn((url:RequestInfo|URL)=>String(url).endsWith("/confirm")
        ?new Promise<Response>(r=>{settle=r;})
        :Promise.resolve(ok([pending()])));
      await mountWith(f,()=>live);
      await click("Подтвердить");
      await click("Да, подтвердить");
      live=next as typeof live;
      await act(async()=>settle(ok({bookingId:"booking-1"})));
      expect(f).toHaveBeenCalledTimes(2);
      expect(mount.textContent).not.toContain("CONFIRMED");
    });
  }
  it("changed epoch while waiting for confirmation readback suppresses stale success",async()=>{
    let live:typeof session|null={...session};
    let finishGET!:(response:Response)=>void;
    const f=vi.fn((url:RequestInfo|URL)=>{
      if(String(url).endsWith("/confirm"))return Promise.resolve(ok({bookingId:"booking-1"}));
      if(f.mock.calls.length===1)return Promise.resolve(ok([pending()]));
      return new Promise<Response>(r=>{finishGET=r;});
    });
    await mountWith(f,()=>live);
    await click("Подтвердить");await click("Да, подтвердить");
    expect(mount.textContent).toContain("Проверяем обновлённый список");
    live={...session,authEpoch:"epoch-B"};
    await act(async()=>finishGET(ok([pending("CONFIRMED")])));
    expect(mount.textContent).not.toContain("CONFIRMED");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
