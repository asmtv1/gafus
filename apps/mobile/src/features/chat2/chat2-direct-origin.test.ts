import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  apiClient: vi.fn(),
  state: {
    isAuthenticated: true,
    isLoading: false,
    user: { id: "sender" },
  },
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: mock.apiClient }));
vi.mock("@/shared/config", () => ({ API_BASE_URL: "https://api.gafus.ru" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("@/shared/lib/api/client-context", () => ({ getMobileClientHeaders: () => ({}) }));
vi.mock("@/shared/stores", () => ({
  useAuthStore: { getState: () => mock.state },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: "sender", authEpoch: "dev-epoch" }),
  },
}));
vi.mock("./s3Upload", () => ({ postChat2FileToS3: vi.fn(async () => undefined) }));
vi.mock("@/shared/lib/media/prepareVideoPosterWebp", () => ({
  sanitizeVideoPosterWebp: vi.fn(async () => 150),
  prepareVideoPosterWebp: vi.fn(async () => ({
    uri: "file:///poster.webp", width: 480, height: 270, bytes: 150,
    mime: "image/webp", dispose: vi.fn(),
  })),
}));
vi.mock("@/shared/lib/media/prepareUploadWebp", () => ({
  sanitizePreparedWebpVariant: vi.fn(async () => false),
  prepareUploadWebpVariants: vi.fn(async () => ({
    small: {uri:"file:///small.webp",bytes:120,mime:"image/webp",width:360,height:240,dispose:vi.fn()},
    medium:{uri:"file:///full.webp",bytes:240,mime:"image/webp",width:1440,height:960,dispose:vi.fn()},
  })),
}));
vi.mock("@/shared/lib/media/directPhotoUpload", () => ({
  postClientWebp: vi.fn(async () => undefined),
}));
import { postChat2FileToS3 } from "./s3Upload";
import { prepareVideoPosterWebp, sanitizeVideoPosterWebp } from "@/shared/lib/media/prepareVideoPosterWebp";
import { prepareUploadWebpVariants, sanitizePreparedWebpVariant } from "@/shared/lib/media/prepareUploadWebp";
import { postClientWebp } from "@/shared/lib/media/directPhotoUpload";
import { chat2 } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "http://127.0.0.1:3003");
  mock.apiClient.mockResolvedValue({
    success: true, data: { conversationId: "direct-room" },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Native Chat2 isolated API and direct-profile messaging", () => {
  it("opens the specified recipient via the dedicated Refactor chat origin", async () => {
    expect(await chat2.directByUsername("teamb"))
      .toEqual({ conversationId: "direct-room" });
    expect(mock.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/direct",
      expect.objectContaining({
        method: "POST",
        body: { username: "teamb" },
        chat2Origin: "http://127.0.0.1:3003",
        skipAuthRefreshReplay: true,
      }),
    );
  });

  it("keeps existing direct-by-ID callers working", async () => {
    await chat2.direct("target");
    expect(mock.apiClient).toHaveBeenCalledWith(
      "/api/v1/chats/direct",
      expect.objectContaining({
        body: { userId: "target" },
        chat2Origin: "http://127.0.0.1:3003",
      }),
    );
  });

  it("rejects malformed usernames before making a request", async () => {
    expect(() => chat2.directByUsername("../bad")).toThrow();
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("fails closed for an absent, unsafe or unpaired Chat2 origin", async () => {
    for (const origin of ["", "https://gafus.ru", "http://somewhere.example"]) {
      vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", origin);
      await expect(chat2.directByUsername("teamb")).rejects.toThrow();
    }
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("allows production Chat2 on the explicitly production-bound mobile client", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    await expect(chat2.directByUsername("teamb")).resolves.toEqual({ conversationId: "direct-room" });
    expect(mock.apiClient).toHaveBeenCalledWith(
      "/api/v1/chats/direct",
      expect.objectContaining({ chat2Origin: "https://api.gafus.ru" }),
    );
  });

  it("uses V2 for production media even in a development build", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    mock.apiClient.mockResolvedValueOnce({ success: false, error: "V2 unavailable" });
    await expect(chat2.upload("room_1", {
      uri: "file:///image.jpg", name: "image.png", mime: "image/jpeg", size: 128,
      width:1440,height:960,
    })).rejects.toThrow("V2 unavailable");
    expect(mock.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/room_1/media/v2/client-reserve",
      expect.objectContaining({ chat2Origin: "https://api.gafus.ru" }),
    );
  });

  it("attaches browser/device WebP only after client-confirm READY, never a photo Job",async()=>{
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN","https://api.gafus.ru");
    const mediaId="00000000-0000-4000-8000-000000000000";
    const media={id:"attachment-one",name:"photo.jpg",mime:"image/webp",kind:"image",bytes:240};
    const upload={method:"POST",url:"https://s3.cloud.ru/gafus-chat2-media-2026",fields:{key:"source.webp"}};
    mock.apiClient.mockResolvedValueOnce({success:true,data:{mediaId,upload,smallUpload:upload}})
      .mockResolvedValueOnce({success:true,data:{mediaId,status:"READY"}})
      .mockResolvedValueOnce({success:true,data:media});
    await expect(chat2.upload("room_1",{
      uri:"file:///photo.jpg",name:"photo.jpg",mime:"image/jpeg",size:128,
      width:1440,height:960,
    })).resolves.toEqual(media);
    expect(vi.mocked(prepareUploadWebpVariants)).toHaveBeenCalledWith(
      expect.objectContaining({uri:"file:///photo.jpg"}),{small:360,medium:1440});
    expect(vi.mocked(postClientWebp)).toHaveBeenCalledTimes(2);
    expect(mock.apiClient.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/chats/room_1/media/v2/client-reserve",
      `/api/v1/chats/room_1/media/v2/${mediaId}/client-confirm`,
      `/api/v1/chats/room_1/media/v2/${mediaId}/attach`,
    ]);
    expect(mock.apiClient.mock.calls[0]?.[1]?.body).toMatchObject({
      mime:"image/webp",bytes:240,
    });
  });

  it("uploads already encoded draft photos only on explicit upload, without re-encoding or disposing drafts", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    const mediaId = "00000000-0000-4000-8000-000000000000";
    const media = { id: "draft-photo", name: "photo.webp", mime: "image/webp", kind: "image", bytes: 240 };
    const upload = { method: "POST", url: "https://s3.cloud.ru/gafus-chat2-media-2026", fields: { key: "photo.webp" } };
    const smallDispose = vi.fn(), mediumDispose = vi.fn();
    const preparedVariants = {
      small: { uri: "file:///ready-small.webp", bytes: 120, mime: "image/webp" as const,
        width: 360, height: 240, dispose: smallDispose },
      medium: { uri: "file:///ready-full.webp", bytes: 240, mime: "image/webp" as const,
        width: 1440, height: 960, dispose: mediumDispose },
    };
    // Preparing a draft must not reserve an S3 object.
    expect(mock.apiClient).not.toHaveBeenCalled();
    expect(postClientWebp).not.toHaveBeenCalled();
    mock.apiClient.mockResolvedValueOnce({ success: true, data: { mediaId, upload, smallUpload: upload } })
      .mockResolvedValueOnce({ success: true, data: { mediaId, status: "READY" } })
      .mockResolvedValueOnce({ success: true, data: media });
    await expect(chat2.upload("room_1", {
      uri: preparedVariants.medium.uri, name: "photo.webp", mime: "image/webp",
      size: 240, width: 1440, height: 960, preparedVariants,
    })).resolves.toEqual(media);
    expect(prepareUploadWebpVariants).not.toHaveBeenCalled();
    expect(postClientWebp).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postClientWebp).mock.calls.map(([, file]) => file.uri).sort()).toEqual([
      "file:///ready-full.webp", "file:///ready-small.webp",
    ]);
    expect(smallDispose).not.toHaveBeenCalled();
    expect(mediumDispose).not.toHaveBeenCalled();
  });

  it("rechecks old Android draft WebPs BEFORE Chat2 reserve with correct new byte count", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    const mediaId="00000000-0000-4000-8000-000000000000";
    const preparedVariants = {
      small: {uri:"file:///old-s.webp", bytes:6464, mime:"image/webp" as const,
        width:162, height:360, dispose:vi.fn()},
      medium: {uri:"file:///old-m.webp",bytes:15476,mime:"image/webp" as const,
        width:324,height:720,dispose:vi.fn()},
    };
    vi.mocked(sanitizePreparedWebpVariant).mockImplementation(async variant => {
      if (variant === preparedVariants.small) variant.bytes=5936;
      if (variant === preparedVariants.medium) variant.bytes=14948;
      return true;
    });
    const upload={method:"POST",url:"https://s3.cloud.ru/example",fields:{key:"photo.webp"}};
    mock.apiClient.mockResolvedValueOnce({success:true,data:{mediaId,upload,smallUpload:upload}})
      .mockResolvedValueOnce({success:true,data:{mediaId,status:"READY"}})
      .mockResolvedValueOnce({success:true,data:{id:"photo",kind:"image"}});
    await chat2.upload("room_1", {uri:preparedVariants.medium.uri,
      name:"photo.webp",mime:"image/webp",size:15476,width:324,height:720,preparedVariants});
    expect(vi.mocked(sanitizePreparedWebpVariant).mock.calls.map(([v])=>v.uri)).toEqual([
      "file:///old-s.webp","file:///old-m.webp",
    ]);
    const reserve=mock.apiClient.mock.calls[0]?.[1]?.body;
    expect(reserve).toMatchObject({bytes:14948,mime:"image/webp"});
    const uploads=vi.mocked(postClientWebp).mock.calls.map(([,v])=>v.bytes);
    expect(uploads).toEqual([5936,14948]);
    expect(preparedVariants.small.dispose).not.toHaveBeenCalled();
    expect(preparedVariants.medium.dispose).not.toHaveBeenCalled();
  });

  it("does not reserve or send a Chat2 photo if cached WebP cleanup fails", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    vi.mocked(sanitizePreparedWebpVariant).mockRejectedValueOnce(new Error("broken RIFF"));
    const variants={
      small:{uri:"file:///old-s.webp",bytes:120,width:360,height:240,mime:"image/webp" as const,dispose:vi.fn()},
      medium:{uri:"file:///old-m.webp",bytes:240,width:1440,height:960,mime:"image/webp" as const,dispose:vi.fn()},
    };
    await expect(chat2.upload("room_1",{uri:variants.medium.uri,name:"photo.webp",
      mime:"image/webp",size:240,width:1440,height:960,preparedVariants:variants}))
      .rejects.toThrow("broken RIFF");
    expect(mock.apiClient).not.toHaveBeenCalled();
    expect(postClientWebp).not.toHaveBeenCalled();
  });

  it("keeps Chat2 temporary WebPs until BOTH S3 POSTs settle after one failure", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    const mediaId = "00000000-0000-4000-8000-000000000001";
    const smallDispose = vi.fn(), mediumDispose = vi.fn();
    vi.mocked(prepareUploadWebpVariants).mockResolvedValueOnce({
      small: {uri:"file:///small.webp",mime:"image/webp",width:360,height:240,bytes:120,dispose:smallDispose},
      medium: {uri:"file:///medium.webp",mime:"image/webp",width:1440,height:960,bytes:240,dispose:mediumDispose},
    });
    const upload={method:"POST",url:"https://s3.cloud.ru/example",fields:{key:"source.webp"}};
    mock.apiClient.mockResolvedValueOnce({success:true,data:{mediaId,upload,smallUpload:upload}});
    let release!: () => void;
    const pending=new Promise<void>(resolve=>{release=resolve;});
    vi.mocked(postClientWebp).mockRejectedValueOnce(Error("S3 small failed"))
      .mockImplementationOnce(()=>pending);
    const result=chat2.upload("room_1",{uri:"file:///photo.jpg",name:"photo.jpg",
      mime:"image/jpeg",size:1200,width:1440,height:960});
    await vi.waitFor(()=>expect(postClientWebp).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(smallDispose).not.toHaveBeenCalled();
    expect(mediumDispose).not.toHaveBeenCalled();
    expect(mock.apiClient).toHaveBeenCalledTimes(1);
    release();
    await expect(result).rejects.toThrow("S3 small failed");
    expect(smallDispose).toHaveBeenCalledOnce();
    expect(mediumDispose).toHaveBeenCalledOnce();
    expect(mock.apiClient).toHaveBeenCalledTimes(1);
  });

  it("uploads an already encoded video and its prebuilt cover only on explicit send", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    const mediaId="00000000-0000-4000-8000-000000000007";
    const ticket={method:"POST",url:"https://s3.cloud.ru/gafus-chat2-media-2026",
      fields:{key:"chat2/source.mp4"}};
    const posterTicket={method:"POST",url:"https://s3.cloud.ru/gafus-chat2-media-2026",
      fields:{key:"chat2/poster.webp"}};
    const dispose=vi.fn();
    const preparedPoster={
      uri:"file:///preencoded-poster.webp",mime:"image/webp" as const,
      width:480,height:270,bytes:150,dispose,
    };
    const attachment={id:"ready-video",kind:"video",name:"walk.mp4",mime:"video/mp4",bytes:4000};
    expect(mock.apiClient).not.toHaveBeenCalled();
    expect(postChat2FileToS3).not.toHaveBeenCalled();
    mock.apiClient
      .mockResolvedValueOnce({success:true,data:{mediaId,upload:ticket,posterUpload:posterTicket}})
      .mockResolvedValueOnce({success:true,data:{mediaId,status:"UPLOADED"}})
      .mockResolvedValueOnce({success:true,data:attachment});
    await expect(chat2.upload("room_1",{
      uri:"file:///preencoded-720.mp4",name:"walk.mp4",mime:"video/mp4",
      size:4000,preparedPoster,
    })).resolves.toEqual(attachment);
    expect(vi.mocked(prepareVideoPosterWebp)).not.toHaveBeenCalled();
    expect(postChat2FileToS3).toHaveBeenCalledTimes(1);
    expect(sanitizeVideoPosterWebp).toHaveBeenCalledWith("file:///preencoded-poster.webp");
    expect(vi.mocked(postClientWebp).mock.calls[0]?.[1]).toBe(preparedPoster);
    expect(dispose).not.toHaveBeenCalled();
    expect(mock.apiClient.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/chats/room_1/media/v2/reserve",
      "/api/v1/chats/room_1/media/v2/"+mediaId+"/confirm",
      "/api/v1/chats/room_1/media/v2/"+mediaId+"/attach",
    ]);
  });

  it("blocks PDF uploads to production even in a development build", async () => {
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://api.gafus.ru");
    await expect(chat2.upload("room_1", {
      uri: "file:///document.pdf", name: "document.pdf", mime: "application/pdf", size: 128,
    })).rejects.toThrow("PDF в чате пока недоступен");
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("requires client-reserve WebP even if legacy media flag is disabled",async()=>{
    vi.stubGlobal("__DEV__",false);
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN","https://chat2-refactor.example");
    vi.stubEnv("EXPO_PUBLIC_CHAT2_MEDIA_V2","false");
    mock.apiClient.mockResolvedValueOnce({success:false,error:"V2 is not available"});
    await expect(chat2.upload("room_1",{
      uri:"file:///image.jpg",name:"image.png",mime:"image/jpeg",size:128,
      width:1440,height:960,
    })).rejects.toThrow("V2 is not available");
    expect(mock.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/room_1/media/v2/client-reserve",
      expect.objectContaining({method:"POST",
        body:{name:"image.png",mime:"image/webp",bytes:240},
        chat2Origin:"https://chat2-refactor.example"}),
    );
  });

  it("does not expose PDF to a public release-bucket or legacy upload", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_CHAT2_MEDIA_V2", "true");
    await expect(chat2.upload("room_1", {
      uri: "file:///document.pdf", name: "document.pdf", mime: "application/pdf", size: 128,
    })).rejects.toThrow("PDF в чате пока недоступен");
    expect(mock.apiClient).not.toHaveBeenCalled();
  });


});
