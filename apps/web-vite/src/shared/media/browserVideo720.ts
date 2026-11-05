/** One browser-side MP4 720p rendition per selected original File. The shared
 * Cloud.ru processor encodes 360p, and remuxes 720p if it passes ffprobe.
 * No WebAssembly FFmpeg downloads, no HLS and no server API contract changes.
 */
const MAX_ENCODE_MS = 120_000;
const cache = new WeakMap<File, Promise<File>>();
const verifiedCache = new WeakMap<File, Promise<File>>();
let previous: Promise<void> = Promise.resolve();

export function browserVideo720Available(): boolean {
  return (
    import.meta.env.VITE_CLIENT_VIDEO_720 !== "false" &&
    typeof Worker !== "undefined" &&
    typeof VideoDecoder !== "undefined" &&
    typeof VideoEncoder !== "undefined"
  );
}

/** Strict mode is used for NEW uploads when no backend transcoder is available.
 * It accepts a source without re-encoding ONLY when worker metadata validation
 * explicitly reports `reusable`. A failed encode must never silently upload
 * an unverified original and trap the author in a server processing queue.
 * Non-strict callers retain the existing compatibility behavior.
 */
export function prepareBrowserVideo720(
  file: File,
  onProgress?: (progress: number) => void,
  requirePrepared = false,
): Promise<File> {
  if (!file.type.startsWith("video/") || file.size < 1024) {
    return requirePrepared
      ? Promise.reject(new Error("LOCAL_VIDEO_INVALID"))
      : Promise.resolve(file);
  }
  if (!browserVideo720Available()) {
    return requirePrepared
      ? Promise.reject(new Error("LOCAL_VIDEO_BROWSER_UNSUPPORTED"))
      : Promise.resolve(file);
  }
  const store = requirePrepared ? verifiedCache : cache;
  const cached = store.get(file);
  if (cached) return cached;
  const job = previous
    .catch(() => undefined)
    .then(() => encodeInWorker(file, onProgress, requirePrepared));
  // Only one hardware encode per browser tab, including failed attempts.
  previous = job.then(
    () => undefined,
    () => undefined,
  );
  const result = requirePrepared
    ? job.catch((error) => {
        // Retry on the same file really starts a fresh worker, not a cached failure.
        verifiedCache.delete(file);
        throw error;
      })
    : job.catch(() => file);
  store.set(file, result);
  return result;
}

function encodeInWorker(
  file: File,
  onProgress?: (progress: number) => void,
  requirePrepared = false,
): Promise<File> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./browserVideo720.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      if (requirePrepared) reject(new Error("LOCAL_VIDEO_BROWSER_UNSUPPORTED"));
      else resolve(file);
      return;
    }
    let ended = false;
    const finish = (result: File) => {
      if (ended) return;
      ended = true;
      clearTimeout(deadline);
      worker.terminate();
      resolve(result);
    };
    const fallback = () => {
      if (!requirePrepared) {
        finish(file);
        return;
      }
      if (ended) return;
      ended = true;
      clearTimeout(deadline);
      worker.terminate();
      reject(new Error("LOCAL_VIDEO_CONVERSION_FAILED"));
    };
    const deadline = setTimeout(fallback, MAX_ENCODE_MS);
    worker.onerror = fallback;
    worker.onmessage = (
      event: MessageEvent<
        | { kind: "progress"; value: number }
        | { kind: "result"; file: File }
        | { kind: "fallback" }
        | { kind: "reusable" }
      >,
    ) => {
      if (event.data.kind === "progress") {
        if (Number.isFinite(event.data.value))
          onProgress?.(Math.round(Math.max(0, Math.min(1, event.data.value)) * 100));
      } else if (event.data.kind === "reusable") {
        finish(file);
      } else if (event.data.kind === "result") {
        const prepared = event.data.file;
        if (
          prepared instanceof File &&
          prepared.type === "video/mp4" &&
          prepared.size >= 1024 &&
          prepared.size <= 200 * 1024 * 1024
        )
          finish(prepared);
        else fallback();
      } else fallback();
    };
    try {
      worker.postMessage({ file });
    } catch {
      fallback();
    }
  });
}
