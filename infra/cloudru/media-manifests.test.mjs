import assert from "node:assert/strict";
import { cloudruMediaManifests } from "./media-manifests.mjs";
const projectId = "12345678-1234-1234-1234-123456789012";
const revision = "abcdef0123456789abcdef0123456789abcdef01";
const { services, jobs } = cloudruMediaManifests(projectId, revision);
assert.equal(services.length, 2);
assert.equal(jobs.length, 5);
assert.equal(new Set(jobs.map(job => job.name)).size, 5);
for (const kind of ["photo", "video"]) {
  const pool = jobs.filter(job => job.name.startsWith("gafus-feed-" + kind));
  assert.equal(pool.length, 2);
  for (const job of pool) {
    assert.equal(job.template.containers[0].env.find(item => item.name === "FEED_WORKER_TYPE").value, kind);
  }
  assert.deepEqual(pool[0].template.containers[0].resources, pool[1].template.containers[0].resources);
  assert.equal(pool[0].template.containers[0].image, pool[1].template.containers[0].image);
}
for (const service of services) {
  // Yandex CDN cannot reach a Cloud.ru private-only ingress.
  // Origin authenticates incoming CDN requests with a 32+ byte secret header.
  assert.equal(service.configuration.ingress.publiclyAccessible, true);
  assert(service.template.containers[0].env.some((item) => item.name.endsWith('_ORIGIN_SECRET')));
  assert.equal(service.template.scaling.minInstanceCount, 1);
  assert.equal(service.template.scaling.maxInstanceCount, 1);
  assert.equal(service.configuration.autoDeployments.enabled, false);
  assert(
    service.template.containers[0].env.some((item) =>
      item.name.endsWith("_CDN_EDGE_TOKEN_VERIFIED"),
    ),
  );
  assert(service.template.containers[0].env.some((item) =>
    item.name.endsWith("_CDN_EDGE_CACHE_HIT_VERIFIED")));
  assert.equal(service.template.scaling.minInstanceCount, 1);
  assert.equal(service.template.scaling.maxInstanceCount, 1);
}
// Feed needs CPU headroom for signed CDN image and MPEG-TS reads.
const feedOrigin = services.find((service) => service.name === 'gafus-feed-origin');
assert.equal(feedOrigin.template.containers[0].resources.cpu, '0.5');
assert.equal(feedOrigin.template.containers[0].resources.memory, '1024Mi');
for (const job of jobs) {
  assert.equal(job.runImmediately, false);
  assert.equal(job.template.maxRetries, 3);
  assert(!job.template.containers[0].env.some((item) => /YC_|YANDEX/.test(item.name)));
}
assert(
  jobs.some(
    (x) => x.name.includes("video") && x.template.containers[0].resources.memory === "4096Mi",
  ),
);
assert.throws(() => cloudruMediaManifests("bad", revision), /INVALID_CLOUDRU_RELEASE_ID/);
console.log("Cloud.ru manifest layout 2 services + 5 bounded durable jobs PASS");
