/** Chat2 processing starts *after* the attachment is sent in a message. */
export type ReadableChat2Media = { url: string; status?: string };

export function isChat2MediaProcessing(media: ReadableChat2Media): boolean {
  return media.status === "UPLOADED" || media.status === "QUEUED" ||
    media.status === "PROCESSING";
}

export async function readProcessedChat2Media<T extends ReadableChat2Media>(
  read: () => Promise<T>,
  signal: AbortSignal,
  onProcessing?: () => void,
  intervalMs = 2500,
  maxAttempts = 120,
): Promise<T> {
  const cancelled = () => new Error("CHAT2_MEDIA_READ_CANCELLED");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) throw cancelled();
    const media = await read();
    if (signal.aborted) throw cancelled();
    if (!isChat2MediaProcessing(media)) {
      if (!media.url || media.status === "FAILED" || media.status === "EXPIRED")
        throw new Error("CHAT2_MEDIA_NOT_READY");
      return media;
    }
    onProcessing?.();
    if (attempt + 1 >= maxAttempts) break;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(cancelled());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, intervalMs);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  throw new Error("CHAT2_MEDIA_PROCESSING_TIMEOUT");
}
