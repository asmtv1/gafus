/**
 * Main-only, idempotent owner-scoped migration Yandex S3 -> private Cloud.ru.
 * Never deletes or overwrites source or destination. SHA256 verifies every file.
 * Fails closed on unauthorized LIST, unknown legacy paths, changing objects.
 */
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { migrateOwner, requireMediaConfig, ownerMediaPrefixes } from "./migrate-legacy-media.mjs";

const mode = process.argv[2] ?? "--plan";
if (!["--plan", "--apply", "--verify"].includes(mode)) throw Error("BAD_PROD_MEDIA_MIGRATION_MODE");
const targets = [
  {
    scope: "gallery",
    source: "gafus-gallery-dev-photos-b1gjbsvfnd1fl68k43g6",
    dest: "gafus-gallery-private",
    prefixes: ["albums/", "users/"],
    originCdn: "bc8rorv3vgbgax3xesyn",
  },
  {
    scope: "feed",
    source: "gafus-feed-prod-b1gjbsvfnd1fl68k43g6",
    dest: "gafus-feed-private",
    prefixes: ["posts/"],
    originCdn: "bc8ru2x6mcqxwcl6a7vj",
  },
];
if (mode === "--plan") {
  console.log(
    JSON.stringify({
      mode,
      mutates: false,
      destructive: false,
      types: targets.map((x) => x.scope),
      constraints: "all source keys must be owner-scoped and all destination bytes SHA256-verified",
    }),
  );
  process.exit(0);
}
const e = process.env;
if (
  e.GITHUB_REF !== "refs/heads/main" ||
  e.GITHUB_EVENT_NAME !== "push" ||
  e.CLOUDRU_LEGACY_MEDIA_CONFIRM !== "copy-all-private-objects-no-deletion"
)
  throw Error("PRODUCTION_MEDIA_MIRROR_NOT_APPROVED");
if (e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru")
  throw Error("MEDIA_MIRROR_WRONG_TARGET_ENDPOINT");
for (const key of [
  "CLOUDRU_S3_ACCESS_KEY_ID",
  "CLOUDRU_S3_SECRET_ACCESS_KEY",
  "GALLERY_LEGACY_S3_ACCESS_KEY_ID",
  "GALLERY_LEGACY_S3_SECRET_ACCESS_KEY",
  "FEED_LEGACY_S3_ACCESS_KEY_ID",
  "FEED_LEGACY_S3_SECRET_ACCESS_KEY",
])
  if (!e[key] || e[key].length < 9) throw Error("MEDIA_MIRROR_MISSING_" + key);
function sourceOptions(scope) {
  return {
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: {
      accessKeyId: e[scope + "_LEGACY_S3_ACCESS_KEY_ID"],
      secretAccessKey: e[scope + "_LEGACY_S3_SECRET_ACCESS_KEY"],
    },
  };
}
const targetOptions = {
  endpoint: "https://s3.cloud.ru",
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 2,
  credentials: {
    accessKeyId: e.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
};
const safeKey = /^[A-Za-z0-9_./-]+$/;
async function scanAllObjects(client, spec) {
  const found = new Map();
  let token;
  const seen = new Set();
  let pages = 0;
  do {
    if (++pages > 100) throw Error("MEDIA_MIRROR_TOO_MANY_PAGES");
    const r = await client.send(
      new ListObjectsV2Command({ Bucket: spec.source, MaxKeys: 500, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!Array.isArray(r.Contents ?? []) || (r.IsTruncated && !r.NextContinuationToken))
      throw Error("MEDIA_MIRROR_INVALID_PAGE");
    for (const f of r.Contents ?? []) {
      const key = f.Key;
      if (
        typeof key !== "string" ||
        key.length > 1000 ||
        !safeKey.test(key) ||
        key.split("/").some((x) => !x || x === "." || x === "..") ||
        !Number.isSafeInteger(f.Size) ||
        f.Size <= 0
      )
        throw Error("MEDIA_MIRROR_UNKNOWN_S3_OBJECT");
      if (found.has(key)) throw Error("MEDIA_MIRROR_REPEATED_OBJECT");
      const prefix = spec.prefixes.find((x) => key.startsWith(x));
      const owner = prefix ? key.slice(prefix.length).split("/")[0] : "";
      if (!owner || !ownerMediaPrefixes(spec.scope, owner).some((x) => key.startsWith(x)))
        throw Error("MEDIA_MIRROR_UNOWNED_LEGACY_OBJECT");
      if (found.size >= 10000) throw Error("MEDIA_MIRROR_TOO_MANY_OBJECTS");
      found.set(key, f.Size);
    }
    if (!r.IsTruncated) {
      if (r.NextContinuationToken) throw Error("MEDIA_MIRROR_INVALID_FINAL_PAGE");
      break;
    }
    token = r.NextContinuationToken;
    if (!token || token.length > 4096 || seen.has(token))
      throw Error("MEDIA_MIRROR_PAGINATION_LOOP");
    seen.add(token);
  } while (true);
  if (found.size === 0) throw Error("MEDIA_MIRROR_SOURCE_EMPTY_MUST_VERIFY_DATABASE");
  return found;
}
for (const item of targets) {
  const upper = item.scope.toUpperCase();
  const source = new S3Client(sourceOptions(upper));
  const target = new S3Client(targetOptions);
  try {
    // Explicitly require full LIST coverage; IAM 403 must FAIL before any cutover.
    const discovered = await scanAllObjects(source, item);
    const owners = [
      ...new Set(
        [...discovered.keys()].map((key) => {
          const prefix = item.prefixes.find((x) => key.startsWith(x));
          return key.slice(prefix.length).split("/")[0];
        }),
      ),
    ];
    const env = {
      [upper + "_LEGACY_BUCKET"]: item.source,
      [upper + "_LEGACY_BUCKET_VERIFIED"]: "true",
      [upper + "_LEGACY_S3_ENDPOINT"]: "https://storage.yandexcloud.net",
      [upper + "_LEGACY_S3_ACCESS_KEY_ID"]: e[upper + "_LEGACY_S3_ACCESS_KEY_ID"],
      [upper + "_LEGACY_S3_SECRET_ACCESS_KEY"]: e[upper + "_LEGACY_S3_SECRET_ACCESS_KEY"],
      [upper + "_BUCKET"]: item.dest,
      [upper + "_S3_ENDPOINT"]: e.CLOUDRU_S3_ENDPOINT,
      [upper + "_S3_ACCESS_KEY_ID"]: e.CLOUDRU_S3_ACCESS_KEY_ID,
      [upper + "_S3_SECRET_ACCESS_KEY"]: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
      [upper + "_DUAL_PROVIDER_CLEANUP"]: "true",
      [upper + "_LEGACY_CDN_RESOURCE_IDS"]: item.originCdn,
      MEDIA_MIGRATION_CONFIRM: "copy-only-owner-media",
    };
    let copied = 0,
      verified = 0,
      count = 0;
    for (const owner of owners) {
      const cfg = requireMediaConfig(item.scope, owner, env, mode === "--apply");
      const result = await migrateOwner(
        cfg,
        { source, target },
        {
          apply: mode === "--apply",
          verify: mode === "--verify",
          maxFiles: 5000,
        },
      );
      copied += result.copied;
      verified += result.alreadyVerified;
      count += result.objectCount;
    }
    if (count !== discovered.size) throw Error("MEDIA_MIRROR_UNACCOUNTED_KEYS");
    const current = await scanAllObjects(source, item);
    if (current.size !== discovered.size || [...current].some(([k, v]) => discovered.get(k) !== v))
      throw Error("MEDIA_MIRROR_SOURCE_CHANGED_DURING_COPY");
    // --apply does not just copy: check every object again after the final page.
    if (mode === "--apply") {
      for (const owner of owners) {
        const cfg = requireMediaConfig(item.scope, owner, env, false);
        await migrateOwner(cfg, { source, target }, { verify: true });
      }
    }
    console.log(
      JSON.stringify({
        kind: item.scope,
        sourceObjects: discovered.size,
        ownerCount: owners.length,
        copied,
        alreadyVerified: verified,
        sourcePreserved: true,
        parityVerified: true,
      }),
    );
  } finally {
    source.destroy();
    target.destroy();
  }
}
console.log(
  "GAFUS_CLOUDRU_LEGACY_MEDIA_" + (mode === "--apply" ? "MIRRORED" : "VERIFIED") + "=PASS",
);
