/**
 * Main-only Cloud.ru media: --plan is pure, --prepare provisions guarded
 * immutable-image Origins and bounded jobs, --verify audits API state.
 * No CDN changes, no database writes, no user-media operations.
 */
import { spawnSync } from "node:child_process";
import { cloudruMediaManifests } from "./media-manifests.mjs";
import { workerImages } from "./worker-image-pins.mjs";

const mode = process.argv[2] ?? "--plan";
if (!["--plan", "--prepare", "--verify"].includes(mode)) throw Error("BAD_MEDIA_RELEASE_ACTION");
const e = process.env;
const project = e.CLOUDRU_PROJECT_ID ?? "12345678-1234-1234-1234-123456789012";
const sha = e.GITHUB_SHA ?? "abcdef0123456789abcdef0123456789abcdef01";
if (e.FEED_BUCKET_PUBLIC !== undefined && !["true", "false"].includes(e.FEED_BUCKET_PUBLIC))
  throw Error("INVALID_FEED_BUCKET_PUBLIC");
const feedPublic = e.FEED_BUCKET_PUBLIC === "true";
const galleryRedirect = e.GALLERY_CDN_REDIRECT_ENABLED === "true";
const galleryCache = e.GALLERY_CDN_CACHEABLE_FINAL_ENABLED === "true";
if (galleryRedirect && (!galleryCache || e.GALLERY_CDN_METADATA_MIGRATED !== "true"))
  throw Error("GALLERY_CDN_ORIGIN_RETIREMENT_NOT_VERIFIED");
const questionsProcessing = e.QUESTIONS_CLOUD_JOB_ENABLED === "true";
if (e.QUESTIONS_CLOUD_JOB_ENABLED !== undefined &&
    !["true", "false"].includes(e.QUESTIONS_CLOUD_JOB_ENABLED))
  throw Error("QUESTIONS_JOB_INVALID_FLAG");
const base = cloudruMediaManifests(project, sha, { feedPublic, galleryRedirect, questionsProcessing });
if (mode === "--plan") {
  console.log(
    JSON.stringify({
      mode,
      mutates: false,
      origins: base.services.map((x) => x.name),
      jobs: base.jobs.map((x) => x.name),
      requiresPush: false,
    }),
  );
  process.exit(0);
}
const automated = e.GITHUB_EVENT_NAME === "push" &&
  e.CLOUDRU_PROD_DEPLOY_CONFIRM === "preapproved-main-only-media-release" &&
  mode === "--verify";
const manual = e.GITHUB_EVENT_NAME === "workflow_dispatch" &&
  e.CLOUDRU_MANUAL_MEDIA_RELEASE_CONFIRM === "approved-one-time-worker-revision";
if (e.GITHUB_REF !== "refs/heads/main" || (!automated && !manual))
  throw Error("PROD_MEDIA_RELEASE_GUARD");
for (const name of [
  "CLOUDRU_PROJECT_ID",
  "CLOUDRU_KEY_ID",
  "CLOUDRU_KEY_SECRET",
  "CLOUDRU_S3_ACCESS_KEY_ID",
  "CLOUDRU_S3_SECRET_ACCESS_KEY",
  "GALLERY_CDN_SECRET",
  ...(!feedPublic ? ["FEED_CDN_SECRET", "FEED_ORIGIN_SECRET"] : []),
  "GALLERY_ORIGIN_SECRET",
  "GALLERY_INTERNAL_HMAC_SECRET",
  "FEED_INTERNAL_HMAC_SECRET",
])
  if ((e[name] ?? "").length < 10) throw Error("MISSING_RELEASE_ENV_" + name);
if (e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" || !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA))
  throw Error("UNEXPECTED_RELEASE_ENDPOINT_OR_SHA");
// Preserve existing production CDNvideo signing values; Gallery may be longer.
for (const name of ["GALLERY_CDN_SECRET", ...(!feedPublic ? ["FEED_CDN_SECRET"] : [])]) {
  const format = name === "GALLERY_CDN_SECRET"
    ? /^[A-Za-z0-9_-]{24,128}$/ : /^[A-Za-z0-9_-]{24,32}$/;
  if (!format.test(e[name])) throw Error("INVALID_SIGNER_" + name);
}
for (const name of [
  "GALLERY_ORIGIN_SECRET",
  ...(!feedPublic ? ["FEED_ORIGIN_SECRET"] : []),
  "GALLERY_INTERNAL_HMAC_SECRET",
  "FEED_INTERNAL_HMAC_SECRET",
])
  if (Buffer.byteLength(e[name]) < 32) throw Error("INVALID_PROTECTION_" + name);
// No new image is ever built or published by the ordinary deploy. Pins are
// immutable registry digests bound to Git content trees, not the web/API SHA.
const image = workerImages(e);
if (base.services.length) throw Error("CLOUDRU_RETIRED_ORIGIN_NOT_ALLOWED");
for (const [role, pinned] of Object.entries(image)) {
  if (role === "questions-worker" && !questionsProcessing) continue;
  const r = spawnSync("docker", ["manifest", "inspect", "--verbose", pinned], {
    encoding: "utf8",
    timeout: 55000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error("OCI_PINNED_IMAGE_NOT_PUBLISHED_" + role);
  const manifest = JSON.parse(r.stdout);
  const refs = Array.isArray(manifest) ? manifest : [manifest];
  if (!refs.some(item => item?.Descriptor?.platform?.architecture === "amd64" &&
       /^sha256:[a-f0-9]{64}$/.test(item?.Descriptor?.digest ?? "")))
    throw Error("OCI_PINNED_IMAGE_PLATFORM_INVALID_" + role);
}
const values = {
  GALLERY_BUCKET: "gafus-gallery-private",
  FEED_BUCKET: "gafus-feed-private",
  FEED_BUCKET_PUBLIC: feedPublic ? "true" : "false",
  GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
  FEED_S3_ENDPOINT: "https://s3.cloud.ru",
  GALLERY_S3_ACCESS_KEY_ID: e.CLOUDRU_S3_ACCESS_KEY_ID,
  FEED_S3_ACCESS_KEY_ID: e.CLOUDRU_S3_ACCESS_KEY_ID,
  GALLERY_S3_SECRET_ACCESS_KEY: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  FEED_S3_SECRET_ACCESS_KEY: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  GALLERY_ORIGIN_SECRET: e.GALLERY_ORIGIN_SECRET,
  FEED_ORIGIN_SECRET: e.FEED_ORIGIN_SECRET,
  GALLERY_CDN_SECRET: e.GALLERY_CDN_SECRET,
  FEED_CDN_SECRET: e.FEED_CDN_SECRET,
  GALLERY_CDN_EDGE_TOKEN_VERIFIED: "true",
  GALLERY_CDN_CACHEABLE_FINAL_ENABLED: galleryCache ? "true" : "false",
  FEED_CDN_EDGE_TOKEN_VERIFIED: "true",
  GALLERY_CDN_EDGE_CACHE_HIT_VERIFIED: "true",
  FEED_CDN_EDGE_CACHE_HIT_VERIFIED: "true",
  GALLERY_ENABLED: "true",
  GALLERY_INTERNAL_BASE_URL: "https://api.gafus.ru",
  GALLERY_INTERNAL_HMAC_SECRET: e.GALLERY_INTERNAL_HMAC_SECRET,
  FEED_INTERNAL_BASE_URL: "https://api.gafus.ru",
  FEED_INTERNAL_HMAC_SECRET: e.FEED_INTERNAL_HMAC_SECRET,
  FEED_ALBUM_BUCKET: "gafus-gallery-private",
  QUESTIONS_JOB_ENABLED: questionsProcessing ? "true" : "false",
  QUESTIONS_PUBLIC_S3_BUCKET: "gafus-questions-public",
  CLOUDRU_S3_ENDPOINT: "https://s3.cloud.ru",
  CLOUDRU_S3_ACCESS_KEY_ID: e.CLOUDRU_S3_ACCESS_KEY_ID,
  CLOUDRU_S3_SECRET_ACCESS_KEY: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
};
const resources = [...base.services, ...base.jobs];
for (const x of resources) {
  const role =
    (x.name.includes("gallery") ? "gallery" : x.name.includes("questions") ? "questions" : "feed") +
    "-" +
    (x.name.endsWith("-origin") ? "origin" : "worker");
  const c = x.template.containers[0];
  c.image = image[role];
  c.env = c.env.map((item) => {
    const value =
      item.name === "FEED_RUN_ONCE"
        ? "true"
        : item.name === "FEED_WORKER_TYPE" || item.name === "FEED_JOB_NAME"
          ? item.value
          : values[item.name];
    if (value == null) throw Error("UNBOUND_MEDIA_ENV_" + item.name);
    return { name: item.name, value };
  });
  if (
    x.name.endsWith("-origin") &&
    (x.template.scaling?.minInstanceCount !== 1 ||
      x.template.scaling?.maxInstanceCount !== 1 ||
      x.configuration?.ingress?.publiclyAccessible !== true)
  )
    throw Error("PROD_ORIGIN_MUST_BE_WARM_AND_AUTHENTICATED");
  if (!x.name.endsWith("-origin") && x.runImmediately !== false) throw Error("MEDIA_JOB_AUTORUN");
}
const a = await fetch("https://iam.api.cloud.ru/api/v1/auth/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ keyId: e.CLOUDRU_KEY_ID, secret: e.CLOUDRU_KEY_SECRET }),
  signal: AbortSignal.timeout(22000),
});
if (!a.ok) throw Error("CLOUDRU_IAM_AUTH_FAILED_" + a.status);
const token = (await a.json()).access_token;
if (!token) throw Error("CLOUDRU_IAM_TOKEN_MISSING");
async function api(method, path, payload) {
  const r = await fetch("https://containers.api.cloud.ru" + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(35000),
  });
  if (!r.ok) {
    console.error("CLOUDRU_API", method, path.split("?")[0], "status", r.status);
    throw Error("CLOUDRU_MEDIA_API_REJECTED");
  }
  return r.json();
}
const groups = [
  {
    kind: "containers",
    list: "/v1/containers?projectId=" + project + "&pageSize=100",
    items: base.services,
  },
  { kind: "jobs", list: "/v2/jobs?projectId=" + project + "&pageSize=100", items: base.jobs },
];
for (const group of groups) {
  const listing = await api("GET", group.list);
  for (const item of group.items) {
    const found = (listing.data ?? []).find((x) => x.name === item.name);
    if (found) {
      const getPath =
        (group.kind === "jobs" ? "/v2/jobs/" : "/v1/containers/") +
        item.name +
        "?projectId=" +
        project;
      const current = await api("GET", getPath);
      if (
        current.name !== item.name ||
        current.projectId !== project ||
        !current.template?.containers?.[0]?.image?.startsWith("gafus.cr.cloud.ru/gafus-")
      )
        throw Error("CLOUDRU_EXISTING_MEDIA_RESOURCE_NOT_OWNED_" + item.name);
      if (mode === "--prepare") {
        const p = await api(
          "PATCH",
          "/v2/" + group.kind + "/" + item.name + "?projectId=" + project,
          item,
        );
        console.log(
          JSON.stringify({ resource: item.name, action: "update", operationId: p.id ?? null }),
        );
      } else {
        if (current.template.containers[0].image !== item.template.containers[0].image)
          throw Error("CLOUDRU_MEDIA_IMAGE_NOT_CURRENT_" + item.name);
        // The real Questions WebP Job must be deployed at this exact release
        // digest and retain its restricted environment/resources before the
        // new API can start putting private sources into S3.
        if (questionsProcessing && group.kind === "jobs" &&
            item.name === "gafus-questions-photo") {
          const job = current.template;
          const worker = job?.containers?.[0];
          const required = item.template.containers[0].env.map((v) => v.name);
          const actualNames = new Set((worker?.env ?? []).map((v) => v.name));
          if (worker?.name !== item.name || worker.resources?.cpu !== "0.5" ||
              worker.resources?.memory !== "1024Mi" || job.timeout !== 240 ||
              job.maxRetries !== 3 || current.configuration?.privileged !== false ||
              required.some((name) => !actualNames.has(name)))
            throw Error("CLOUDRU_QUESTIONS_JOB_CONFIG_NOT_CURRENT");
          // Cloud.ru may redact GET env values. Revalidate only public
          // constants when actually available, never print secret values.
          for (const [name, expected] of [
            ["QUESTIONS_JOB_ENABLED", "true"],
            ["QUESTIONS_PUBLIC_S3_BUCKET", "gafus-questions-public"],
            ["CLOUDRU_S3_ENDPOINT", "https://s3.cloud.ru"],
          ]) {
            const value = worker.env.find(v => v.name === name)?.value;
            if (value !== undefined && value !== null &&
                value !== "<redacted>" && value !== "********" &&
                value !== expected)
              throw Error("CLOUDRU_QUESTIONS_JOB_ENV_NOT_CURRENT_" + name);
          }
        }
        // Resource changes are asynchronous. Release verification must confirm
        // the exact requested CPU and RAM on both image-processing replicas,
        // without changing Gallery/Feed Video/Questions configuration elsewhere.
        if (group.kind === "jobs" &&
            /^gafus-(?:gallery-process|feed-photo|feed-video)(?:-2)?$/.test(item.name)) {
          const desired = item.template.containers[0].resources;
          const actual = current.template.containers[0].resources;
          if (actual?.cpu !== desired.cpu || actual?.memory !== desired.memory)
            throw Error("CLOUDRU_MEDIA_JOB_RESOURCES_NOT_CURRENT_" + item.name);
        }
        // A 200 from PATCH does not imply the asynchronous Cloud.ru Job update
        // is applied. Never deploy a public-Feed API until every photo/video
        // processor has the matching image AND public-final-object settings.
        if (feedPublic && group.kind === "jobs" && item.name.startsWith("gafus-feed-")) {
          const currentEnv = current.template.containers[0].env ?? [];
          const expectedEnv = item.template.containers[0].env ?? [];
          for (const name of ["FEED_BUCKET_PUBLIC", "FEED_BUCKET", "FEED_S3_ENDPOINT",
            "FEED_RUN_ONCE", "FEED_WORKER_TYPE", "FEED_JOB_NAME"]) {
            const actual = currentEnv.find((env) => env.name === name)?.value;
            const expected = expectedEnv.find((env) => env.name === name)?.value;
            if (expected == null || actual !== expected)
              throw Error("CLOUDRU_FEED_JOB_CONFIG_NOT_CURRENT_" + item.name + "_" + name);
          }
        }
      }
    } else if (mode === "--prepare") {
      const p = await api("POST", "/v2/" + group.kind + "/", item);
      console.log(
        JSON.stringify({ resource: item.name, action: "create", operationId: p.id ?? null }),
      );
    } else throw Error("CLOUDRU_MEDIA_MISSING_" + item.name);
  }
}
if (mode === "--prepare") {
  for (const item of [
    ...(!galleryRedirect ? [{
      name: "gallery",
      host: "gafus-gallery-origin.containerapps.ru",
      secret: e.GALLERY_ORIGIN_SECRET,
    }] : []),
    ...(!feedPublic ? [{ name: "feed", host: "gafus-feed-origin.containerapps.ru", secret: e.FEED_ORIGIN_SECRET }] : []),
  ]) {
    let ready = false;
    for (let n = 0; n < 45; n++) {
      try {
        const url = "https://" + item.host + "/__gafus_cloudru_validation__/missing";
        const anon = await fetch(url, { signal: AbortSignal.timeout(7000) });
        const allowed = await fetch(url, {
          headers: { ["x-" + item.name + "-origin-secret"]: item.secret },
          signal: AbortSignal.timeout(7000),
        });
        if (anon.status === 403 && [400, 404].includes(allowed.status)) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!ready) throw Error("CLOUDRU_ORIGIN_UNREADY_" + item.name);
    console.log(JSON.stringify({ origin: item.name, warm: true, anonymousDenied: true }));
  }
}
console.log("CLOUDRU_MEDIA_" + (mode === "--prepare" ? "PREPARED" : "VERIFIED") + "=PASS");
