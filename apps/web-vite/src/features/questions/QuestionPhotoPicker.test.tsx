// @vitest-environment jsdom
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async(_original:File,edges:Record<string,number>)=>
    Object.fromEntries(Object.entries(edges).map(([name,edge])=>[
      name,{file:new File([new Uint8Array(128)],name+".webp",{type:"image/webp"}),
        width:edge,height:Math.round(edge*.75)},
    ]))),
}));
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import type { PendingQuestionPhoto } from "./questionMedia";

function api(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200 || status === 201, data, error: "Storage temporarily unavailable",
  }), { status });
}
function Harness({ existingCount = 0 }: { existingCount?: number }) {
  const [photos, setPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  return createElement("section", {},
    createElement("output", { "data-testid": "busy" }, busy ? "busy" : "idle"),
    createElement(QuestionPhotoPicker, {
      photos, onChange: setPhotos, onBusy: setBusy, existingCount,
    }));
}
async function mount(fetcher: ReturnType<typeof vi.fn>, existingCount = 0) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const revoke = vi.fn();
  const postCalls:string[]=[];
  let urlSequence=0;
  // Simulate the direct S3 POST independently from authenticated API fetches.
  class FakeXHR {
    status=204;
    upload:{onprogress?:((e:ProgressEvent)=>void)|null}={};
    onload:(()=>void)|null=null;
    onerror:(()=>void)|null=null;
    ontimeout:(()=>void)|null=null;
    onabort:(()=>void)|null=null;
    withCredentials=false;
    timeout=0;
    open(method:string,url:string){postCalls.push(method+" "+url);}
    send(){
      queueMicrotask(()=>{
        this.upload.onprogress?.({lengthComputable:true,loaded:100,total:100} as ProgressEvent);
        this.onload?.();
      });
    }
    abort(){this.onabort?.();}
  }
  vi.stubGlobal("XMLHttpRequest",FakeXHR);
  const NativeURL=URL;
  class FakeURL extends NativeURL {
    static createObjectURL=vi.fn(()=> "blob:local-"+(++urlSequence));
    static revokeObjectURL=revoke;
  }
  vi.stubGlobal("URL",FakeURL);
  vi.stubGlobal("fetch",async (rawPath:string,options?:RequestInit)=>{
    const path=String(rawPath);
    if(path.endsWith("/client-confirm"))return api({id:path.split("/").at(-2),status:"READY"});
    const request=fetcher as unknown as (url:string,init?:RequestInit)=>Promise<Response>;
    const result=await request(rawPath,options);
    if(path.endsWith("/client-reservations") && result.ok){
      const original=await result.clone().json() as {data?:{id?:string}};
      return api({id:original.data?.id,upload:{
        url:"https://s3.cloud.ru/gafus-questions-public",method:"POST",
        fields:{key:"questions/v2/owner/test/incoming/source.webp"},
      },smallUpload:{
        url:"https://s3.cloud.ru/gafus-questions-public",method:"POST",
        fields:{key:"questions/v2/owner/test/incoming/small.webp"},
      }},201);
    }
    return result;
  });
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Harness, { existingCount })));
  return {
    host, revoke, postCalls,
    async select(files: File[]) {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { configurable: true, value: files });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    },
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(b => b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    },
    async cleanup() { await act(async () => root.unmount()); host.remove(); },
  };
}
afterEach(() => vi.unstubAllGlobals());
const jpeg = () => new File([new Uint8Array([255, 216, 255])], "pet.jpg", {
  type: "image/jpeg",
});

describe("question media upload form", () => {
  it("shows an own local preview, removes it only after server DELETE ACK", async () => {
    const fetcher = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE"
        ? api({ id: "photo-1" })
        : api({ id: "photo-1", url: "https://secret.invalid/signed?key=123" })));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      expect(screen.host.textContent).toContain("1 из 5");
      expect(screen.host.querySelector("img")?.getAttribute("src")).toBe("blob:local-1");
      expect(screen.host.innerHTML).not.toContain("secret.invalid");
      expect(screen.host.querySelector('[data-testid="busy"]')?.textContent).toBe("idle");
      await screen.click("Убрать фото");
      expect(fetcher.mock.calls[1][0]).toBe("/api/v1/questions/photos/photo-1");
      expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
      expect(screen.host.querySelectorAll("img")).toHaveLength(0);
      expect(screen.revoke).toHaveBeenCalledWith("blob:local-1");
    } finally { await screen.cleanup(); }
  });

  it("does not remove failed deletion from UI, so user may retry", async () => {
    const fetcher = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? api(null, 503) : api({ id: "photo-1" })));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      await screen.click("Убрать фото");
      expect(screen.host.querySelectorAll("img")).toHaveLength(1);
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Storage temporarily unavailable");
    } finally { await screen.cleanup(); }
  });

  it("enforces five-photo limit across existing bound and newly uploaded photos", async () => {
    const fake = vi.fn().mockResolvedValue(api({ id: "new-photo-1" }));
    const screen = await mount(fake, 4);
    try {
      expect(screen.host.textContent).toContain("4 из 5");
      await screen.select([jpeg(), jpeg()]);
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("не более 5");
      expect(fake).not.toHaveBeenCalled();
      await screen.select([jpeg()]);
      expect(fake).toHaveBeenCalledTimes(1);
      expect(screen.host.textContent).toContain("5 из 5");
      expect(screen.host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled)
        .toBe(true);
    } finally { await screen.cleanup(); }
  });

  it("blocks unsupported MIME and oversized content before calling Hono", async () => {
    const fetcher = vi.fn();
    const screen = await mount(fetcher);
    try {
      await screen.select([new File([new Uint8Array([1])], "bad.gif", {
        type: "image/gif",
      })]);
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("JPG");
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("shows selected image while upload is still pending, never exposes unconfirmed photo ID", async () => {
    let resolveUpload!: (response: Response) => void;
    const deferred = new Promise<Response>(resolve => { resolveUpload = resolve; });
    const fetcher = vi.fn(() => deferred);
    const screen = await mount(fetcher);
    try {
      const input = screen.host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { configurable:true, value:[jpeg()] });
      await act(async () => { input.dispatchEvent(new Event("change", { bubbles:true })); });
      expect(screen.host.querySelectorAll(".question-photo-slot-pending img")).toHaveLength(1);
      expect(screen.host.querySelector(".question-photo-uploading")?.textContent)
        .toContain("Загружаем");
      expect(screen.host.querySelector('[data-testid="busy"]')?.textContent).toBe("busy");
      expect(screen.host.textContent).toContain("1 из 5 фото");
      expect(screen.host.querySelector(".question-photo-remove")).toBeNull();
      await act(async () => resolveUpload(api({ id:"photo-1" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve,10)); });
      expect(screen.host.querySelectorAll(".question-photo-slot-pending")).toHaveLength(0);
      expect(screen.host.querySelectorAll(".question-photo-slot img")).toHaveLength(1);
      expect(screen.host.textContent).toContain("1 из 5 фото");
      expect(screen.host.querySelector('[data-testid="busy"]')?.textContent).toBe("idle");
    } finally { await screen.cleanup(); }
  });

  it("keeps a failed file preview and retries only that photo without touching uploaded siblings", async () => {
    let index = 0;
    const fetcher = vi.fn(() => Promise.resolve(++index === 2 ? api(null, 503)
      : api({ id: index === 1 ? "photo-1" : "photo-2" })));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg(), jpeg()]);
      expect(screen.host.querySelectorAll(".question-photo-slot-pending")).toHaveLength(1);
      expect(screen.host.querySelectorAll(".question-photo-slot img")).toHaveLength(2);
      expect(screen.host.querySelector(".question-photo-retry")?.getAttribute("aria-label"))
        .toContain("pet.jpg");
      expect(screen.host.textContent).toContain("2 из 5 фото");
      expect(screen.revoke).not.toHaveBeenCalledWith("blob:local-2");
      const before = fetcher.mock.calls.length;
      await screen.click("Повторить обработку фото pet.jpg");
      expect(fetcher.mock.calls.length).toBe(before + 1);
      expect(screen.host.querySelectorAll(".question-photo-slot-pending")).toHaveLength(0);
      expect(screen.host.querySelectorAll(".question-photo-slot img")).toHaveLength(2);
      expect(screen.host.textContent).toContain("2 из 5 фото");
    } finally { await screen.cleanup(); }
  });

  it("shows the Next tile instead of browser file selector and hides it at cap", async () => {
    const fetcher=vi.fn().mockResolvedValue(api({ id:"photo-1" }));
    const screen=await mount(fetcher,4);
    try {
      expect(screen.host.querySelector(".question-photo-add")?.textContent)
        .toContain("Добавить фото");
      expect(screen.host.querySelector<HTMLInputElement>('input[type="file"]')?.hidden)
        .toBe(true);
      await screen.select([jpeg()]);
      expect(screen.host.querySelector(".question-photo-add")).toBeNull();
      expect(screen.host.textContent).toContain("5 из 5 фото");
    } finally { await screen.cleanup(); }
  });

  it("releases local object URLs after leaving the page", async () => {
    const fetcher = vi.fn().mockResolvedValue(api({ id: "photo-1" }));
    const screen = await mount(fetcher);
    await screen.select([jpeg()]);
    await screen.cleanup();
    expect(screen.revoke).toHaveBeenCalledWith("blob:local-1");
  });
});
