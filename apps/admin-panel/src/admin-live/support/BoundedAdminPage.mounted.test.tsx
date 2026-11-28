// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { useBoundedAdminPage } from "./useBoundedAdminPage";
const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("../api",()=>({requestAdmin:mock.request}));
type Row={id:string};
const valid=(v:unknown):v is Row[]=>Array.isArray(v)&&v.every(x=>x&&typeof x.id==="string");
const initial={items:[{id:"old"}],pagination:{page:1,pageSize:25,total:51,search:""}};
function Harness({search}:{search:string}){
 const paging=useBoundedAdminPage(initial,"/api/v1/admin/partners",valid,search);
 return <><span>{paging.data?.items.map(x=>x.id).join(",")??"pending"}</span>
  <button onClick={()=>paging.setPage(2)}>next</button></>;
}
describe("bounded admin page ownership",()=>{
 it("does not render stale replies after a new search",async()=>{
  vi.useFakeTimers();mock.request.mockReset();
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  let resolveOld!:(v:unknown)=>void;
  mock.request.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));
  mock.request.mockResolvedValueOnce({items:[{id:"new"}],pagination:{page:1,pageSize:25,total:1,search:"dog"}});
  try{
    await act(async()=>root.render(<Harness search=""/>));
    expect(host.textContent).toContain("old");
    await act(async()=>host.querySelector("button")!.click());
    expect(host.textContent).not.toContain("old");
    await act(async()=>vi.advanceTimersByTimeAsync(250));
    const signal=mock.request.mock.calls[0][1].signal as AbortSignal;
    await act(async()=>root.render(<Harness search="dog"/>));
    expect(signal.aborted).toBe(true);
    // Backend may clamp an old requested page to the last matching page.
    await act(async()=>vi.advanceTimersByTimeAsync(250));
    await act(async()=>{resolveOld({items:[{id:"stale"}],pagination:{page:2,pageSize:25,total:51,search:""}});});
    expect(host.textContent).toContain("new");
    expect(host.textContent).not.toContain("stale");
  }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers();}
 });
});
