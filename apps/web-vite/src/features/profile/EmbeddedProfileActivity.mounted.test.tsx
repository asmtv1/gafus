// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {EmbeddedProfileActivity} from "./EmbeddedProfileActivity";

const status = vi.hoisted(() => ({
  fetch: vi.fn<() => Promise<{enabled:boolean;smartEnabled:boolean}>>(),
}));
vi.mock("../moments/momentsApi", () => ({ getMomentsStatus:status.fetch }));
let host:HTMLDivElement,root:Root,query:QueryClient,active:boolean;
async function render(){
  await act(async()=>root.render(<QueryClientProvider client={query}>
    <EmbeddedProfileActivity userId="owner-A" username="synthetic" isCurrent={()=>active}/>
  </QueryClientProvider>));
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  status.fetch.mockReset();active=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());query.clear();host.remove();
});
describe("owner's Next-equivalent embedded Moments availability",()=>{
  it("shows genuine 168px retained source loading mascot until owner status GET settles",async()=>{
    status.fetch.mockReturnValue(new Promise(()=>undefined));
    await render();
    expect(host.textContent).toContain("Проверяем доступность «Моментов»");
    expect(host.querySelector('img[src="/images/loading-mascot-router-poster.webp"]'))
      .not.toBeNull();
    expect(host.querySelector('img[src="/images/loading-mascot-router.webp"]'))
      .not.toBeNull();
    expect(status.fetch).toHaveBeenCalledTimes(1);
  });
  it("settled server-disabled feed renders original Next wording and card",async()=>{
    status.fetch.mockResolvedValue({enabled:false,smartEnabled:false});
    query.setQueryData(["moments","status","owner-A"],{enabled:false,smartEnabled:false});
    await render();
    expect(host.querySelector("[data-next-profile-feed-disabled]")?.textContent).toContain(
      "Раздел «Моменты» пока недоступен. Ваши публикации и альбомы не затронуты.");
    expect(host.textContent).not.toContain("Публикации @synthetic");
    expect(status.fetch).toHaveBeenCalledTimes(1);
  });
  it("failed availability is not displayed as disabled and can retry",async()=>{
    status.fetch.mockRejectedValueOnce(Error("SYNTHETIC_503"))
      .mockResolvedValueOnce({enabled:false,smartEnabled:false});
    await render();
    await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
    expect(host.querySelector("[role=\"alert\"]")?.textContent)
      .toContain("Не удалось проверить доступность");
    const button=host.querySelector<HTMLButtonElement>("button");
    await act(async()=>button?.click());
    await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(status.fetch).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-next-profile-feed-disabled]")).not.toBeNull();
  });
  it("rejects stale rendering immediately if owner context changes",async()=>{
    status.fetch.mockResolvedValue({enabled:false,smartEnabled:false});
    query.setQueryData(["moments","status","owner-A"],{enabled:false,smartEnabled:false});
    await render();
    await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(host.textContent).toContain("Ваши публикации");
    active=false;await render();
    expect(host.textContent).toBe("");
  });
});
