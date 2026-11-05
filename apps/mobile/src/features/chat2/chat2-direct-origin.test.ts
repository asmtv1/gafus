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
vi.mock("@/shared/lib/media/prepareUploadWebp", () => ({
  prepareUploadWebpVariants: vi.fn(async () => ({
    small: {uri:"file:///small.webp",bytes:120,mime:"image/webp",width:360,height:240,dispose:vi.fn()},
    medium:{uri:"file:///full.webp",bytes:240,mime:"image/webp",width:1440,height:960,dispose:vi.fn()},
  })),
}));
vi.mock("@/shared/lib/media/directPhotoUpload", () => ({
  postClientWebp: vi.fn(async () => undefined),
}));
import { prepareUploadWebpVariants } from "@/shared/lib/media/prepareUploadWebp";
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
