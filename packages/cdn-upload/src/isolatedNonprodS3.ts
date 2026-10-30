import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

// This is NOT a selectable S3 provider. The only additional backend is the
// project-owned, loopback-only development instance with private test buckets.
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const origin = "http://127.0.0.1:9000";
// Exact additional WEB4-only loopback identity. No selectable host, bucket or path.
const web4Origin = "http://127.0.0.1:9500";
const credentialDir = join(root, ".local-pg-scratch", "nonprod-s3");
const credentialFile = join(credentialDir, "credentials.json");
const buckets = {
  documents: "gafus-refactor-documents-test",
  questions: "gafus-refactor-questions-test",
  gallery: "gafus-refactor-gallery-test",
  feed: "gafus-refactor-feed-test",
} as const;

export type IsolatedNonprodS3Kind = keyof typeof buckets;
export interface IsolatedNonprodS3Config {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function isolatedNonprodS3Config(
  kind: IsolatedNonprodS3Kind,
  env: Record<string, string | undefined> = process.env,
): IsolatedNonprodS3Config | null {
  const mode = env.GAFUS_ISOLATED_NONPROD_S3;
  const web4 = env.GAFUS_WEB4_ISOLATED_MEDIA === "1";
  if (env.GAFUS_WEB4_ISOLATED_MEDIA !== undefined && !web4)
    throw new Error("ISOLATED_S3_WEB4_INVALID_FLAG");
  const expectedOrigin = web4 ? web4Origin : origin;
  const expectedCredentialDir = web4
    ? join(root, ".local-pg-scratch", "web4-nonprod-s3") : credentialDir;
  const expectedCredentialFile = web4
    ? join(expectedCredentialDir, "credentials.json") : credentialFile;
  const expectedBucket = web4 ? `gafus-refactor-web4-${kind}-test` : buckets[kind];
  if (mode === undefined) {
    if (web4) throw new Error("ISOLATED_S3_FLAG_REQUIRED");
    // A half-configured local provider must not quietly use production S3.
    if (Object.keys(env).some((key) =>
      key.startsWith("GAFUS_ISOLATED_S3_") && env[key] !== undefined))
      throw new Error("ISOLATED_S3_FLAG_REQUIRED");
    return null;
  }
  if (mode !== "enabled") throw new Error("ISOLATED_S3_INVALID_FLAG");
  const cwd = realpathSync(process.cwd());
  if (
    env.NODE_ENV !== "development" ||
    env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    realpathSync(root) !== root ||
    !(cwd === root || cwd.startsWith(root + sep)) ||
    env.GAFUS_ISOLATED_S3_ENDPOINT !== expectedOrigin ||
    env[`GAFUS_ISOLATED_S3_${kind.toUpperCase()}_BUCKET`] !== expectedBucket ||
    // Do not mix test-provider identity with production-provider credentials.
    env.CLOUDRU_S3_ACCESS_KEY_ID || env.CLOUDRU_S3_SECRET_ACCESS_KEY ||
    env.GALLERY_S3_ACCESS_KEY_ID || env.GALLERY_S3_SECRET_ACCESS_KEY ||
    env.FEED_S3_ACCESS_KEY_ID || env.FEED_S3_SECRET_ACCESS_KEY
  ) throw new Error("ISOLATED_S3_UNSAFE_ENVIRONMENT");
  try {
    const directory = lstatSync(expectedCredentialDir);
    const file = lstatSync(expectedCredentialFile);
    const uid = process.getuid?.();
    if (
      !directory.isDirectory() || directory.isSymbolicLink() ||
      (directory.mode & 0o777) !== 0o700 ||
      !file.isFile() || file.isSymbolicLink() ||
      (file.mode & 0o777) !== 0o600 ||
      (uid !== undefined && (directory.uid !== uid || file.uid !== uid)) ||
      realpathSync(expectedCredentialDir) !== expectedCredentialDir ||
      realpathSync(expectedCredentialFile) !== expectedCredentialFile
    ) throw new Error("ISOLATED_S3_CREDENTIAL_PERMISSIONS");
    const parsed: unknown = JSON.parse(readFileSync(expectedCredentialFile, "utf8"));
    if (
      !parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "accessKeyId,secretAccessKey"
    ) throw new Error("ISOLATED_S3_CREDENTIAL_FORMAT");
    const values = parsed as Record<string, unknown>;
    if (
      typeof values.accessKeyId !== "string" ||
      !/^[A-Za-z0-9]{20,64}$/.test(values.accessKeyId) ||
      typeof values.secretAccessKey !== "string" ||
      !/^[A-Za-z0-9]{32,128}$/.test(values.secretAccessKey)
    ) throw new Error("ISOLATED_S3_CREDENTIAL_FORMAT");
    return {
      bucket: expectedBucket, endpoint: expectedOrigin,
      accessKeyId: values.accessKeyId, secretAccessKey: values.secretAccessKey,
    };
  } catch {
    // Never print or propagate secrets, filesystem paths, or JSON content.
    throw new Error("ISOLATED_S3_CREDENTIALS_UNAVAILABLE");
  }
}
