/** Untrusted diagnostic headers. They do not authorize features or select
 * sampling; no arbitrary values are used as metric labels. */
export function clientTraceAttributes(header: (name: string) => string | undefined): Record<string, string | number> {
  const platform = header("x-client-platform");
  const version = header("x-client-version");
  const build = header("x-client-build");
  const revision = header("x-client-ota-revision");
  const attrs: Record<string, string | number> = {};
  if (platform !== "ios" && platform !== "android" && platform !== "web") return attrs;
  attrs["gafus.client_platform"] = platform;
  if (version && /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(version))
    attrs["gafus.client_version"] = version;
  if (platform !== "web") {
    if (build && /^[1-9]\d{0,9}$/.test(build) && Number(build) <= 2100000000)
      attrs["gafus.client_build"] = build;
    if (revision && /^(0|[1-9]\d{0,9})$/.test(revision) && Number(revision) <= 1_000_000_000)
      attrs["gafus.ota_revision"] = Number(revision);
  }
  return attrs;
}
