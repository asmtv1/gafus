/**
 * Chat2 Cloud.ru Job: ONLY optional 360p from an immutable, already
 * READY client-published 720p. No photo Jobs and no server-generated 720p.
 *
 * The API owns the durable READY state and validates S3 HEAD+lease on callback;
 * this worker only creates immutable files for a signed background_360 claim.
 */
import { lstat, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { localFeedWorkspaceRoot } from "./local-workspace-root.js";
import {
  createFeedCommandRunner, processFeedV2Video, type FeedImageEngine,
} from "@gafus/feed-cloud";
import {
  chat2V2FinalKeys, validateChat2V2Job, validateChat2V2Manifest,
  type Chat2V2Job, type Chat2V2Manifest,
} from "@gafus/feed-cloud";

export interface Chat2V2Objects {
  download(key: string, file: string, maxBytes: number, signal: AbortSignal): Promise<void>;
  create(key: string, bytes: Uint8Array, mime: "image/webp", signal: AbortSignal): Promise<void>;
  createFile(key: string, file: string, signal: AbortSignal): Promise<void>;
}
export interface Chat2V2Deps {
  objects: Chat2V2Objects;
  /** Kept for compatibility with the runner's dependency interface; never used to encode photos. */
  engine: FeedImageEngine;
  processVideo?: typeof processFeedV2Video;
  runner?: ReturnType<typeof createFeedCommandRunner>;
  onPhase?: (phase: "download" | "transform" | "upload" | "manifest") => void;
}
export async function processChat2V2Asset(
  job: Chat2V2Job, workDir: string, deps: Chat2V2Deps, signal: AbortSignal,
): Promise<Chat2V2Manifest> {
  const source = validateChat2V2Job(job);
  // Strictly deny legacy image and original-source video claims before S3.
  if (source.kind !== "video" || job.phase !== "background_360")
    throw Error("CHAT2_CLOUD_BACKGROUND_360_ONLY");
  signal.throwIfAborted();
  const directory = await realpath(workDir);
  const local = process.env.GAFUS_LOCAL_ISOLATED_API === "1" || process.env.VITEST === "true";
  const projectRoot = local ? localFeedWorkspaceRoot() : undefined;
  if (local && directory !== projectRoot && !directory.startsWith(projectRoot + sep))
    throw Error("CHAT2_V2_WORKDIR_OUTSIDE_REFACTOR");
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(directory) !== directory)
    throw Error("CHAT2_V2_INVALID_WORKDIR");
  const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
  const sourceFile = join(directory, "source");
  deps.onPhase?.("download");
  await deps.objects.download(keys.video.variants[720], sourceFile, source.maxBytes, signal);
  const sourceStat = await lstat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() ||
      sourceStat.size < 24 || sourceStat.size > source.maxBytes)
    throw Error("CHAT2_V2_SOURCE_MISMATCH");
  signal.throwIfAborted();
  deps.onPhase?.("transform");
  const result = await (deps.processVideo ?? processFeedV2Video)(
    sourceFile, directory, deps.runner ?? createFeedCommandRunner({ signal, timeoutMs: 550_000 }),
    [360],
    { firstPlayableOnly: false, skipPoster: true, decoderThreads: 1,
      encoderThreads: 2, preset: "medium", sharedDecode: false,
      parallelRenditions: false, threadsPerEncoder: 2,
      reuseClient720IfValid: false },
  );
  signal.throwIfAborted();
  if (result.mp4.length !== 1 || result.mp4[0]?.quality !== 360)
    throw Error("CHAT2_CLOUD_UNEXPECTED_VIDEO_RENDITION");
  const video = result.mp4[0];
  // Await all transfers; don't delete a working directory while a write is in flight.
  deps.onPhase?.("upload");
  const uploads = await Promise.allSettled([
    deps.objects.createFile(keys.video.variants[360], video.path, signal),
  ]);
  for (const upload of uploads) if (upload.status === "rejected") throw upload.reason;
  deps.onPhase?.("manifest");
  const manifest: Chat2V2Manifest = {
    kind: "video", width: result.info.width, height: result.info.height,
    durationSeconds: result.info.durationSeconds,
    renditions: [{quality:360,key:keys.video.variants[360],
      width:video.width,height:video.height,bytes:video.bytes}],
  };
  validateChat2V2Manifest(job, manifest);
  return manifest;
}
