/**
 * Explicit VIDEO-only production Cloud.ru Container Jobs inventory. The application
 * dispatcher is checked against this contract by production-job-release.test.
 * Do not infer project/registry/credentials from a Job's name at runtime.
 */
export const CLOUDRU_PROJECTS = Object.freeze({
  primary: Object.freeze({
    projectId: "4c590727-4133-475b-a4bc-564c90a9e686",
    projectIdEnv: "CLOUDRU_PROJECT_ID",
    keyIdEnv: "CLOUDRU_KEY_ID",
    keySecretEnv: "CLOUDRU_KEY_SECRET",
    registry: "gafus.cr.cloud.ru",
    iamVersion: "v1",
  }),
  chat2: Object.freeze({
    projectId: "6777bd18-4ee9-4d15-bb1b-134f7a18ed3a",
    projectIdEnv: "CHAT2_CLOUDRU_PROJECT_ID",
    keyIdEnv: "CHAT2_CLOUDRU_KEY_ID",
    keySecretEnv: "CHAT2_CLOUDRU_KEY_SECRET",
    registry: "gafus-chat2-20261028.cr.cloud.ru",
    iamVersion: "v2",
  }),
});

const j = (name, project, imageRole, iamVersion = CLOUDRU_PROJECTS[project].iamVersion) =>
  Object.freeze({ name, project, imageRole, iamVersion });
export const CLOUDRU_PRODUCTION_JOBS = Object.freeze([
  j("gafus-feed-video", "primary", "feed-worker"),
  j("gafus-feed-video-2", "primary", "feed-worker"),
  j("gafus-chat-video", "chat2", "chat-video"),
  j("gafus-chat-video-2", "chat2", "chat-video"),
]);

/** Role-to-registry contracts. CI inspects already running digest-pinned Jobs;
 * image builds happen ONLY in an explicit standalone maintenance workflow. */
export const CLOUDRU_JOB_IMAGES = Object.freeze({
  "feed-worker": Object.freeze({ media: "feed", role: "worker", dockerfile: "Dockerfile", target: "" }),
  "chat-video": Object.freeze({ media: "chat", role: "video", dockerfile: "Dockerfile.chat2-job", target: "video" }),
});

/** Existing runtime contract, checked read-only. Never set any READY/VERIFIED flag. */
export const CLOUDRU_JOB_RUNTIME = Object.freeze({
  "feed-worker": { required: ["FEED_INTERNAL_BASE_URL", "FEED_INTERNAL_HMAC_SECRET"], exact: { FEED_RUN_ONCE: "true" } },
  "chat-video": { required: ["CHAT2_S3_ACCESS_KEY_ID", "CHAT2_S3_SECRET_ACCESS_KEY", "CHAT2_INTERNAL_BASE_URL", "CHAT2_INTERNAL_HMAC_SECRET", "CHAT2_JOB_WORK_ROOT"],
    exact: { CHAT2_JOB_ENABLED: "true", CHAT2_JOB_KIND: "video", CHAT2_S3_ENDPOINT: "https://s3.cloud.ru", CHAT2_S3_BUCKET: "gafus-chat2-media-2026" } },
});

export const imageRepository = (entry) => {
  const scope = CLOUDRU_PROJECTS[entry.project];
  if (!scope) throw Error("UNKNOWN_CLOUDRU_PROJECT_SCOPE_" + entry.name);
  if (!CLOUDRU_JOB_IMAGES[entry.imageRole]) throw Error("UNKNOWN_CLOUDRU_IMAGE_ROLE_" + entry.name);
  return `${scope.registry}/${CLOUDRU_JOB_IMAGES[entry.imageRole].repository ?? "gafus-" + entry.imageRole}`;
};
export function validateProductionInventory(items = CLOUDRU_PRODUCTION_JOBS) {
  const names = new Set();
  for (const entry of items) {
    if (names.has(entry.name)) throw Error("DUPLICATE_CLOUDRU_JOB_" + entry.name);
    names.add(entry.name);
    imageRepository(entry);
    if (!["v1", "v2"].includes(entry.iamVersion)) throw Error("UNKNOWN_CLOUDRU_IAM_VERSION_" + entry.name);
  }
  // No release or reconciliation may re-activate any image/photography container.
  for (const name of names) {
    if (/^gafus-(feed-photo(?:-2)?|chat-photo(?:-2)?|questions-photo(?:-2)?|gallery-process(?:-2)?)$/.test(name))
      throw Error("RETIRED_CLOUDRU_PHOTO_JOB_" + name);
  }
  return items;
}
export function resolveProjectBindings(env, items = CLOUDRU_PRODUCTION_JOBS) {
  validateProductionInventory(items);
  const keys = [...new Set(items.map((x) => x.project))];
  return Object.fromEntries(keys.map((key) => {
    const scope = CLOUDRU_PROJECTS[key];
    if (env[scope.projectIdEnv] !== scope.projectId)
      throw Error("CLOUDRU_PROJECT_MISMATCH_" + scope.projectIdEnv);
    if (!env[scope.keyIdEnv] || !env[scope.keySecretEnv])
      throw Error("CLOUDRU_CREDENTIALS_MISSING_" + key);
    return [key, { ...scope, keyId: env[scope.keyIdEnv], keySecret: env[scope.keySecretEnv] }];
  }));
}
