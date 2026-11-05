/**
 * Pure Cloud.ru Container Apps/Jobs manifest builder (no network side effects).
 * Mirrors the provider's v2 payload schema; only placeholders are emitted.
 * Operator supplies account-specific secrets OUTSIDE the repository.
 */
const cpuMemory = { 0.2: "512Mi", 0.5: "1024Mi", 1: "4096Mi", 2: "8192Mi" };
const image = (role, revision) => `gafus.cr.cloud.ru/gafus-${role}:${revision}`;
const env = (names) => names.map((name) => ({ name, value: `<secret:${name}>` }));
const feedCommon = [
  "FEED_BUCKET",
  "FEED_S3_ENDPOINT",
  "FEED_S3_ACCESS_KEY_ID",
  "FEED_S3_SECRET_ACCESS_KEY",
];
function container(name, img, cpu, names, port, memory = cpuMemory[cpu]) {
  return {
    name,
    image: img,
    ...(port ? { containerPort: port } : {}),
    resources: { cpu, memory },
    env: env(names),
  };
}
export function cloudruMediaManifests(projectId, revision) {
  if (!/^[a-f0-9-]{32,40}$/.test(projectId) || !/^[a-f0-9]{40}$/.test(revision))
    throw new Error("INVALID_CLOUDRU_RELEASE_ID");
  // Gallery final media is served via a protected Hono 307 -> private S3
  // redirect and Beget CDN. No long-lived Container Apps origin is desired.
  // Only video processing uses Cloud.ru Jobs; Gallery cleanup is local Worker.
  const services = [];
  const jobs = [
    {
      name: "gafus-feed-video",
      imageRole: "feed-worker",
      // Owner-approved four-job Feed Media V2 pool: video 2 vCPU / 8 GiB.
      cpu: "2",
      memory: "8192Mi",
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
          ...container(spec.name, image(spec.imageRole, revision), spec.cpu, spec.envNames, undefined, spec.memory),
          ...(spec.imageRole === "feed-worker"
            ? {
                env: [
                  ...env(spec.envNames),
                  { name: "FEED_RUN_ONCE", value: "true" },
                  {
                    name: "FEED_WORKER_TYPE",
                    value: "video",
                  },
                ],
              }
            : {}),
        },
      ],
    },
  }));
  return { services, jobs };
}
