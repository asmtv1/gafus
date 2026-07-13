import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const {
  checkVideoAccessMock,
  downloadFileFromCDNMock,
  generateTokenMock,
  getServerSessionMock,
  getVideoManifestInfoMock,
  verifyTokenMock,
} = vi.hoisted(() => ({
  checkVideoAccessMock: vi.fn(),
  downloadFileFromCDNMock: vi.fn(),
  generateTokenMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  getVideoManifestInfoMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "gafus.test", "x-forwarded-proto": "https" })),
}));

vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: checkVideoAccessMock,
  getVideoManifestInfo: getVideoManifestInfoMock,
}));

vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: () => ({
    generateToken: generateTokenMock,
    verifyToken: verifyTokenMock,
  }),
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: downloadFileFromCDNMock,
}));

import { GET } from "./route";

function request(token?: string) {
  const url = token
    ? `https://gafus.test/api/video/video-1/manifest?token=${token}`
    : "https://gafus.test/api/video/video-1/manifest";
  return new NextRequest(url);
}

const params = { params: Promise.resolve({ videoId: "video-1" }) };

describe("GET /api/video/[videoId]/manifest", () => {
  it("requires an authenticated session", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET(request("token-1"), params);

    expect(response.status).toBe(401);
  });

  it("requires a token query parameter", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await GET(request(), params);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Токен не предоставлен" });
  });

  it("rejects invalid tokens before loading video metadata", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    verifyTokenMock.mockReturnValueOnce(null);

    const response = await GET(request("bad-token"), params);

    expect(response.status).toBe(403);
    expect(getVideoManifestInfoMock).not.toHaveBeenCalled();
  });

  it("rewrites segment lines with short-lived signed segment URLs", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    verifyTokenMock.mockReturnValueOnce({ userId: "user-1", videoId: "video-1" });
    getVideoManifestInfoMock.mockResolvedValueOnce({
      hlsManifestPath: "videos/video-1/hls/playlist.m3u8",
      trainerId: "trainer-1",
      transcodingStatus: "COMPLETED",
    });
    checkVideoAccessMock.mockResolvedValueOnce(true);
    downloadFileFromCDNMock.mockResolvedValueOnce(
      Buffer.from("#EXTM3U\n#EXTINF:5,\nsegment-1.ts\n", "utf-8"),
    );
    const response = await GET(request("manifest-token"), params);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "https://gafus.test/api/video/video-1/segment?path=segment-1.ts&token=manifest-token",
    );
    expect(generateTokenMock).not.toHaveBeenCalled();
  });
});
