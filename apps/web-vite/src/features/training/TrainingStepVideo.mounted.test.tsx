// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestTrainingStepPlayback, safeTrainingVideoEmbed, supportsSignedTrainingVideoPreview,
  TrainingStepVideo,
} from "./TrainingStepVideo";

const hlsMocks = vi.hoisted(() => ({
  loadSource: vi.fn(), attachMedia: vi.fn(), destroy: vi.fn(), on: vi.fn(),
  startLoad: vi.fn(), recoverMediaError: vi.fn(), supported: true,
}));
vi.mock("hls.js", () => ({
  default: class FakeHls {
    static isSupported() { return hlsMocks.supported; }
    static Events = { ERROR: "error" };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    startLoad = hlsMocks.startLoad;
    recoverMediaError = hlsMocks.recoverMediaError;
    loadSource = hlsMocks.loadSource;
    attachMedia = hlsMocks.attachMedia;
    destroy = hlsMocks.destroy;
    on = hlsMocks.on;
  },
}));
const answer = (url: string, status = 200) => new Response(JSON.stringify({
  success: status === 200,
  ...(status === 200 ? { data: { url } } : { error: "PRIVATE_BACKEND_ERROR" }),
}), { status });
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function render() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <TrainingStepVideo title="Покажи команду"
      originalUrl="https://storage.yandexcloud.net/gafus-media/step.mp4" />
  </QueryClientProvider>));
  await flush();
}
async function click() {
  const button = host.querySelector<HTMLButtonElement>("button");
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient();
  vi.clearAllMocks();
  hlsMocks.supported = true;
  // jsdom has no media decoder; emulate only the browser play Promise. Real
  // MP4 and HLS playback is verified separately by the Chromium fixtures.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("training step playback uses protected Hono ticket only when clicked", () => {
  it("loads ACL-signed thumbnail via GET when step opens, no playback POST until Play", async () => {
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video_1/original.mp4";
    const poster = "https://signed.example/thumbnail.jpg?sig=opaque";
    const fetcher = vi.fn(async(path:string, _options:RequestInit) => {
      if (path.startsWith("/api/v1/training/video/preview?")) return new Response(
        JSON.stringify({success:true,data:{posterUrl:poster}}), {status:200});
      if (path === "/api/v1/training/video/url") return answer("https://cdn.example/video.mp4");
      throw Error("Unexpected: "+path);
    });
    vi.stubGlobal("fetch",fetcher);
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingStepVideo title="Изучаем движение" originalUrl={original} />
    </QueryClientProvider>));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [previewPath, previewOptions] = fetcher.mock.calls[0];
    expect(previewPath).toBe("/api/v1/training/video/preview?videoUrl="+
      encodeURIComponent(original));
    expect(previewOptions).toMatchObject({method:"GET",credentials:"include",cache:"no-store"});
    expect(host.querySelector(".training-video-poster")?.getAttribute("src")).toBe(poster);
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector(".training-video-play-overlay")).not.toBeNull();
    await click();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(host.querySelector("video")).not.toBeNull();
  });

  it("fails closed for preview 403 and never fetches video before clicking Play", async () => {
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video_1/original.mp4";
    const fetcher = vi.fn(async(_path:string, _options:RequestInit)=>new Response(JSON.stringify({
      success:false,code:"FORBIDDEN",error:"No access",
    }),{status:403}));
    vi.stubGlobal("fetch",fetcher);
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingStepVideo title="Чужое видео" originalUrl={original} />
    </QueryClientProvider>));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(host.querySelector(".training-video-poster")).toBeNull();
    expect(host.querySelector(".training-video-play-overlay")).not.toBeNull();
    expect(host.querySelector("video")).toBeNull();
  });

  it("a stale preview GET from previous owner step must never repaint new step", async () => {
    const first = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video_1/a.mp4";
    const second = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video_2/b.mp4";
    let resolveOld!: (response:Response)=>void;
    const pending = new Promise<Response>(resolve=>{resolveOld=resolve;});
    const fetcher = vi.fn()
      .mockImplementationOnce(()=>pending)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success:true,data:{posterUrl:"https://signed.example/new.jpg"},
      }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const paint=async(originalUrl:string)=>{
      await act(async()=>root.render(<QueryClientProvider client={cache}>
        <TrainingStepVideo title="Параллельные шаги" originalUrl={originalUrl} />
      </QueryClientProvider>));
      await flush();
    };
    await paint(first);
    await paint(second);
    expect(host.querySelector(".training-video-poster")?.getAttribute("src"))
      .toBe("https://signed.example/new.jpg");
    await act(async()=>resolveOld(new Response(JSON.stringify({
      success:true,data:{posterUrl:"https://signed.example/old-private.jpg"},
    }),{status:200})));
    await flush();
    expect(host.innerHTML).not.toContain("old-private");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("allows preview only for exact trusted video storage origins", () => {
    expect(supportsSignedTrainingVideoPreview(
      "https://storage.yandexcloud.net/gafus-media/uploads/trainers/x/videocourses/v/y.mp4"))
      .toBe(true);
    expect(supportsSignedTrainingVideoPreview(
      "https://gafus-media.storage.yandexcloud.net/uploads/trainers/x/videocourses/v/y.mp4"))
      .toBe(true);
    for (const url of ["javascript:alert(1)",
      "https://storage.yandexcloud.net.evil.test/gafus-media/uploads/trainers/x/a.mp4",
      "https://storage.yandexcloud.net/otherbucket/uploads/trainers/x/a.mp4",
      "https://youtube.com/watch?v=abcdefghijk"]) {
      expect(supportsSignedTrainingVideoPreview(url)).toBe(false);
    }
  });

  it("never calls video service during render and passes cookie CSRF transport on click", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer("https://cdn.example/play.mp4"));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
    const frame=host.querySelector(".training-video-player");
    expect(frame?.getAttribute("data-state")).toBe("preview");
    expect(frame?.querySelector(".training-video-preview")).not.toBeNull();
    expect(frame?.querySelector<HTMLButtonElement>(".training-video-play-overlay")
      ?.getAttribute("aria-label")).toBe("Смотреть видео");
    expect(host.querySelector(".button-secondary")).toBeNull();
    await click();
    expect(fetcher).toHaveBeenCalledOnce();
    const [path, request] = fetcher.mock.calls[0];
    expect(path).toBe("/api/v1/training/video/url");
    expect(request).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(request.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
    expect(JSON.parse(request.body)).toEqual({ videoUrl: "https://storage.yandexcloud.net/gafus-media/step.mp4" });
    expect(host.querySelector("video")?.src).toBe("https://cdn.example/play.mp4");
    expect(host.querySelector(".training-video-player")?.getAttribute("data-state"))
      .toBe("ready");
    expect(host.querySelector(".training-video-play-overlay")).toBeNull();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("uses the Hono-authorized thumbnail only after clicking the permanent player", async () => {
    const poster="https://storage.example/thumbnail.jpg?expires=123&signature=private";
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:{url:"https://cdn.example/video.mp4",posterUrl:poster},
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    await render();
    expect(host.querySelector("video")).toBeNull();
    expect(host.innerHTML).not.toContain("thumbnail.jpg");
    expect(fetcher).not.toHaveBeenCalled();
    await click();
    expect(host.querySelector("video")?.getAttribute("poster")).toBe(poster);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps one preview surface for unsafe poster and for access errors", async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:{url:"https://cdn.example/video.mp4",posterUrl:"javascript:alert(1)"},
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    await render();await click();
    expect(host.querySelector("video")?.hasAttribute("poster")).toBe(false);
    expect(host.querySelector(".training-video-player")).not.toBeNull();
  });
  it("deduplicates double-clicks and does not auto retry an access denial", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer("", 403));
    vi.stubGlobal("fetch", fetcher);
    await render();
    await act(async () => {
      const button = host.querySelector("button")!;
      button.click(); button.click();
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Нет доступа");
    expect(host.querySelector(".training-video-player")?.getAttribute("data-state"))
      .toBe("error");
    expect(host.querySelector(".training-video-retry")).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_ERROR");
  });

  it("initializes HLS.js only after a server-signed .m3u8 ticket", async () => {
    const signed = "https://api.example/api/v1/training/video/v01/manifest.m3u8?token=secret";
    const fetcher = vi.fn().mockResolvedValue(answer(signed));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(hlsMocks.loadSource).not.toHaveBeenCalled();
    await click();
    // Loading the HLS module is asynchronous and can exceed the first DOM
    // flush under a full-suite transform. Wait for the real mocked attach,
    // rather than assuming a fixed delay or faking a call.
    for (let i = 0; i < 30 && hlsMocks.loadSource.mock.calls.length === 0; i++)
      await flush();
    expect(hlsMocks.loadSource).toHaveBeenCalledWith(signed);
    expect(hlsMocks.attachMedia).toHaveBeenCalledOnce();
    expect(host.querySelector("video")?.getAttribute("src")).toBeNull();
    await act(async () => root.unmount());
    expect(hlsMocks.destroy).toHaveBeenCalledOnce();
    // afterEach owns unmount by default; render an empty tree for idempotence.
    root = createRoot(host);
  });

  it("a changed step media URL retires an in-flight old owner ticket", async () => {
    let finishOld!: (response: Response) => void;
    const oldPromise = new Promise<Response>(resolve => { finishOld = resolve; });
    const fetcher = vi.fn()
      .mockImplementationOnce(async () => oldPromise)
      .mockResolvedValueOnce(answer("https://cdn.example/new-play.mp4"));
    vi.stubGlobal("fetch", fetcher);
    await render();
    await act(async () => host.querySelector("button")?.click());
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <TrainingStepVideo title="Новый шаг"
        originalUrl="https://storage.yandexcloud.net/gafus-media/changed.mp4" />
    </QueryClientProvider>));
    await flush();
    expect(host.textContent).toContain("Смотреть видео");
    await click();
    expect(host.querySelector("video")?.src).toBe("https://cdn.example/new-play.mp4");
    await act(async () => finishOld(answer("https://cdn.example/old-leaked.mp4")));
    await flush();
    expect(host.querySelector("video")?.src).toBe("https://cdn.example/new-play.mp4");
    expect(host.innerHTML).not.toContain("old-leaked");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fatal HLS error forgets signed ticket; retry needs a new click", async () => {
    const first = "https://api.example/video/v1/manifest.m3u8?token=old";
    const next = "https://api.example/video/v1/manifest.m3u8?token=new";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(answer(first))
      .mockResolvedValueOnce(answer(next));
    vi.stubGlobal("fetch", fetcher);
    await render();
    await click();
    const errorEvent = hlsMocks.on.mock.calls.find(([name]) => name === "error");
    expect(errorEvent).toBeDefined();
    await act(async () => errorEvent?.[1]("error", { fatal: true }));
    await flush();
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).toContain("Повторить видео");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(hlsMocks.loadSource).toHaveBeenLastCalledWith(next);
  });

  it("uses native Safari/iOS HLS and initiates playback after owner ticket", async () => {
    hlsMocks.supported=false;
    vi.spyOn(HTMLMediaElement.prototype,"canPlayType").mockReturnValue("maybe");
    const signed="https://api.example/video/v1/manifest.m3u8?token=valid";
    const fetcher=vi.fn().mockResolvedValue(answer(signed));
    vi.stubGlobal("fetch",fetcher);
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    await click();
    for(let i=0;i<15&&!host.querySelector("video")?.getAttribute("src");i++)
      await flush();
    expect(host.querySelector("video")?.getAttribute("src")).toBe(signed);
    expect(hlsMocks.loadSource).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("recovers one HLS network error, then requires a new authorized ticket", async () => {
    const fetcher=vi.fn().mockResolvedValue(answer(
      "https://api.example/video/v1/manifest.m3u8?token=valid"));
    vi.stubGlobal("fetch", fetcher);
    await render();await click();
    const event=hlsMocks.on.mock.calls.find(([name])=>name==="error")?.[1];
    expect(event).toBeDefined();
    await act(async()=>event?.("error",{fatal:true,type:"networkError"}));
    expect(hlsMocks.startLoad).toHaveBeenCalledOnce();
    expect(host.querySelector("video")).not.toBeNull();
    await act(async()=>event?.("error",{fatal:true,type:"networkError"}));
    await flush();
    expect(hlsMocks.startLoad).toHaveBeenCalledOnce();
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector(".training-video-retry")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("recovers one HLS decoding error without re-requesting the access token", async () => {
    const fetcher=vi.fn().mockResolvedValue(answer(
      "https://api.example/video/v1/manifest.m3u8?token=valid"));
    vi.stubGlobal("fetch", fetcher);
    await render();await click();
    const event=hlsMocks.on.mock.calls.find(([name])=>name==="error")?.[1];
    await act(async()=>event?.("error",{fatal:true,type:"mediaError"}));
    expect(hlsMocks.recoverMediaError).toHaveBeenCalledOnce();
    expect(host.querySelector("video")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("completion resets progress after pending save, never restores a stale near-end position", async () => {
    let release!: (response:Response)=>void;
    const inflight=new Promise<Response>(resolve=>{release=resolve;});
    const fetcher=vi.fn(async(path:string,options:RequestInit)=>{
      if(path==="/api/v1/training/video/url")return new Response(JSON.stringify({
        success:true,data:{url:"https://cdn.example/video.mp4",videoId:"video_1"},
      }),{status:200});
      if(path==="/api/v1/training/video/video_1/progress"&&options.method==="GET")
        return new Response(JSON.stringify({success:true,data:{lastPositionSec:0}}),{status:200});
      if(path==="/api/v1/training/video/video_1/progress"&&options.method==="POST"){
        const {positionSec}=JSON.parse(String(options.body));
        if(positionSec===114)return inflight;
        return new Response(JSON.stringify({success:true}),{status:200});
      }
      throw Error("Unexpected progress route: "+path);
    });
    vi.stubGlobal("fetch",fetcher);
    await render();await click();
    const player=host.querySelector<HTMLVideoElement>("video")!;
    player.currentTime=114;
    await act(async()=>player.dispatchEvent(new Event("timeupdate")));
    expect(fetcher.mock.calls.filter(([path,options])=>path.endsWith("/progress") &&
      options.method==="POST")).toHaveLength(1);
    await act(async()=>player.dispatchEvent(new Event("ended")));
    expect(fetcher.mock.calls.filter(([path,options])=>path.endsWith("/progress") &&
      options.method==="POST")).toHaveLength(1);
    await act(async()=>release(new Response(JSON.stringify({success:true}),{status:200})));
    await flush();await flush();
    await act(async()=>player.dispatchEvent(new Event("pause")));
    await flush();
    const values=fetcher.mock.calls.filter(([path,options])=>path.endsWith("/progress") &&
      options.method==="POST").map(([,options])=>JSON.parse(String(options.body)).positionSec);
    expect(values).toEqual([114,0]);
    expect(host.querySelector(".training-video-player")?.getAttribute("data-state"))
      .toBe("ready");
  });
  it("restores real server video position and throttles owner-scoped progress POST", async () => {
    const fetcher = vi.fn(async (path: string, options: RequestInit) => {
      if (path === "/api/v1/training/video/url") return new Response(JSON.stringify({
        success: true, data: { url: "https://cdn.example/play.mp4", videoId: "video_1" },
      }), { status: 200 });
      if (path === "/api/v1/training/video/video_1/progress" && options.method === "GET") {
        return new Response(JSON.stringify({
          success: true, data: { lastPositionSec: 31 },
        }), { status: 200 });
      }
      if (path === "/api/v1/training/video/video_1/progress" && options.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw Error("Unexpected training video path: " + path);
    });
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    await click();
    expect(fetcher.mock.calls.filter(([path]) => path.endsWith("/progress") &&
      path.includes("video_1"))).toHaveLength(1);
    const player = host.querySelector<HTMLVideoElement>("video")!;
    expect(player).not.toBeNull();
    Object.defineProperty(player, "duration", { configurable: true, value: 120 });
    await act(async () => player.dispatchEvent(new Event("loadedmetadata")));
    expect(player.currentTime).toBe(31);
    player.currentTime = 48;
    await act(async () => player.dispatchEvent(new Event("timeupdate")));
    await flush();
    player.currentTime = 50;
    await act(async () => player.dispatchEvent(new Event("timeupdate")));
    await flush();
    const posted = fetcher.mock.calls.filter(([path, options]) =>
      path.endsWith("/progress") && options.method === "POST");
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0][1].body as string)).toEqual({ positionSec: 48 });
    expect(posted[0][1].credentials).toBe("include");
  });

  it("embeds only strict provider IDs; lookalikes and script origins are rejected", () => {
    expect(safeTrainingVideoEmbed("https://youtu.be/abcdefghijk"))
      .toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(safeTrainingVideoEmbed("https://www.youtube.com/watch?v=abcdefghijk&list=secret"))
      .toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(safeTrainingVideoEmbed("https://vimeo.com/123456"))
      .toBe("https://player.vimeo.com/video/123456");
    expect(safeTrainingVideoEmbed("https://rutube.ru/video/abcdef1234567890abcdef1234567890/"))
      .toBe("https://rutube.ru/play/embed/abcdef1234567890abcdef1234567890");
    expect(safeTrainingVideoEmbed("https://vkvideo.ru/video-123_456"))
      .toBe("https://vkvideo.ru/video_ext.php?oid=-123&id=456");
    for (const unsafe of ["javascript:alert(1)",
      "https://youtube.com.evil.test/watch?v=abcdefghijk",
      "https://youtu.be/abc<script>",
      "https://vimeo.com.evil.test/123456",
      "https://user:pass@youtube.com/watch?v=abcdefghijk"]) {
      expect(safeTrainingVideoEmbed(unsafe)).toBeNull();
    }
  });

  it("mounts no external iframe until Hono verifies video access on click", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer("https://youtu.be/abcdefghijk"));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(host.querySelector("iframe")).toBeNull();
    await click();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const iframe = host.querySelector("iframe");
    expect(iframe?.getAttribute("src"))
      .toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(host.querySelector("video")).toBeNull();
  });

  it("denies unsafe source before POST and untrusted playback ticket after POST", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer("javascript:alert(1)"));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestTrainingStepPlayback("javascript:alert(1)"))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_SOURCE");
    expect(fetcher).not.toHaveBeenCalled();
    await render();
    await click();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.querySelector("video")).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
