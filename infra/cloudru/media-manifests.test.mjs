import assert from "node:assert/strict";
import { cloudruMediaManifests } from "./media-manifests.mjs";
const projectId = "12345678-1234-1234-1234-123456789012";
const revision = "abcdef0123456789abcdef0123456789abcdef01";
const { services, jobs } = cloudruMediaManifests(projectId, revision);
assert.equal(services.length, 2);
const publicFeed = cloudruMediaManifests(projectId, revision, { feedPublic: true });
assert.deepEqual(publicFeed.services.map(service => service.name), ["gafus-gallery-origin"]);
assert.equal(publicFeed.jobs.length, 5);
for (const job of publicFeed.jobs.filter(job => job.name.startsWith("gafus-feed-")))
  assert(job.template.containers[0].env.some(item => item.name === "FEED_BUCKET_PUBLIC"));
assert.equal(jobs.length, 5);
const questionsEnabled = cloudruMediaManifests(projectId, revision, {questionsProcessing:true});
assert.equal(questionsEnabled.jobs.length, 6);
const questionsJob = questionsEnabled.jobs.find(job => job.name === "gafus-questions-photo");
assert.ok(questionsJob);
assert.equal(questionsJob.imageRole, undefined); // OCI role consumed during manifest creation
assert.equal(questionsJob.template.containers[0].image,
  "gafus.cr.cloud.ru/gafus-questions-worker:" + revision);
assert.equal(questionsJob.runImmediately, false);
assert.equal(questionsJob.template.maxRetries, 3);
assert.equal(questionsJob.template.timeout, 240);
assert.deepEqual(questionsJob.template.containers[0].env.map(v=>v.name), [
  "QUESTIONS_JOB_ENABLED","QUESTIONS_PUBLIC_S3_BUCKET","CLOUDRU_S3_ENDPOINT",
  "CLOUDRU_S3_ACCESS_KEY_ID","CLOUDRU_S3_SECRET_ACCESS_KEY",
]);
assert.equal(publicFeed.jobs.length,5); // Gallery/Feed unchanged when Questions is disabled.

assert.equal(new Set(jobs.map(job => job.name)).size, 5);
for (const kind of ["photo", "video"]) {
  const pool = jobs.filter(job => job.name.startsWith("gafus-feed-" + kind));
  assert.equal(pool.length, 2);
  for (const job of pool) {
    assert.equal(job.template.containers[0].env.find(item => item.name === "FEED_WORKER_TYPE").value, kind);
    assert.equal(job.template.containers[0].env.find(item => item.name === "FEED_JOB_NAME").value, job.name);
  }
  assert.deepEqual(pool[0].template.containers[0].resources, pool[1].template.containers[0].resources);
  assert.equal(pool[0].template.containers[0].image, pool[1].template.containers[0].image);
  if (kind === "video") for (const job of pool) {
    assert.equal(job.template.containers[0].resources.cpu, "2");
    assert.equal(job.template.containers[0].resources.memory, "4096Mi");
  }
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
