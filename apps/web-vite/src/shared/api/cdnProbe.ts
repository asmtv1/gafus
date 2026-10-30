/** CDN HEAD responses cannot be inspected from browser JS when CDN blocks CORS.
 * Route ONLY HTTPS targets through Hono's authenticated and allowlisted proxy.
 * The API itself decides whether the URL can be probed; never expose S3 keys.
 */
export const sameOriginCdnProbeFetch: typeof fetch = (input, init) => {
  const source = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!source.startsWith("https://")) return fetch(input, init);
  return fetch(`/api/v1/media-cdn-probe?url=${encodeURIComponent(source)}`, {
    method: "GET", cache: "no-store", credentials: "same-origin",
    redirect: "error", signal: init?.signal,
  });
};
