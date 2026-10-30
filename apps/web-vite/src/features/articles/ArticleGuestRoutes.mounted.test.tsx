// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
let client:QueryClient,root:ReturnType<typeof createRoot>,host:HTMLDivElement;
let network:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  client.setQueryData(CURRENT_USER_QUERY_KEY,null);
  network=vi.fn(async (url:string)=>new Response(JSON.stringify({
    success:url==="/api/v1/public/platform-stats",data:{students:21},
  }),{status:url==="/api/v1/public/platform-stats"?200:403}));
  vi.stubGlobal("fetch",network);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
async function mount(path:string){
  window.history.replaceState(null,"",path);
  await act(async()=>root.render(<QueryClientProvider client={client}>
    <App/>
  </QueryClientProvider>));
  await act(async()=>new Promise(done=>setTimeout(done,30)));
}
describe("Next article routes are private, never anonymous browsing",()=>{
  it.each(["/articles","/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9"])(
    "direct %s redirects to landing without article API",async path=>{
      await mount(path);
      expect(window.location.pathname).toBe("/");
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(host.querySelector(".article-detail-card")).toBeNull();
      expect(network.mock.calls.some(([url])=>url.includes("articles"))).toBe(false);
    },
  );
});
