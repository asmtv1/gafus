/**
 * Opt-in READ-ONLY preview of existing, publicly readable trainer HLS assets.
 * This adapter never uses legacy credentials, S3 SDK, writes or arbitrary URLs.
 * Production and regular isolated S3 paths remain unchanged.
 */
const LEGACY_TRAINER_PATH = /^(?:uploads\/)?trainers\/[A-Za-z0-9_-]{1,128}\/videocourses\/[A-Za-z0-9_-]{1,128}\/hls\/[A-Za-z0-9._-]{1,128}\.(?:m3u8|ts|m4s|mp4|vtt|aac|jpg|jpeg|png|webp)$/;
const PUBLIC_ORIGIN = "https://storage.yandexcloud.net/gafus-media/uploads/";

export function localLegacyTrainingVideoEnabled(): boolean {
  return process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    process.env.GAFUS_ISOLATED_NONPROD_S3 === "enabled" &&
    process.env.GAFUS_LOCAL_LEGACY_VIDEO_READ_ONLY === "1";
}

export function localLegacyTrainerVideoUrl(path: string): string {
  if (!localLegacyTrainingVideoEnabled() || !LEGACY_TRAINER_PATH.test(path)) {
    throw new Error("LOCAL_LEGACY_TRAINING_MEDIA_DENIED");
  }
  const normalized = path.startsWith("uploads/") ? path.slice(8) : path;
  return PUBLIC_ORIGIN + normalized;
}

export async function readLocalLegacyTrainerVideo(
  path: string, range?: string,
): Promise<Response> {
  const url = localLegacyTrainerVideoUrl(path);
  if (range && !/^bytes=\d+-\d*$/.test(range))
    throw new Error("LOCAL_LEGACY_VIDEO_RANGE_DENIED");
  const response = await fetch(url, {
    method: "GET", redirect: "error", cache: "no-store",
    ...(range ? { headers: { Range: range } } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!(response.status === 200 || response.status === 206)) {
    await response.body?.cancel();
    throw new Error("LOCAL_LEGACY_TRAINING_MEDIA_UNAVAILABLE");
  }
  return response;
}

/** Limit playlist reads even if an upstream response omits Content-Length. */
export async function readLocalLegacyTrainerPlaylist(path: string): Promise<Buffer> {
  if (!path.endsWith(".m3u8")) throw new Error("LOCAL_LEGACY_VIDEO_PLAYLIST_PATH_DENIED");
  const response = await readLocalLegacyTrainerVideo(path);
  const limit = 512 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("LOCAL_LEGACY_VIDEO_PLAYLIST_EMPTY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("LOCAL_LEGACY_VIDEO_PLAYLIST_TOO_LARGE");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
