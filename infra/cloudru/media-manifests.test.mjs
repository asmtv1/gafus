import assert from "node:assert/strict";
import { cloudruMediaManifests } from "./media-manifests.mjs";
import { readFileSync } from "node:fs";
const projectId = "12345678-1234-1234-1234-123456789012";
const revision = "abcdef0123456789abcdef0123456789abcdef01";
const { services, jobs } = cloudruMediaManifests(projectId, revision);
assert.equal(services.length, 0);
// Never rebuild or reprovision an obsolete Gallery/Feed origin.
const workflow = readFileSync(".github/workflows/cloudru-media-images.yml", "utf8");
const publisher = readFileSync("ci-cd/scripts/publish-cloudru-image.sh", "utf8");
assert(!workflow.includes("role: origin"));
assert(!publisher.includes(":origin:Dockerfile.origin"));
assert.equal(jobs.length, 2);
assert.equal(new Set(jobs.map(job => job.name)).size, 2);
for(const [prefix,expectedCpu,expectedMemory] of [
  ["gafus-feed-video","2","8192Mi"],
]){
  const pool=jobs.filter(job=>job.name===prefix || job.name===prefix+"-2");
  assert.equal(pool.length,2);
  for(const job of pool){
    assert.deepEqual(job.template.containers[0].resources,
      {cpu:expectedCpu,memory:expectedMemory});
    if(prefix.includes("feed"))assert.equal(job.template.containers[0].env.find(item=>item.name==="FEED_WORKER_TYPE").value,"video");
  }
  assert.equal(pool[0].template.containers[0].image,pool[1].template.containers[0].image);
}
assert(!jobs.some(j=>/photo|questions|chat/.test(j.name)));
// No permanent Feed Container App: media processors remain as on-demand Jobs.
for (const job of jobs) {
  assert.equal(job.runImmediately, false);
  assert.equal(job.template.maxRetries, 3);
  assert(!job.template.containers[0].env.some((item) => /YC_|YANDEX/.test(item.name)));
}
assert(
  jobs.some(
    (x) => x.name.includes("video") && x.template.containers[0].resources.memory === "8192Mi",
  ),
);
assert.throws(() => cloudruMediaManifests("bad", revision), /INVALID_CLOUDRU_RELEASE_ID/);
console.log("Cloud.ru manifest layout 0 origin services + 2 Feed VIDEO-only primary jobs PASS");
