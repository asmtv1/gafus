// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutAllSessionsAction } from "./LogoutAllSessionsAction";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const button = (label: string) => [...host.querySelectorAll("button")]
  .find(item => item.textContent?.includes(label));
async function click(label: string) { await act(async () => button(label)?.click()); }
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <LogoutAllSessionsAction />
  </QueryClientProvider>));
}
const ack = (status: number, success: boolean) => new Response(JSON.stringify({success}),{status});

beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/profile?tab=settings");
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner",role:"USER"});
});
afterEach(async () => {
  await act(async () => root.unmount());host.remove();cache.clear();
  vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});

describe("WEB1 all-clients logout, synthetic responses only",()=>{
  it("requires explicit confirmation and sends no request when cancelled",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);await mount();
    await click("Выйти на всех устройствах");
    expect(host.textContent).toContain("Android и iOS");
    expect(fetcher).not.toHaveBeenCalled();
    await click("Отмена");
    expect(button("Выйти на всех устройствах")).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends exactly one cookie POST, clears cache only after 200",async()=>{
    let resolve!:(value:Response)=>void;
    const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));
    vi.stubGlobal("fetch",fetcher);await mount();
    await click("Выйти на всех устройствах");
    await act(async()=>{button("Да, выйти на всех устройствах")?.click();button("Завершаем сеансы")?.click();});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe("/api/v1/auth/logout-all");
    expect(calls[0]?.[1]).toMatchObject({method:"POST",credentials:"include"});
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).not.toBeUndefined();
    await act(async()=>resolve(ack(200,true)));
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBeUndefined();
  });
  it("503/lost ACK stays UNKNOWN, never repeats revoke or clears private cache",async()=>{
    const fetcher=vi.fn().mockResolvedValue(ack(503,false));
    vi.stubGlobal("fetch",fetcher);await mount();
    await click("Выйти на всех устройствах");
    await click("Да, выйти на всех устройствах");
    expect(host.textContent).toContain("Неизвестен результат");
    expect(button("Да, выйти на всех устройствах")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBeDefined();
  });
});
