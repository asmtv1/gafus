import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const {
  checkVideoAccessMock,
  getServerSessionMock,
  getVideoManifestInfoMock,
  streamFileFromCDNMock,
  verifyTokenMock,
} = vi.hoisted(() => ({
  checkVideoAccessMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  getVideoManifestInfoMock: vi.fn(),
  streamFileFromCDNMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: checkVideoAccessMock,
  getVideoManifestInfo: getVideoManifestInfoMock,
}));

vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: () => ({
    verifyToken: verifyTokenMock,
  }),
}));

vi.mock("@gafus/cdn-upload", () => ({
  streamFileFromCDN: streamFileFromCDNMock,
}));

import { GET } from "./route";

function request(query: string, headers?: HeadersInit) {
  return new NextRequest(`https://gafus.test/api/video/video-1/segment?${query}`, { headers });
}

const params = { params: Promise.resolve({ videoId: "video-1" }) };

describe("GET /api/video/[videoId]/segment", () => {
  it("requires an authenticated session", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET(request("path=segment-1.ts&token=token-1"), params);

    expect(response.status).toBe(401);
  });

  it("rejects path traversal before token verification", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await GET(request("path=..%2Fsecret.ts&token=token-1"), params);

    expect(response.status).toBe(400);
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it("rejects invalid segment file formats", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await GET(request("path=segment-1.mp4&token=token-1"), params);

    expect(response.status).toBe(400);
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it("streams an authorized segment with range support", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    verifyTokenMock.mockReturnValueOnce({ userId: "user-1", videoId: "video-1" });
    getVideoManifestInfoMock.mockResolvedValueOnce({
      hlsManifestPath: "videos/video-1/hls/playlist.m3u8",
      transcodingStatus: "COMPLETED",
    });
    checkVideoAccessMock.mockResolvedValueOnce(true);
    streamFileFromCDNMock.mockResolvedValueOnce({
      contentLength: 4,
      contentRange: "bytes 0-3/10",
      contentType: "video/mp2t",
      isPartialContent: true,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      }),
    });

    const response = await GET(
      request("path=segment-1.ts&token=token-1", {
        origin: "https://gafus.ru",
        range: "bytes=0-3",
      }),
      params,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(streamFileFromCDNMock).toHaveBeenCalledWith(
      "videos/video-1/hls/segment-1.ts",
      "bytes=0-3",
    );
  });
});
