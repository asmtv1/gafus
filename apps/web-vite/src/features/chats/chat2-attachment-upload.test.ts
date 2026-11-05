// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../shared/media/browserVideoPoster",()=>({
  prepareBrowserVideoPoster:vi.fn(async()=>new File([new Uint8Array(500)],"poster.webp",
    {type:"image/webp"})),
}));
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async()=>({
    small:{file:new File([new Uint8Array(120)],"small.webp",{type:"image/webp"}),width:360,height:270},
    medium:{file:new File([new Uint8Array(240)],"medium.webp",{type:"image/webp"}),width:1440,height:1080},
  })),
}));
vi.mock("../../shared/media/browserPhotoUpload",()=>({
  uploadBrowserPhotoWebp:vi.fn(async()=>undefined),
}));
import { chat2Api } from "./chat2Api";
import { uploadBrowserPhotoWebp } from "../../shared/media/browserPhotoUpload";
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";

const file = () => new File([new Uint8Array(128)], "puppy.png", { type: "image/png" });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Chat2 private attachment upload response contract", () => {
  const mediaId="00000000-0000-4000-8000-000000000006";
  const signed={method:"POST",url:"https://s3.cloud.ru/gafus-chat2-media-2026",
    fields:{key:"chat2/room/incoming/source.webp"}};
  it("sends browser-rendered 360/1440 WebP and attaches only after READY",async()=>{
    const attached={id:"attached_6",name:"puppy.png",kind:"image",mime:"image/webp",bytes:240};
    const requests:string[]=[];
    const mocked=vi.fn((uri:string,_init?:RequestInit)=>{
      requests.push(uri);
      if(uri.endsWith("/client-reserve"))return Promise.resolve(new Response(JSON.stringify({
        success:true,data:{mediaId,upload:signed,smallUpload:signed},
      }),{status:201}));
      if(uri.endsWith("/client-confirm"))return Promise.resolve(new Response(JSON.stringify({
        success:true,data:{mediaId,status:"READY"},
      }),{status:200}));
      if(uri.endsWith("/attach"))return Promise.resolve(new Response(JSON.stringify({
        success:true,data:attached,
      }),{status:201}));
      throw Error("Unexpected endpoint "+uri);
    });
    vi.stubGlobal("fetch",mocked);
    await expect(chat2Api.upload("room_01",file())).resolves.toEqual(attached);
    expect(requests).toEqual([
      "/api/v1/chats/room_01/media/v2/client-reserve",
      `/api/v1/chats/room_01/media/v2/${mediaId}/client-confirm`,
      `/api/v1/chats/room_01/media/v2/${mediaId}/attach`,
    ]);
    expect(JSON.parse(String(mocked.mock.calls[0]?.[1]?.body))).toMatchObject({
      name:"puppy.png",mime:"image/webp",bytes:240,
    });
    expect(vi.mocked(prepareBrowserPhotoWebp)).toHaveBeenCalledWith(
      expect.any(File), {small:360,medium:1440});
    expect(vi.mocked(uploadBrowserPhotoWebp)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadBrowserPhotoWebp).mock.calls.map(args=>args[1].type))
      .toEqual(["image/webp","image/webp"]);
    expect(requests.some(uri=>uri.endsWith("/attachments")||uri.endsWith("/reserve")))
      .toBe(false);
  });

  it("consumes pre-encoded draft WebPs only on explicit upload without re-encoding", async () => {
    const prepped = {
      small: {file: new File([new Uint8Array(120)], "small.webp", {type:"image/webp"}), width:360, height:270},
      medium: {file: new File([new Uint8Array(240)], "medium.webp", {type:"image/webp"}), width:1440, height:1080},
    };
    const attached = {id:"attached-prepared",name:"puppy.png",kind:"image",mime:"image/webp",bytes:240};
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (uri: string) => {
      requests.push(uri);
      const payload = uri.endsWith("/client-reserve")
        ? {mediaId,upload:signed,smallUpload:signed}
        : uri.endsWith("/client-confirm") ? {mediaId,status:"READY"} : attached;
      return new Response(JSON.stringify({success:true,data:payload}), {status:201});
    }));
    expect(requests).toHaveLength(0);
    expect(uploadBrowserPhotoWebp).not.toHaveBeenCalled();
    await expect(chat2Api.upload("room_01", file(), prepped)).resolves.toEqual(attached);
    expect(prepareBrowserPhotoWebp).not.toHaveBeenCalled();
    expect(vi.mocked(uploadBrowserPhotoWebp).mock.calls.map(([, stored]) => stored))
      .toEqual([prepped.small.file, prepped.medium.file]);
    expect(requests).toHaveLength(3);
  });

  it("never falls back to legacy photo upload if browser API returns 503",async()=>{
    const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:false,error:"S3 временно недоступен",
    }),{status:503}));
    vi.stubGlobal("fetch",mock);
    await expect(chat2Api.upload("room_01",file())).rejects.toThrow();
    expect(mock).toHaveBeenCalledOnce();
    expect(String(mock.mock.calls[0][0])).toContain("/client-reserve");
    expect(vi.mocked(uploadBrowserPhotoWebp)).not.toHaveBeenCalled();
  });

  it("does not attach a photo when the API refuses READY",async()=>{
    const mock=vi.fn((uri:string)=>Promise.resolve(new Response(JSON.stringify({
      success:true,data:uri.endsWith("/client-reserve")
        ? {mediaId,upload:signed,smallUpload:signed}
        : {mediaId,status:"PROCESSING"},
    }),{status:200})));
    vi.stubGlobal("fetch",mock);
    await expect(chat2Api.upload("room_01",file())).rejects.toThrow("не подтвердил");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls.some(([uri])=>String(uri).endsWith("/attach"))).toBe(false);
  });

  it("does not put private PDF attachments into the public V2 bucket", async () => {
    vi.stubEnv("PROD", true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pdf = new File([new Uint8Array(128)], "details.pdf", { type: "application/pdf" });
    await expect(chat2Api.upload("room_01", pdf)).rejects.toThrow("PDF в чате пока недоступен");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows MP4 and sends it as a standard Chat 2.0 attachment", async () => {
    const video = new File([new Uint8Array(128)], "walk.mp4", { type: "video/mp4" });
    const expected = { id: "video_1", kind: "video", mime: "video/mp4", name: "walk.mp4", bytes: 128 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: expected }), { status: 201 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat2Api.upload("room_01", video)).resolves.toEqual(expected);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });
});

describe("Chat2 browser-prepared MP4 reservation", () => {
  it("does not reserve or send unprepared MP4 when browser-side processing fails", async () => {
    vi.stubEnv("VITE_CHAT2_MEDIA_V2","true");
    const fetchMock=vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    const source=new File([new Uint8Array(6500)],"dog.mp4",{type:"video/mp4"});
    await expect(chat2Api.upload("room-1",source))
      .rejects.toThrow("LOCAL_VIDEO_BROWSER_UNSUPPORTED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends compressed 720p bytes to S3 and preserves the V2 reservation contract", async () => {
    vi.stubEnv("VITE_CHAT2_MEDIA_V2", "true");
    vi.stubGlobal("VideoDecoder", class {});
    vi.stubGlobal("VideoEncoder", class {});
    const prepared = new File([new Uint8Array(2400)], "chat-720.mp4", { type: "video/mp4" });
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate() {}
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: { kind: "result", file: prepared } } as MessageEvent)); }
    }
    vi.stubGlobal("Worker", FakeWorker);
    const id = "00000000-0000-4000-8000-000000000006";
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/reserve")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { mediaId: id, upload: {
          method: "POST", url: "https://s3.cloud.ru/gafus-chat2-media-2026",
          fields: { key: "chat2/test/incoming/source.mp4", "Content-Type": "video/mp4" },
        },posterUpload:{method:"POST",url:"https://s3.cloud.ru/gafus-chat2-media-2026",
          fields:{key:"chat2/test/incoming/poster.webp","Content-Type":"image/webp"}} },
      }), { status: 201 }));
      if (url === "https://s3.cloud.ru/gafus-chat2-media-2026")
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith("/confirm")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { mediaId: id, status: "UPLOADED" },
      }), { status: 200 }));
      if (url.endsWith("/attach")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { id: "file-1", kind: "video", mime: "video/mp4", bytes: 2400 },
      }), { status: 201 }));
      throw Error("Unexpected endpoint " + url);
    }));
    const original = new File([new Uint8Array(6500)], "chat-original.mp4", { type: "video/mp4" });
    await chat2Api.upload("room-1", original);
    const data = JSON.parse(String(requests[0]?.init?.body));
    expect(data).toMatchObject({ name: "chat-720.mp4", mime: "video/mp4", bytes: 2400 });
    expect((requests[1]?.init?.body as FormData).get("file")).toMatchObject({name: prepared.name, size: prepared.size, type: prepared.type});
    expect(requests.map(r => r.url).slice(-2)).toEqual([
      "/api/v1/chats/room-1/media/v2/" + id + "/confirm",
      "/api/v1/chats/room-1/media/v2/" + id + "/attach",
    ]);
  });
});
