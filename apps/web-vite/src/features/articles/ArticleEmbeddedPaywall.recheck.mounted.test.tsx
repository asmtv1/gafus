// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ArticleDetails } from "./ArticleDetails";

const locked = {
  id: "article1", slug: "training-tips", title: "Советы по тренировке",
  description: "Платный текст", authorUsername: "trainer",
  visibility: "PAID", hasAccess: false,
  likeCount: 0, isLiked: false, content: null, contentType: "HTML",
  imageUrls: [], videoUrl: null, createdAt: null,
};
const done = (data: unknown) => new Response(JSON.stringify({success:true,data}),{status:200});
let host: HTMLDivElement, root: Root, cache: QueryClient;
const flush = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve,30));
});
/** Select by user-visible label, not the retired CSS class from the old paywall. */
function recheckButton(): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((item) => item.textContent?.trim() === "Проверить доступ к статье");
  expect(button).toBeDefined();
  return button!;
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <ArticleDetails userId="owner1" slug="training-tips" />
  </QueryClientProvider>));
  await flush();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);
 root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("WEB3 Paywall GET/reload never initiates payment",()=>{
  it("rechecks current owner via GET only, leaves still-locked content hidden",async()=>{
    let getCount=0,viewCount=0;
    const fetcher=vi.fn(async (url:string,init:RequestInit)=>{
      if(url==="/api/v1/articles/training-tips"&&init.method==="GET"){
        getCount++;return done(locked);
      }
      if(url==="/api/v1/articles/training-tips/view"&&init.method==="POST"){
        viewCount++;return done(null);
      }
      throw Error("UNEXPECTED_PAYWALL_TRANSPORT:"+url);
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    expect(host.textContent).toContain("Gafus Premium");
    expect(getCount).toBe(1);
    await act(async()=>recheckButton().click());
    await flush();
    expect(getCount).toBe(2);
    expect(viewCount).toBe(1);
    expect(host.textContent).toContain("Выберите тариф");
    expect(host.querySelector(".article-body")).toBeNull();
    expect(fetcher.mock.calls.some(([url])=>String(url).includes("app-subscription"))).toBe(false);
  });
  it("a genuine different GET entitlement updates UI; no synthetic price/checkout",async()=>{
    let getCount=0,viewCount=0;
    const fetcher=vi.fn(async (url:string,init:RequestInit)=>{
      if(url==="/api/v1/articles/training-tips"&&init.method==="GET"){
        getCount++;
        return done(getCount===1?locked:{...locked,hasAccess:true,
          content:"<h3>Доступ подтверждён</h3>"});
      }
      if(url==="/api/v1/articles/training-tips/view"&&init.method==="POST"){
        viewCount++;return done(null);
      }
      throw Error("UNEXPECTED_PAYWALL_TRANSPORT:"+url);
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    expect(host.innerHTML).not.toContain("Доступ подтверждён");
    await act(async()=>recheckButton().click());
    await flush();
    expect(host.querySelector(".article-body h3")?.textContent)
      .toBe("Доступ подтверждён");
    expect(host.textContent).not.toContain("Выберите тариф");
    expect(getCount).toBe(2);
    expect(viewCount).toBe(1);
    expect(fetcher.mock.calls.some(([url])=>String(url).includes("yookassa"))).toBe(false);
  });
});
