import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";
import { feedClient } from "./feedClient";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const record = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : null;

/** A short-lived, display-only poll media read, NEVER TanStack Query/localStorage.
 * Option ID is public but signed photo URL stays ephemeral. */
export async function loadMomentPollImages(
  postId: string,
  pollId: string,
  imageOptionIds: readonly string[],
): Promise<Record<string, string>> {
  if (!ID.test(postId) || !ID.test(pollId) ||
      imageOptionIds.length > 10 ||
      imageOptionIds.some(id => !ID.test(id)) ||
      new Set(imageOptionIds).size !== imageOptionIds.length)
    throw new Error("INVALID_POLL_IMAGE_SCOPE");
  if (!imageOptionIds.length) return {};
  const raw = record(await feedClient.getPoll(postId));
  if (!raw || raw.id !== pollId || raw.postId !== postId ||
      !Array.isArray(raw.options) || raw.options.length > 10) {
    throw new Error("INVALID_POLL_IMAGE_RESPONSE");
  }
  const allowed = new Set(imageOptionIds);
  const found = new Set<string>();
  const photos: Record<string, string> = {};
  for (const entry of raw.options) {
    const item = record(entry);
    if (!item || typeof item.id !== "string" || !ID.test(item.id) ||
        found.has(item.id)) throw new Error("INVALID_POLL_IMAGE_OPTION");
    found.add(item.id);
    if (!allowed.has(item.id)) continue;
    if (typeof item.imageMediaId !== "string" || !ID.test(item.imageMediaId) ||
        typeof item.imageUrl !== "string") throw new Error("INVALID_POLL_IMAGE_ASSET");
    const url = new URL(item.imageUrl);
    if ((!((url.protocol === "https:" && !!url.hostname) ||
         isolatedNonprodBrowserS3Url(item.imageUrl, "feed", "signed-get"))) ||
        url.username || url.password || url.hash || url.href.length > 4096)
      throw new Error("UNSAFE_POLL_IMAGE_URL");
    photos[item.id] = url.href;
  }
  if (imageOptionIds.some(id => !photos[id]))
    throw new Error("POLL_IMAGE_MISSING");
  return photos;
}
