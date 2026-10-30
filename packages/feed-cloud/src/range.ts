/** Feed V2 single-range HTTP contract for authorized, immutable MP4/WebP objects.
 * The caller MUST authorize the viewer and media version before accessing S3.
 * A byte-range parser alone is never a security boundary.
 */
export type FeedV2Range = {
  status: 200 | 206 | 416;
  start: number;
  end: number;
  headers: Record<string, string>;
};
export function feedV2Range(contentLength: number, rangeHeader: string | null, contentType: "video/mp4" | "image/webp"): FeedV2Range {
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) throw new Error("FEED_V2_INVALID_OBJECT_LENGTH");
  const base = { "Accept-Ranges": "bytes", "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };
  if (rangeHeader === null) return { status: 200, start: 0, end: contentLength - 1,
    headers: { ...base, "Content-Length": String(contentLength) } };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  const reject = (): FeedV2Range => ({ status: 416, start: 0, end: 0,
    headers: { ...base, "Content-Range": `bytes */${contentLength}`, "Content-Length": "0" } });
  if (!match || (!match[1] && !match[2])) return reject();
  const first = match[1]; const last = match[2];
  if (!first) {
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return reject();
    const start = Math.max(0, contentLength - suffix);
    return { status: 206, start, end: contentLength - 1,
      headers: { ...base, "Content-Range": `bytes ${start}-${contentLength - 1}/${contentLength}`,
        "Content-Length": String(contentLength - start) } };
  }
  const start = Number(first);
  const requestedEnd = last ? Number(last) : contentLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
      start >= contentLength || requestedEnd < start) return reject();
  const end = Math.min(contentLength - 1, requestedEnd);
  return { status: 206, start, end, headers: { ...base,
    "Content-Range": `bytes ${start}-${end}/${contentLength}`,
    "Content-Length": String(end - start + 1) } };
}
