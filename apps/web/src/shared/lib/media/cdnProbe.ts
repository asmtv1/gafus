/** Transport-only Web adapter; status detection and URL policy stay in core.
 * Calls our authenticated same-origin server because Yandex CDN 504 responses
 * have no Access-Control-Allow-Origin and are opaque to browser HEAD fetches.
 */
export const sameOriginCdnProbeFetch: typeof fetch = async (input, init) => {
  const source = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!source.startsWith("https://")) return fetch(input, init);
  return fetch(`/api/v1/media-cdn-probe?url=${encodeURIComponent(source)}`, {
    method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error",
    signal: init?.signal,
  });
};
