// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {GalleryImage} from "./GalleryAlbums";

const signed="https://mepsuduyokabib.begetcdn.cloud/"+
  "md5(ABCDEFGHIJKLMNOPQRSTUV,2000000000)/albums/owner/album/photos/p/thumb.webp";
const expiry="2099-12-31T12:00:00.000Z";
let host:HTMLDivElement,root:Root;
const mount=async()=>{
  await act(async()=>root.render(<GalleryImage url={signed} expires={expiry}
    alt="Прогулка" photoId="p" variant="thumb"/>));
};
const fail=async()=>{
  await act(async()=>{
    host.querySelector("img")?.dispatchEvent(new Event("error"));
    await new Promise(resolve=>setTimeout(resolve,25));
  });
};
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});
describe("private gallery media recovery",()=>{
  it.each([403,404])("never uses the S3 fallback after a CDN %i",async(status)=>{
    const fetch=vi.fn(async(_input:RequestInfo|URL)=>new Response("blocked or missing",{status}));
    vi.stubGlobal("fetch",fetch);
    await mount();await fail();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/api/v1/media-cdn-probe");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Нет миниатюры");
  });
  it("does not let an old pending photo block a new photo's CDN 410 recovery",async()=>{
    let resolveOld!: (response: Response)=>void;
    const pendingOld = new Promise<Response>(resolve=>{resolveOld=resolve;});
    const second = signed.replace("/p/thumb.webp","/p2/thumb.webp");
    const s3 = "https://s3.cloud.ru/gafus-gallery-private/albums/owner/album/photos/p2/thumb.webp?X-Amz-Signature=test";
    const fetcher = vi.fn(async(input:RequestInfo|URL)=>{
      const path=String(input);
      if(path.startsWith("/api/v1/media-cdn-probe"))
        return decodeURIComponent(path).includes("/p2/thumb.webp")
          ? new Response(null,{status:410}) : pendingOld;
      if(path==="/api/v1/gallery/photos/p2/fallback")
        return new Response(JSON.stringify({success:true,data:{url:s3,source:"cloudru",expiresAt:expiry}}),
          {status:200,headers:{"Content-Type":"application/json"}});
      if(path==="/api/v1/gallery/photos/p/fallback")
        return new Response(null,{status:403});
      throw Error("UNEXPECTED_NETWORK");
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    await act(async()=>{host.querySelector("img")?.dispatchEvent(new Event("error"));});
    await act(async()=>root.render(<GalleryImage url={second} expires={expiry}
      alt="Прогулка 2" photoId="p2" variant="thumb"/>));
    await fail();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(s3);
    await act(async()=>{resolveOld(new Response(null,{status:410}));await new Promise(resolve=>setTimeout(resolve,20));});
    expect(host.querySelector("img")?.getAttribute("src")).toBe(s3);
  });
  it.each([410,503])("asks Hono for per-photo authorized Cloud.ru after CDN %i",async(status)=>{
    const url="https://s3.cloud.ru/gafus-gallery-private/"+
      "albums/owner/album/photos/p/thumb.webp?X-Amz-Signature=test";
    const fetch=vi.fn(async(input:RequestInfo|URL)=>{
      const path=String(input);
      if(path.startsWith("/api/v1/media-cdn-probe"))
        return new Response("retired or failed",{status});
      if(path==="/api/v1/gallery/photos/p/fallback")
        return new Response(JSON.stringify({success:true,data:{url,source:"cloudru",
          expiresAt:expiry}}),{status:200,headers:{"Content-Type":"application/json"}});
      throw Error("UNEXPECTED_NETWORK");
    });
    vi.stubGlobal("fetch",fetch);
    await mount();await fail();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]?.[0])).toBe("/api/v1/gallery/photos/p/fallback");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(url);
    expect(host.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
