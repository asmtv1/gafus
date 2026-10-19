/**
 * Pure Cloud.ru Container Apps/Jobs manifest builder (no network side effects).
 * Mirrors the provider's v2 payload schema; only placeholders are emitted.
 * Operator supplies account-specific secrets OUTSIDE the repository.
 */
const cpuMemory = { 0.2: "512Mi", 0.5: "1024Mi", 1: "4096Mi", 2: "4096Mi", 4: "4096Mi" };
const image = (role, revision) => `gafus.cr.cloud.ru/gafus-${role}:${revision}`;
const env = (names) => names.map((name) => ({ name, value: `<secret:${name}>` }));
const galleryCommon = [
  "GALLERY_BUCKET",
  "GALLERY_S3_ENDPOINT",
  "GALLERY_S3_ACCESS_KEY_ID",
  "GALLERY_S3_SECRET_ACCESS_KEY",
];
const feedCommon = [
  "FEED_BUCKET",
  "FEED_S3_ENDPOINT",
  "FEED_S3_ACCESS_KEY_ID",
  "FEED_S3_SECRET_ACCESS_KEY",
  "FEED_BUCKET_PUBLIC",
];
function container(name, img, cpu, names, port) {
  return {
    name,
    image: img,
    ...(port ? { containerPort: port } : {}),
    resources: { cpu, memory: cpuMemory[cpu] },
    env: env(names),
  };
}
export function cloudruMediaManifests(projectId, revision, { feedPublic = false, galleryRedirect = false, questionsProcessing = false } = {}) {
  if (!/^[a-f0-9-]{32,40}$/.test(projectId) || !/^[a-f0-9]{40}$/.test(revision))
    throw new Error("INVALID_CLOUDRU_RELEASE_ID");
  const services = [
    {
      name: "gafus-gallery-origin",
      kind: "origin",
      imageRole: "gallery-origin",
      cpu: "0.2",
      envNames: [
        ...galleryCommon,
        "GALLERY_ORIGIN_SECRET",
        "GALLERY_CDN_SECRET",
        "GALLERY_CDN_EDGE_TOKEN_VERIFIED",
        "GALLERY_CDN_EDGE_CACHE_HIT_VERIFIED",
      ],
    },
    {
      name: "gafus-feed-origin",
      kind: "origin",
      imageRole: "feed-origin",
      // Keep the HTTPS origin responsive within the CDN's ~5s first-byte limit.
      // Feed performs bounded S3 reads and MPEG-TS delivery; 0.2 vCPU is fragile.
      cpu: "0.5",
      envNames: [
        ...feedCommon,
        "FEED_ORIGIN_SECRET",
        "FEED_CDN_SECRET",
        "FEED_CDN_EDGE_TOKEN_VERIFIED",
        "FEED_CDN_EDGE_CACHE_HIT_VERIFIED",
      ],
    },
  ].filter(spec => !((feedPublic && spec.name === "gafus-feed-origin") ||
    (galleryRedirect && spec.name === "gafus-gallery-origin"))).map((spec) => ({
    name: spec.name,
    projectId,
    description: "GAFUS protected CDN origin, reviewed image",
    configuration: {
      // Yandex CDN is an external HTTPS client, not inside Cloud.ru VPC.
      // The origin is internet-reachable but MUST reject every request without
      // its independently managed CDN-only secret header, including HEAD.
      ingress: { publiclyAccessible: true },
      privileged: false,
      autoDeployments: { enabled: false, pattern: "" },
    },
    template: {
      timeout: "30s",
      idleTimeout: "60s",
      protocol: "http_1",
      // The Yandex edge has a hard ~5-second origin first-byte deadline.
      // Cloud.ru scale-to-zero startup took 11.68s in measured staging.
      // Always keep one *ready* origin replica and verify it before CDN cutover.
      // This consumes baseline Container Apps resources, including when idle.
      // Keep a single provisioned instance during signed-edge validation:
      // scale-out could send traffic to a cold replica and exceed 5 seconds.
      // Increase both min/max together only after multi-instance load testing.
      scaling: { minInstanceCount: 1, maxInstanceCount: 1 },
      containers: [
        container(spec.name, image(spec.imageRole, revision), spec.cpu, spec.envNames, 8080),
      ],
    },
  }));
  const jobs = [
    ...(questionsProcessing ? [{
      name: "gafus-questions-photo",
      imageRole: "questions-worker",
      cpu: "0.5",
      timeout: 240,
      envNames: [
        "QUESTIONS_JOB_ENABLED", "QUESTIONS_PUBLIC_S3_BUCKET",
        "CLOUDRU_S3_ENDPOINT", "CLOUDRU_S3_ACCESS_KEY_ID", "CLOUDRU_S3_SECRET_ACCESS_KEY",
      ],
    }] : []),
    {
      name: "gafus-gallery-process",
      imageRole: "gallery-worker",
      cpu: "0.5",
      timeout: 120,
      envNames: [
        ...galleryCommon,
        "GALLERY_ENABLED",
        "GALLERY_CDN_CACHEABLE_FINAL_ENABLED",
        "GALLERY_CDN_EDGE_TOKEN_VERIFIED",
        "GALLERY_INTERNAL_BASE_URL",
        "GALLERY_INTERNAL_HMAC_SECRET",
      ],
    },
    {
      name: "gafus-feed-photo",
      imageRole: "feed-worker",
      cpu: "0.5",
      timeout: 240,
      envNames: [
        ...feedCommon,
        "GALLERY_S3_ENDPOINT",
        "FEED_ALBUM_BUCKET",
        "GALLERY_S3_ACCESS_KEY_ID",
        "GALLERY_S3_SECRET_ACCESS_KEY",
        "FEED_INTERNAL_BASE_URL",
        "FEED_INTERNAL_HMAC_SECRET",
      ],
    },
    {
      name: "gafus-feed-video",
      imageRole: "feed-worker",
      cpu: "4",
      timeout: 650,
      envNames: [
        ...feedCommon,
        "GALLERY_S3_ENDPOINT",
        "FEED_ALBUM_BUCKET",
        "GALLERY_S3_ACCESS_KEY_ID",
        "GALLERY_S3_SECRET_ACCESS_KEY",
        "FEED_INTERNAL_BASE_URL",
        "FEED_INTERNAL_HMAC_SECRET",
      ],
    },
  ].flatMap((spec) => spec.imageRole === "feed-worker"
    ? [spec, { ...spec, name: spec.name + "-2" }]
    : [spec]).map((spec) => ({
    name: spec.name,
    projectId,
    description: "GAFUS durable core-owned media queue processor",
    runImmediately: false,
    configuration: { privileged: false },
    template: {
      timeout: spec.timeout,
      maxRetries: 3,
      containers: [
        {
          ...container(spec.name, image(spec.imageRole, revision), spec.cpu, spec.envNames),
          ...(spec.imageRole === "feed-worker"
            ? {
                env: [
                  ...env(spec.envNames),
                  { name: "FEED_RUN_ONCE", value: "true" },
                  {
                    name: "FEED_WORKER_TYPE",
                    value: spec.name.includes("-video") ? "video" : "photo",
                  },
                  { name: "FEED_JOB_NAME", value: spec.name },
                ],
              }
            : {}),
        },
      ],
    },
  }));
  return { services, jobs };
}
