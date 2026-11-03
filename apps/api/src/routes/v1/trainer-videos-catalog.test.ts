import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerVideosCatalogRoutes, type TrainerVideoCatalogPorts,
} from "./trainer-videos-catalog";

const secret = "private-storage-path-should-not-appear";
const item = {
  id: "video_A", trainerId: "trainer_A", relativePath: secret,
  originalName: "Первое занятие.mp4", mimeType: "video/mp4", fileSize: 1_048_576,
  displayName: null, durationSec: 61, hlsManifestPath: secret, thumbnailPath: secret,
  transcodingStatus: "COMPLETED" as const, transcodingError: null,
  createdAt: new Date("2026-11-03T09:00:00.000Z"), updatedAt: new Date("2026-11-03T09:00:00.000Z"),
};
function setup(role: "TRAINER" | "ADMIN" | "USER" = "TRAINER") {
  const ports: TrainerVideoCatalogPorts = {
    list: vi.fn(async () => [item]),
    authorized: vi.fn(async (_videoId, who) => who === "trainer_A" ? {
      transcodingStatus: "COMPLETED", hlsManifestPath: secret,
    } : null),
    playbackAccess: vi.fn(async () => true),
    manifest: vi.fn(async () => ({
      trainerId: "trainer_A", thumbnailPath: secret,
      transcodingStatus: "COMPLETED", hlsManifestPath: secret,
    })),
    poster: vi.fn(async () => "https://storage.yandexcloud.net/private-poster?signature=abc"),
    signedToken: vi.fn(() => "signed-ticket"),
  } as TrainerVideoCatalogPorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer_A", username: "trainer_A", role });
    await next();
  });
  app.route("/videos", createTrainerVideosCatalogRoutes(ports));
  return { app, ports };
}
const path = "/videos/catalog";
describe("trainer videos: secure Next-style card catalog + signed playback", () => {
  it("returns own original filenames, media availability, size and date but not keys", async () => {
    const { app, ports } = setup();
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const json = await response.json();
    expect(json.data.videos).toEqual([{
      id: "video_A", originalName: "Первое занятие.mp4", displayName: null,
      fileSize: 1_048_576, durationSec: 61, transcodingStatus: "COMPLETED",
      createdAt: "2026-11-03T09:00:00.000Z", hasThumbnail: true,
      hasPlayback: true, ownerName: null,
    }]);
    expect(JSON.stringify(json)).not.toContain(secret);
    expect(ports.list).toHaveBeenCalledWith("trainer_A", { forAdmin: false });
  });
  it("denies nonstaff, rejects client-side owner overrides", async () => {
    const { app, ports } = setup("USER");
    expect((await app.request(path)).status).toBe(403);
    expect((await app.request("/videos/playback/video_A", { method: "POST" })).status).toBe(403);
    expect((await app.request("/videos/poster/video_A")).status).toBe(403);
    expect(ports.list).not.toHaveBeenCalled();
    const trusted = setup();
    expect((await trusted.app.request(path + "?trainerId=someone-else")).status).toBe(400);
    expect(trusted.ports.list).not.toHaveBeenCalled();
  });
  it("admin receives owner label; never discloses media storage path", async () => {
    const { app, ports } = setup("ADMIN");
    vi.mocked(ports.list).mockResolvedValueOnce([{
      ...item, trainer: { username: "lana", fullName: "Кинолог" },
    }]);
    const response = await app.request(path);
    const json = await response.json();
    expect(json.data.videos[0].ownerName).toBe("Кинолог");
    expect(ports.list).toHaveBeenCalledWith("trainer_A", { forAdmin: true });
    expect(JSON.stringify(json)).not.toContain(secret);
  });
  it("requires ownership, playback entitlement and ready HLS before issuing ticket", async () => {
    const { app, ports } = setup();
    const success = await app.request("/videos/playback/video_A", { method: "POST" });
    expect(success.status).toBe(200);
    expect((await success.json()).data.url).toBe(
      "/api/v1/training/video/video_A/manifest.m3u8?token=signed-ticket");
    expect(ports.signedToken).toHaveBeenCalledWith("video_A", "trainer_A");
    vi.mocked(ports.playbackAccess).mockResolvedValueOnce(false);
    expect((await app.request("/videos/playback/video_A", { method: "POST" })).status).toBe(403);
    expect(ports.signedToken).toHaveBeenCalledTimes(1);
    vi.mocked(ports.authorized).mockResolvedValueOnce(null);
    expect((await app.request("/videos/playback/video_A", { method: "POST" })).status).toBe(404);
    expect(ports.signedToken).toHaveBeenCalledTimes(1);
  });
  it("returns a short-lived poster redirect, only after ownership check", async () => {
    const { app, ports } = setup();
    const poster = await app.request("/videos/poster/video_A");
    expect(poster.status).toBe(302);
    expect(poster.headers.get("location")).toContain("https://storage.yandexcloud.net/");
    expect(poster.headers.get("cache-control")).toContain("private, no-store");
    expect(ports.poster).toHaveBeenCalledWith(secret);
    vi.mocked(ports.authorized).mockResolvedValueOnce(null);
    expect((await app.request("/videos/poster/video_A")).status).toBe(404);
    expect(ports.poster).toHaveBeenCalledTimes(1);
  });
  it("fails closed on malformed source, SQL errors and unsafe poster URLs", async () => {
    const { app, ports } = setup();
    vi.mocked(ports.list).mockResolvedValueOnce([{ ...item, fileSize: -1 }]);
    const bad = await app.request(path);
    expect(bad.status).toBe(500);
    expect(JSON.stringify(await bad.json())).not.toContain(secret);
    vi.mocked(ports.poster).mockResolvedValueOnce("javascript:alert(1)");
    expect((await app.request("/videos/poster/video_A")).status).toBe(503);
    expect((await app.request("/videos/playback/%2e%2e", { method: "POST" })).status)
      .not.toBe(200);
  });
});

describe("trainer selectable videos: durable own video references", () => {
  const valid = {
    ...item, relativePath: "uploads/trainers/trainer_A/videocourses/video_A/original.mp4",
  };
  it("returns only a complete owned video, with a permanent legacy-compatible URL", async () => {
    const { app, ports } = setup();
    vi.mocked(ports.list).mockResolvedValueOnce([valid]);
    const response = await app.request("/videos/selectable");
    expect(response.status).toBe(200);
    expect((await response.json()).data.videos).toEqual([{
      id: "video_A", title: "Первое занятие.mp4", durationSec: 61,
      createdAt: "2026-11-03T09:00:00.000Z",
      videoUrl: "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer_A/videocourses/video_A/original.mp4",
    }]);
    expect(ports.list).toHaveBeenCalledWith("trainer_A", { forAdmin: false });
  });
  it("also allows existing Next HLS manifest references with verified owner and ID", async () => {
    const { app, ports } = setup();
    vi.mocked(ports.list).mockResolvedValueOnce([{ ...valid,
      relativePath: "uploads/trainers/trainer_A/videocourses/video_A/hls/master.m3u8",
    }]);
    const result = await app.request("/videos/selectable");
    expect(result.status).toBe(200);
    expect((await result.json()).data.videos[0].videoUrl).toBe(
      "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer_A/videocourses/video_A/hls/master.m3u8",
    );
  });
  it("never includes another trainer, unprocessed video or unsafe storage paths", async () => {
    const { app, ports } = setup("ADMIN");
    vi.mocked(ports.list).mockResolvedValueOnce([
      { ...valid, trainerId: "another-trainer" },
      { ...valid, transcodingStatus: "PROCESSING" },
      { ...valid, relativePath: "uploads/trainers/trainer_A/videocourses/another-id/original.mp4" },
      { ...valid, relativePath: "uploads/trainers/trainer_A/videocourses/video_A/../secret.mp4" },
    ]);
    expect((await (await app.request("/videos/selectable")).json()).data.videos).toEqual([]);
    expect(ports.list).toHaveBeenCalledWith("trainer_A", { forAdmin: false });
    expect((await app.request("/videos/selectable?owner=someone")).status).toBe(400);
    expect((await setup("USER").app.request("/videos/selectable")).status).toBe(403);
  });
});
