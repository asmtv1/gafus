import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

/** Development-only CDN *reading*: production objects, buckets and providers are never mutated. */
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const directory = join(root, ".local-pg-scratch");
const secretFile = join(directory, "live-media-cdn-readonly.json");

export function localReadonlyCdnSecret(
  scope: "gallery" | "feed",
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.GAFUS_LOCAL_READONLY_CDN === undefined) return null;
  if (env.GAFUS_LOCAL_READONLY_CDN !== "enabled" ||
      env.NODE_ENV !== "development" ||
      env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
      env.CLOUDRU_MEDIA_JOBS_ENABLED !== "false" ||
      env.GALLERY_MEDIA_FALLBACK_ENABLED !== "false" ||
      env.FEED_MEDIA_FALLBACK_ENABLED !== "false") {
    throw new Error("LOCAL_READONLY_CDN_ISOLATION_DENIED");
  }
  try {
    const cwd = realpathSync(process.cwd());
    const d = lstatSync(directory);
    const file = lstatSync(secretFile);
    const uid = process.getuid?.();
    if (realpathSync(root) !== root || !(cwd === root || cwd.startsWith(root + sep)) ||
        !d.isDirectory() || d.isSymbolicLink() || (d.mode & 0o777) !== 0o700 ||
        !file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== 0o600 ||
        realpathSync(directory) !== directory || realpathSync(secretFile) !== secretFile ||
        (uid !== undefined && (d.uid !== uid || file.uid !== uid))) {
      throw new Error("INVALID_SECRET_FILE");
    }
    const raw: unknown = JSON.parse(readFileSync(secretFile, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        Object.keys(raw).sort().join(",") !== "feed,gallery") throw new Error("INVALID_SECRET_FORMAT");
    const values = raw as Record<string, unknown>;
    if (typeof values.gallery !== "string" || !/^[A-Za-z0-9_-]{24,128}$/.test(values.gallery) ||
        typeof values.feed !== "string" || !/^[A-Za-z0-9_-]{24,32}$/.test(values.feed)) {
      throw new Error("INVALID_SECRET_FORMAT");
    }
    return values[scope] as string;
  } catch {
    // Never print secret bytes or filesystem contents.
    throw new Error("LOCAL_READONLY_CDN_SECRETS_UNAVAILABLE");
  }
}
