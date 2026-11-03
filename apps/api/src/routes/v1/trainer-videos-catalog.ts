/** Trainer video card presentation and owner-checked playback. Raw media/storage
 * paths never leave this boundary. The legacy /metadata contract stays minimal. */
import { Hono } from "hono";
import {
  getTrainerVideos, getAuthorizedVideoInfoForStreaming, getSignedVideoToken,
} from "@gafus/core/services/trainerVideo";
import { checkVideoAccess, getVideoManifestInfo } from "@gafus/core/services/video";
import { getSignedDownloadUrl } from "@gafus/cdn-upload";
import {
  localLegacyTrainingVideoEnabled, localLegacyTrainerVideoUrl,
} from "../../lib/localLegacyTrainingVideo";

const STAFF = new Set(["TRAINER", "ADMIN"]);
const safeId = /^[A-Za-z0-9_-]{1,128}$/;
type Actor = { id: string; role: string };
type CatalogVideo = {
  id: string; originalName: string; displayName: string | null;
  fileSize: number; durationSec: number | null;
  transcodingStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string; hasThumbnail: boolean; hasPlayback: boolean;
  ownerName: string | null;
};
export interface TrainerVideoCatalogPorts {
  list: typeof getTrainerVideos;
  authorized: typeof getAuthorizedVideoInfoForStreaming;
  playbackAccess: typeof checkVideoAccess;
  manifest: typeof getVideoManifestInfo;
  signedToken: typeof getSignedVideoToken;
  poster: (path: string) => Promise<string>;
}
const production: TrainerVideoCatalogPorts = {
  list: getTrainerVideos, authorized: getAuthorizedVideoInfoForStreaming,
  playbackAccess: checkVideoAccess, manifest: getVideoManifestInfo,
  signedToken: getSignedVideoToken,
  poster: path => localLegacyTrainingVideoEnabled()
    ? Promise.resolve(localLegacyTrainerVideoUrl(path))
    : getSignedDownloadUrl(path, 180),
};
const error = { success: false, code: "OPERATION_FAILED" } as const;
function actor(c: { get: (key: "user") => unknown }): Actor | null {
  const user = c.get("user") as Actor | undefined;
  return user?.id && safeId.test(user.id) && STAFF.has(user.role) ? user : null;
}
function valid(c: { req: { url: string; raw: Request } }) {
  return new URL(c.req.url).search === "" && c.req.raw.body === null;
}
/** This can be imported with fake ports for tests; no cloud access in tests. */
export function createTrainerVideosCatalogRoutes(ports: TrainerVideoCatalogPorts = production) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.get("/catalog", async c => {
    const user = actor(c);
    if (!user) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    if (!valid(c)) return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      const videos = await ports.list(user.id, { forAdmin: user.role === "ADMIN" });
      const cards: CatalogVideo[] = videos.map(video => {
        if (!safeId.test(video.id) || typeof video.originalName !== "string" ||
          (video.displayName !== null && video.displayName !== undefined &&
            typeof video.displayName !== "string") ||
          !Number.isSafeInteger(video.fileSize) || video.fileSize < 0 ||
          !["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(
            video.transcodingStatus ?? "") ||
          !Number.isFinite(video.createdAt.getTime()) ||
          (video.durationSec !== null &&
            (!Number.isSafeInteger(video.durationSec) || video.durationSec < 0))) {
          throw Error("INVALID_TRAINER_VIDEO_SOURCE");
        }
        return {
          id: video.id, originalName: video.originalName,
          displayName: video.displayName ?? null, fileSize: video.fileSize,
          durationSec: video.durationSec,
          transcodingStatus: video.transcodingStatus!,
          createdAt: video.createdAt.toISOString(),
          hasThumbnail: video.transcodingStatus === "COMPLETED" && !!video.thumbnailPath,
          hasPlayback: video.transcodingStatus === "COMPLETED" && !!video.hlsManifestPath,
          ownerName: user.role === "ADMIN"
            ? video.trainer?.fullName || video.trainer?.username || null : null,
        };
      });
      return c.json({ success: true, data: { videos: cards } });
    } catch { return c.json(error, 500); }
  });
  // A permanent library reference, not a short-lived playback token. The
  // training/video/url reader resolves the legacy-compatible video ID into a
  // fresh entitlement-checked HLS ticket for the actual learner.
  app.get("/selectable", async c => {
    const user = actor(c);
    if (!user) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    if (!valid(c)) return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      // Even ADMIN only selects their OWN uploads when creating an authored step.
      const videos = await ports.list(user.id, { forAdmin: false });
      const rows = videos.filter(video => {
        if (video.trainerId !== user.id || !safeId.test(video.id) ||
            video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) return false;
        const path = video.relativePath;
        if (typeof path !== "string" || path.length > 1700) return false;
        // The old Next uploader persisted both original videos and some
        // completed HLS manifest paths as relativePath. Both are stable
        // references, unlike short-lived signed playback URLs.
        const match = /^uploads\/trainers\/([A-Za-z0-9_-]{1,128})\/videocourses\/([A-Za-z0-9_-]{1,128})\/(?:original\.[a-zA-Z0-9]{2,8}|hls\/[A-Za-z0-9._-]{1,128}\.m3u8)$/.exec(path);
        return match?.[1] === user.id && match?.[2] === video.id;
      }).map(video => ({
        id: video.id, title: video.displayName?.trim() || video.originalName,
        durationSec: video.durationSec, createdAt: video.createdAt.toISOString(),
        videoUrl: `https://gafus-media.storage.yandexcloud.net/${video.relativePath}`,
      }));
      return c.json({ success: true, data: { videos: rows } });
    } catch { return c.json(error, 500); }
  });
  app.get("/poster/:id", async c => {
    const user = actor(c);
    if (!user) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    if (!valid(c) || !safeId.test(c.req.param("id")))
      return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      const id = c.req.param("id");
      const info = await ports.authorized(id, user.id, user.role);
      if (!info || info.transcodingStatus !== "COMPLETED")
        return c.json({ success: false, code: "NOT_FOUND" }, 404);
      const record = await ports.manifest(id);
      if (!record?.thumbnailPath || record.trainerId === "" ||
        (!safeId.test(record.trainerId)))
        return c.json({ success: false, code: "NOT_FOUND" }, 404);
      const url = await ports.poster(record.thumbnailPath);
      const target = new URL(url);
      if (target.protocol !== "https:" &&
          !(localLegacyTrainingVideoEnabled() && target.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(target.hostname))) throw Error("UNSAFE_POSTER_URL");
      return c.redirect(url, 302);
    } catch { return c.json(error, 503); }
  });
  app.post("/playback/:id", async c => {
    const user = actor(c);
    if (!user) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    if (!valid(c) || !safeId.test(c.req.param("id")))
      return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      const id = c.req.param("id");
      const info = await ports.authorized(id, user.id, user.role);
      if (!info || info.transcodingStatus !== "COMPLETED" || !info.hlsManifestPath)
        return c.json({ success: false, code: "NOT_FOUND" }, 404);
      if (!await ports.playbackAccess({ userId: user.id, videoId: id }))
        return c.json({ success: false, code: "FORBIDDEN" }, 403);
      const token = ports.signedToken(id, user.id);
      return c.json({ success: true, data: {
        url: `/api/v1/training/video/${encodeURIComponent(id)}/manifest.m3u8?token=${encodeURIComponent(token)}`,
      } });
    } catch { return c.json(error, 503); }
  });
  return app;
}
export const trainerVideosCatalogRoutes = createTrainerVideosCatalogRoutes();
