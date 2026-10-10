import { streamServer } from "../cynologistChat/stream";

/** Channel identity and URL snapshots survive local chat/attachment cascades. */
export async function deleteAccountStreamFiles(values: string[]) {
  for (const value of values) {
    const file = JSON.parse(value) as {
      url: string;
      kind: string;
      channelType: string;
      channelId: string;
    };
    const url = new URL(file.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.endsWith(".stream-io-cdn.com") ||
      !["gafus_cynologist", "gafus_community"].includes(file.channelType) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(file.channelId) ||
      !["image", "video"].includes(file.kind)
    )
      throw new Error("CLEANUP_UNSAFE_STREAM_FILE");
    const channel = streamServer().channel(file.channelType, file.channelId);
    try {
      await (file.kind === "image" ? channel.deleteImage(file.url) : channel.deleteFile(file.url));
    } catch (error) {
      // A repeat after a successful delete may find the file already absent.
      // Other failures, including authorization, must stay in the retry queue.
      if ((error as { response?: { status?: number } }).response?.status !== 404) throw error;
    }
    // The delete response alone does not prove that an already warmed CDN URL disappeared.
    // A stale 200, expired-signature 403 or network failure must never complete this job.
    const response = await fetch(file.url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 404 && response.status !== 410)
      throw new Error("CLEANUP_STREAM_NOT_CONFIRMED");
  }
}
