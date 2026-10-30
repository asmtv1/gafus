/**
 * Explicit production Cloud.ru Container Jobs inventory. The application
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
  j("gafus-gallery-process", "primary", "gallery-worker"),
  j("gafus-gallery-process-2", "primary", "gallery-worker"),
  j("gafus-feed-photo", "primary", "feed-worker"),
  j("gafus-feed-photo-2", "primary", "feed-worker"),
  j("gafus-feed-video", "primary", "feed-worker"),
  j("gafus-feed-video-2", "primary", "feed-worker"),
  j("gafus-questions-photo", "primary", "questions-photo", "v2"),
  j("gafus-chat-photo", "chat2", "chat-photo"),
  j("gafus-chat-photo-2", "chat2", "chat-photo"),
  j("gafus-chat-video", "chat2", "chat-video"),
  j("gafus-chat-video-2", "chat2", "chat-video"),
]);

/** Role-to-registry contracts. CI inspects already running digest-pinned Jobs;
 * image builds happen ONLY in an explicit standalone maintenance workflow. */
export const CLOUDRU_JOB_IMAGES = Object.freeze({
  "gallery-worker": Object.freeze({ media: "gallery", role: "worker", dockerfile: "Dockerfile", target: "" }),
  "feed-worker": Object.freeze({ media: "feed", role: "worker", dockerfile: "Dockerfile", target: "" }),
  "questions-photo": Object.freeze({ media: "questions", role: "photo", dockerfile: "Dockerfile.questions-photo", target: "", repository: "gafus-questions-worker" }),
  "chat-photo": Object.freeze({ media: "chat", role: "photo", dockerfile: "Dockerfile.chat2-job", target: "photo" }),
  "chat-video": Object.freeze({ media: "chat", role: "video", dockerfile: "Dockerfile.chat2-job", target: "video" }),
});

/** Existing runtime contract, checked read-only. Never set any READY/VERIFIED flag. */
export const CLOUDRU_JOB_RUNTIME = Object.freeze({
  "gallery-worker": { required: ["GALLERY_INTERNAL_BASE_URL", "GALLERY_INTERNAL_HMAC_SECRET"], exact: { GALLERY_ENABLED: "true" } },
  "feed-worker": { required: ["FEED_INTERNAL_BASE_URL", "FEED_INTERNAL_HMAC_SECRET"], exact: { FEED_RUN_ONCE: "true" } },
  "questions-photo": { required: ["QUESTIONS_V2_INTERNAL_BASE_URL", "QUESTIONS_V2_INTERNAL_HMAC_SECRET"],
    exact: { QUESTIONS_V2_JOB_ENABLED: "true", QUESTIONS_V2_MEDIA_ENABLED: "true", QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED: "true" } },
  "chat-photo": { required: ["CHAT2_S3_ACCESS_KEY_ID", "CHAT2_S3_SECRET_ACCESS_KEY", "CHAT2_INTERNAL_BASE_URL", "CHAT2_INTERNAL_HMAC_SECRET", "CHAT2_JOB_WORK_ROOT"],
    exact: { CHAT2_JOB_ENABLED: "true", CHAT2_JOB_KIND: "image", CHAT2_S3_ENDPOINT: "https://s3.cloud.ru", CHAT2_S3_BUCKET: "gafus-chat2-media-2026" } },
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
  if (names.has("gafus-questions-photo-2")) throw Error("PHANTOM_QUESTIONS_JOB");
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
