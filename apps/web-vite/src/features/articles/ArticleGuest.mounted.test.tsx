// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleCatalog } from "./ArticleCatalog";
import { ArticleDetails } from "./ArticleDetails";
let host:HTMLDivElement,root:ReturnType<typeof createRoot>,client:QueryClient;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();
});
const mount=async(child:React.ReactElement)=>act(async()=>root.render(
  <QueryClientProvider client={client}>{child}</QueryClientProvider>,
));
describe("private article components never mount an anonymous fallback",()=>{
  it("missing principal disables catalog and all network",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount(<ArticleCatalog userId={null}/>);
    expect(host.textContent).toBe("");
    expect(host.querySelector(".article-card")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("missing principal disables detail, view counter and all network",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount(<ArticleDetails userId={null} slug="учебный"/>);
    expect(host.textContent).toBe("");
    expect(host.querySelector(".article-body")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
