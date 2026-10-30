/**
 * Worker-side media processing adapter for Chat 2.0 (not a deployed job).
 * Delegates actual encoding to the existing Moments V2 implementation.
 * Does not mutate Chat2Media.status or publish links: the future orchestration
 * must atomically mark READY only after verifying every immutable output.
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createFeedCommandRunner, processFeedV2Image, processFeedV2Video,
  type FeedImageEngine, type FeedV2VideoResult,
} from "@gafus/feed-cloud";
import {
  CHAT2_V2_VIDEO_QUALITIES, chat2V2FinalKeys, validateChat2V2Job, validateChat2V2Manifest,
  type Chat2V2Job, type Chat2V2Manifest,
} from "@gafus/feed-cloud";

export interface Chat2V2Objects {
  /** Implement with size cap, exact-key S3 GET and optional source ETag. */
  download(key: string, file: string, maxBytes: number, signal: AbortSignal): Promise<void>;
  /** Implement immutable create + HEAD verification just like the Moments job. */
  create(key: string, bytes: Uint8Array, mime: "image/webp", signal: AbortSignal): Promise<void>;
  /** Streaming upload; a MP4 must never be fully loaded into API memory. */
  createFile(key: string, file: string, signal: AbortSignal): Promise<void>;
}
export interface Chat2V2Deps {
  objects: Chat2V2Objects;
  engine: FeedImageEngine;
  processVideo?: typeof processFeedV2Video;
  runner?: ReturnType<typeof createFeedCommandRunner>;
}
export async function processChat2V2Asset(
  job: Chat2V2Job,
  workDir: string,
  deps: Chat2V2Deps,
  signal: AbortSignal,
): Promise<Chat2V2Manifest> {
  const sourceInfo = validateChat2V2Job(job);
  signal.throwIfAborted();
  // The caller must own the work directory. No global /tmp fallback or access
  // to other local repos is permitted during isolated refactor acceptance.
  const directory = await realpath(workDir);
  const projectRoot = "/Users/asmtv1/Desktop/gafus-refactor";
  if ((process.env.GAFUS_LOCAL_ISOLATED_API === "1" || process.env.VITEST === "true") &&
      directory !== projectRoot && !directory.startsWith(projectRoot + sep))
    throw new Error("CHAT2_V2_WORKDIR_OUTSIDE_REFACTOR");
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(directory) !== directory)
    throw new Error("CHAT2_V2_INVALID_WORKDIR");
  const sourceFile = join(directory, "source");
  await deps.objects.download(job.sourceKey, sourceFile, sourceInfo.maxBytes, signal);
  const sourceStat = await lstat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() ||
      sourceStat.size !== job.sourceBytes)
    throw new Error("CHAT2_V2_SOURCE_MISMATCH");
  signal.throwIfAborted();
  const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
  if (sourceInfo.kind === "image") {
    const images = await processFeedV2Image(await readFile(sourceFile), deps.engine, ["small", "medium"] as const, {widthOnly:true});
    const outputs = [
      ["small", images.small],
      ["medium", images.medium],
    ] as const;
    // Independent renditions may upload concurrently. Wait for ALL writes
    // (including failures) so no background transfer outlives workDir cleanup.
    const uploads = await Promise.allSettled(outputs.map(async ([size, image]) => {
      signal.throwIfAborted();
      await deps.objects.create(keys.image[size], image.bytes, "image/webp", signal);
    }));
    for (const item of uploads) if (item.status === "rejected") throw item.reason;
    // Only return a manifest when both immutable WebP variants exist.
    const manifest: Chat2V2Manifest = { kind: "image", width: images.medium.width,
      height: images.medium.height, keys: keys.image, imageSizes: {
        small:{width:images.small.width,height:images.small.height},
        medium:{width:images.medium.width,height:images.medium.height},
      } };
    validateChat2V2Manifest(job, manifest);
    return manifest;
  }
  const result: FeedV2VideoResult = await (deps.processVideo ?? processFeedV2Video)(
    sourceFile, directory,
    deps.runner ?? createFeedCommandRunner({ signal, timeoutMs: 550_000 }),
    CHAT2_V2_VIDEO_QUALITIES,
    {
      // Chat 2.0 video: validated in a 2-vCPU/8-GiB Linux container.
      // Decoder 1 thread, x264 2 threads, superfast; 360p then 720p.
      // Shared Moments encoder defaults remain untouched.
      decoderThreads: 1,
      encoderThreads: 2,
      preset: "superfast",
      // Parallel/shared modes require explicit 4+-vCPU provisioning.
      sharedDecode: Number(process.env.CHAT2_JOB_VCPU ?? "2") >= 4 &&
        process.env.CHAT2_VIDEO_TRANSCODE_MODE === "shared-decode",
      parallelRenditions: Number(process.env.CHAT2_JOB_VCPU ?? "2") >= 4 &&
        process.env.CHAT2_VIDEO_TRANSCODE_MODE === "parallel",
      threadsPerEncoder: 2,
    },
  );
  signal.throwIfAborted();
  // Keep the shared Moments encoder unchanged, but refuse any 1080p outputs
  // in chat before the first object is published.
  if (result.mp4.some(r => r.quality !== 360 && r.quality !== 720))
    throw new Error("CHAT2_V2_UNEXPECTED_VIDEO_QUALITY");
  const chatMp4 = result.mp4 as Array<(typeof result.mp4)[number] & { quality: 360 | 720 }>;
  const posterBytes = await readFile(result.poster);
  const uploads = await Promise.allSettled([
    deps.objects.create(keys.video.poster, posterBytes, "image/webp", signal),
    ...chatMp4.map(async rendition => {
      signal.throwIfAborted();
      await deps.objects.createFile(keys.video.variants[rendition.quality], rendition.path, signal);
    }),
  ]);
  for (const item of uploads) if (item.status === "rejected") throw item.reason;
  const manifest: Chat2V2Manifest = {
    kind: "video", width: result.info.width, height: result.info.height,
    durationSeconds: result.info.durationSeconds,
    posterKey: keys.video.poster,
    renditions: chatMp4.map(rendition => ({
      quality: rendition.quality,
      key: keys.video.variants[rendition.quality],
      width: rendition.width, height: rendition.height, bytes: rendition.bytes,
    })),
  };
  validateChat2V2Manifest(job, manifest);
  return manifest;
}
