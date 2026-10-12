/** Read-only release gate; no mutations, no secret values in stdout or exceptions. */
import {
  S3Client,
  ListObjectsV2Command,
  GetBucketCorsCommand,
  GetBucketVersioningCommand,
  GetBucketAclCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
} from "@aws-sdk/client-s3";
const env = process.env;
const result = {
  timestamp: new Date().toISOString(),
  project: { connected: false, services: null, jobs: null, registries: null },
  storage: {},
  cors: {},
  bucketPolicyReadiness: {},
  bucketPrivacyReadiness: {},
  cdn: { edgeTokensVerified: false, purgeApiVerified: false, cacheKeyVerified: false },
  cleanup: {
    galleryDualConfigured: false,
    galleryLegacyList: "unconfigured",
    feedDualConfigured: false,
    feedLegacyList: "unconfigured",
  },
  releaseReady: false,
};
async function projectStatus() {
  if (!env.CLOUDRU_KEY_ID || !env.CLOUDRU_KEY_SECRET || !env.CLOUDRU_PROJECT_ID) return;
  try {
    const response = await fetch("https://iam.api.cloud.ru/api/v1/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return;
    const access = (await response.json()).access_token;
    if (typeof access !== "string" || !access) return;
    result.project.connected = true;
    for (const [name, path] of [
      ["services", "/v1/containers"],
      ["jobs", "/v2/jobs"],
    ]) {
      const url = new URL(`https://containers.api.cloud.ru${path}`);
      url.searchParams.set("projectId", env.CLOUDRU_PROJECT_ID);
      url.searchParams.set("pageSize", "100");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const rows = (await response.json()).data;
        result.project[name] = Array.isArray(rows)
          ? rows.map((row) => row.name).filter(Boolean)
          : null;
      }
    }
    try {
      const url = new URL("https://ar.api.cloud.ru/v1/registries");
      url.searchParams.set("projectId", env.CLOUDRU_PROJECT_ID);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const registries = (await response.json()).registries;
        result.project.registries = Array.isArray(registries)
          ? registries.filter((x) => x.registryType === "DOCKER").map((x) => x.name)
          : null;
      }
    } catch {
      /* Registry read access remains unverified. */
    }
  } catch {
    /* Unknown is not success. Never print provider response body. */
  }
}
async function storageStatus() {
  if (
    !env.CLOUDRU_S3_ACCESS_KEY_ID ||
    !env.CLOUDRU_S3_SECRET_ACCESS_KEY ||
    env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru"
  )
    return;
  const client = new S3Client({
    endpoint: "https://s3.cloud.ru",
    region: "ru-central-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  try {
    for (const bucket of new Set(
      [
        env.CLOUDRU_DOCUMENTS_BUCKET,
        env.CLOUDRU_QUESTIONS_BUCKET,
        env.GALLERY_BUCKET,
        env.FEED_BUCKET,
      ].filter(Boolean),
    )) {
      if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket)) continue;
      const method = bucket === "gafus-documents-private" ? "GET" : "POST";
      // This tests OPTIONS only, not the real signed simple POST/GET browser request.
      const action = method === "GET" ? "preflight-get" : "preflight-post";
      try {
        const response = await fetch(`https://s3.cloud.ru/${bucket}/__gafus_cors_readiness__`, {
          method: "OPTIONS",
          headers: {
            Origin: "https://gafus.ru",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers":
              method === "POST" ? "content-type,x-amz-date" : "accept",
          },
          signal: AbortSignal.timeout(8000),
        });
        result.cors[bucket] =
          response.status >= 200 &&
          response.status < 300 &&
          response.headers.get("access-control-allow-origin") === "https://gafus.ru" &&
          (response.headers.get("access-control-allow-methods") ?? "")
            .split(",")
            .some((value) => value.trim().toUpperCase() === method)
            ? `${action}-allowed`
            : `${action}-blocked`;
      } catch {
        result.cors[bucket] = `${action}-unavailable`;
      }
      try {
        await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "__gafus_readiness_nonexistent__/",
            MaxKeys: 1,
          }),
          { abortSignal: AbortSignal.timeout(8000) },
        );
        result.storage[bucket] = "list-allowed";
      } catch {
        result.storage[bucket] = "list-blocked-or-unavailable";
      }
      // Read-only IAM diagnostics. Listing a private bucket does NOT grant
      // GetBucketCORS/GetBucketVersioning (separate Cloud.ru ACL roles).
      const rights = {
        corsRead: "unverified",
        corsRuleCount: null,
        versioningRead: "unverified",
        versioningState: "unknown",
      };
      try {
        const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(8000),
        });
        rights.corsRead = "allowed";
        rights.corsRuleCount = existing.CORSRules?.length ?? 0;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 403) rights.corsRead = "acl-read-denied";
        else if (
          error?.$metadata?.httpStatusCode === 404 ||
          error?.name === "NoSuchCORSConfiguration"
        ) {
          rights.corsRead = "allowed-no-rules";
          rights.corsRuleCount = 0;
        } else rights.corsRead = "unavailable";
      }
      try {
        const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(8000),
        });
        rights.versioningRead = "allowed";
        rights.versioningState =
          versioning.Status === "Enabled"
            ? "enabled"
            : versioning.Status === "Suspended"
              ? "suspended"
              : "disabled-or-unset";
      } catch (error) {
        rights.versioningRead =
          error?.$metadata?.httpStatusCode === 403 ? "acl-read-denied" : "unavailable";
      }
      result.bucketPolicyReadiness[bucket] = rights;
      // Private must be proven by bucket-level policies, not just anonymous
      // HEAD on a synthetic key (some providers return 400 for unsigned GET).
      const privacy = {
        aclRead: "unverified", publicGrants: null,
        publicAccessBlockRead: "unverified", publicAccessBlock: null,
        policyStatusRead: "unverified", policyIsPublic: null,
        verifiedPrivate: false,
      };
      try {
        const acl = await client.send(new GetBucketAclCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(8000),
        });
        privacy.aclRead = "allowed";
        privacy.publicGrants = (acl.Grants ?? []).filter(({ Grantee }) =>
          ["http://acs.amazonaws.com/groups/global/AllUsers",
            "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"].includes(Grantee?.URI),
        ).length;
      } catch (error) {
        privacy.aclRead = error?.$metadata?.httpStatusCode === 403 ? "acl-read-denied" : "unavailable";
      }
      try {
        const block = await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(8000),
        });
        privacy.publicAccessBlockRead = "allowed";
        const settings = block.PublicAccessBlockConfiguration ?? {};
        privacy.publicAccessBlock = {
          blockPublicAcls: settings.BlockPublicAcls === true,
          ignorePublicAcls: settings.IgnorePublicAcls === true,
          blockPublicPolicy: settings.BlockPublicPolicy === true,
          restrictPublicBuckets: settings.RestrictPublicBuckets === true,
        };
      } catch (error) {
        privacy.publicAccessBlockRead = error?.$metadata?.httpStatusCode === 403 ? "acl-read-denied" : "unavailable";
      }
      try {
        const policy = await client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(8000),
        });
        privacy.policyStatusRead = "allowed";
        privacy.policyIsPublic = policy.PolicyStatus?.IsPublic ?? null;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 && error?.name === "NoSuchBucketPolicy") {
          privacy.policyStatusRead = "no-bucket-policy";
          privacy.policyIsPublic = false;
        } else {
          privacy.policyStatusRead = error?.$metadata?.httpStatusCode === 403 ? "acl-read-denied" : "unavailable";
        }
      }
      privacy.verifiedPrivate = privacy.publicGrants === 0 &&
        privacy.policyIsPublic === false &&
        privacy.publicAccessBlock !== null &&
        Object.values(privacy.publicAccessBlock).every(Boolean);
      result.bucketPrivacyReadiness[bucket] = privacy;
    }
  } finally {
    client.destroy();
  }
}
async function legacyStorageStatus() {
  for (const [scope, name] of [
    ["gallery", "GALLERY"],
    ["feed", "FEED"],
  ]) {
    const bucket = env[`${name}_LEGACY_BUCKET`];
    const configured =
      env[`${name}_DUAL_PROVIDER_CLEANUP`] === "true" &&
      env[`${name}_LEGACY_BUCKET_VERIFIED`] === "true" &&
      env[`${name}_LEGACY_S3_ENDPOINT`] === "https://storage.yandexcloud.net" &&
      !!bucket &&
      /^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) &&
      !["gafus-media", "gafus-public", env[`${name}_BUCKET`]].includes(bucket) &&
      !!env[`${name}_LEGACY_S3_ACCESS_KEY_ID`] &&
      !!env[`${name}_LEGACY_S3_SECRET_ACCESS_KEY`] &&
      (Boolean(env[`${name}_LEGACY_CDN_RESOURCE_IDS`]?.trim()) ||
        env[`${name}_LEGACY_CDN_UNCACHED_VERIFIED`] === "true");
    result.cleanup[`${scope}DualConfigured`] = configured;
    if (!configured) continue;
    const client = new S3Client({
      endpoint: "https://storage.yandexcloud.net",
      region: "ru-central1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env[`${name}_LEGACY_S3_ACCESS_KEY_ID`],
        secretAccessKey: env[`${name}_LEGACY_S3_SECRET_ACCESS_KEY`],
      },
      maxAttempts: 1,
    });
    try {
      await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "__gafus_readiness_nonexistent__/",
          MaxKeys: 1,
        }),
        { abortSignal: AbortSignal.timeout(8000) },
      );
      result.cleanup[`${scope}LegacyList`] = "list-allowed";
    } catch {
      result.cleanup[`${scope}LegacyList`] = "list-blocked-or-unavailable";
    } finally {
      client.destroy();
    }
  }
}
await Promise.all([projectStatus(), storageStatus(), legacyStorageStatus()]);
result.cdn.edgeTokensVerified =
  env.GALLERY_CDN_EDGE_TOKEN_VERIFIED === "true" && env.FEED_CDN_EDGE_TOKEN_VERIFIED === "true";
result.cdn.purgeApiVerified = env.CLOUDRU_CDN_PURGE_API_VERIFIED === "true";
result.cdn.cacheKeyVerified = env.CLOUDRU_CDN_CACHE_KEY_VERIFIED === "true";
// These are necessary conditions, not proof of end-to-end production readiness.
result.releaseReady = false;
console.log(JSON.stringify(result, null, 2));
