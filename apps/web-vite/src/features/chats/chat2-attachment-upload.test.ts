// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { chat2Api } from "./chat2Api";

const file = () => new File([new Uint8Array(128)], "puppy.png", { type: "image/png" });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Chat2 private attachment upload response contract", () => {
  it("accepts the real API 201 envelope with the id inside data", async () => {
    const expected = {
      id: "media_01", name: "puppy.png", kind: "image", mime: "image/png", bytes: 128,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: expected }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat2Api.upload("room_01", file())).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/chats/room_01/attachments");
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(init.headers).toMatchObject({ "X-Gafus-Auth-Transport": "cookie" });
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("rejects malformed or unsuccessful envelopes, not valid 201 uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, data: { name: "puppy.png" } }), { status: 201 },
    )).mockResolvedValueOnce(new Response(
      JSON.stringify({ success: false, error: "Storage unavailable" }), { status: 503 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat2Api.upload("room_01", file())).rejects.toThrow("Не удалось загрузить вложение");
    await expect(chat2Api.upload("room_01", file())).rejects.toThrow("Не удалось загрузить вложение");
  });

  it("uploads V2 originals directly to Cloud.ru, polls READY and registers a message attachment", async () => {
    vi.stubEnv("VITE_CHAT2_MEDIA_V2", "true");
    const mediaId = "00000000-0000-4000-8000-000000000006";
    const attached = { id: "attached_6", name: "puppy.png", kind: "image", mime: "image/webp", bytes: 128 };
    const seen: string[] = [];
    const mocked = vi.fn().mockImplementation((uri: string, init?: RequestInit) => {
      seen.push(uri);
      if (uri.endsWith("/reserve")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { mediaId, upload: {
          method: "POST", url: "https://s3.cloud.ru/gafus-chat2-media-2026",
          fields: { key: "chat2/test/incoming/source.png", "Content-Type": "image/png" },
        } },
      }), { status: 201 }));
      if (uri === "https://s3.cloud.ru/gafus-chat2-media-2026") {
        expect(init?.credentials).toBe("omit");
        expect(init?.body).toBeInstanceOf(FormData);
        expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (uri.endsWith("/confirm")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { mediaId, status: "QUEUED" },
      }), { status: 200 }));
      if (uri.endsWith("/attach")) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: attached,
      }), { status: 201 }));
      if (uri.endsWith(mediaId)) return Promise.resolve(new Response(JSON.stringify({
        success: true, data: { mediaId, status: "READY" },
      }), { status: 200 }));
      throw Error("Unexpected upload endpoint: " + uri);
    });
    vi.stubGlobal("fetch", mocked);
    await expect(chat2Api.upload("room_01", file())).resolves.toEqual(attached);
    expect(seen).toHaveLength(5);
    expect(seen).not.toContain("/api/v1/chats/room_01/attachments");
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
