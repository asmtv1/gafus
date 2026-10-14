import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
function cli(name, flag, extra = {}) {
  return spawnSync(process.execPath, ["infra/cloudru/" + name, flag, ...(name === "production-cdn-release.mjs" && flag === "--activate" ? ["feed"] : [])], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REF: "refs/heads/develop",
      GITHUB_EVENT_NAME: "push",
      CLOUDRU_PROD_DEPLOY_CONFIRM: "",
      CLOUDRU_CDN_RELEASE_CONFIRM: "",
      ...extra,
    },
    timeout: 12000,
  });
}
for (const filename of [
  "production-media-release.mjs",
  "production-cdn-release.mjs",
  "production-media-mirror.mjs",
  "production-s3-preflight.mjs",
]) {
  const plan = cli(filename, "--plan");
  assert.equal(plan.status, 0, filename + " --plan must be offline and safe");
  const result = JSON.parse(plan.stdout);
  assert(["plan", "--plan"].includes(result.mode), filename + " must return a valid offline plan");
  for (const command of filename.includes("cdn")
    ? ["--preflight", "--prepare", "--activate"]
    : filename.includes("mirror")
      ? ["--apply", "--verify"]
      : filename.includes("s3-preflight")
        ? ["--verify"]
        : ["--prepare", "--verify"]) {
    const blocked = cli(filename, command);
    assert.notEqual(
      blocked.status,
      0,
      filename + " " + command + " should fail without approved main",
    );
    assert.match(blocked.stderr, /NOT_AUTHORIZED|GUARD|APPROVED/);
  }
}
const ci = readFileSync(".github/workflows/ci-cd.yml", "utf8");
const deployment = readFileSync(".github/workflows/production-deploy-reusable.yml", "utf8");
const prod = readFileSync("ci-cd/docker/docker-compose.prod.yml", "utf8");
for (const gate of [
  "production-s3-preflight.mjs --verify",
  "cloudru-media-contracts:",
  "cloudru-build-media-images:",
  "cloudru-prepare-media:",
  "cloudru-activate-cdn:",
  "production-media-release.mjs --prepare",
  "production-cdn-release.mjs --activate gallery",
  "production-cdn-release.mjs --activate feed",
])
  assert(ci.includes(gate), "MISSING_CI_GATE_" + gate);
assert(
  ci.indexOf("cloudru-prepare-media:") < ci.indexOf("  deploy-production:"),
  "MEDIA_MUST_PREPARE_BEFORE_VPS_DEPLOY",
);
assert(
  ci.indexOf("  deploy-production:") < ci.indexOf("  cloudru-activate-cdn:"),
  "CDN_MUST_ACTIVATE_AFTER_VPS_HEALTH",
);
assert(!ci.includes("production-cdn-release.mjs --activate\n"), "NO_JOINT_CDN_ACTIVATION");
assert(ci.includes("steps.cdn_preflight.outcome == 'success'"), "INDEPENDENT_CUTOVER_MUST_REQUIRE_PREFLIGHT");
assert(ci.includes("run: node infra/cloudru/production-cdn-release.mjs --activate gallery\n      - name: Activate and verify Feed CDN independently"), "CDN_STEPS_MUST_BE_INDEPENDENT");
const activation = ci.slice(ci.indexOf("  cloudru-activate-cdn:"));
assert.equal(activation.split('CDN_EDGE_DEGRADED_OK: "true"').length - 1, 2,
  "ONLY_PER_RESOURCE_ACTIVATION_MAY_SOFTEN_HTTP_5XX");
const edgeScript = readFileSync("infra/cloudru/production-cdn-release.mjs", "utf8");
assert(edgeScript.includes("isDegradableCdnFailure(error, x.kind, fallbackVerified)"),
  "SOFT_EDGE_FAILURE_REQUIRES_VERIFIED_S3_AND_ORIGIN");
assert(edgeScript.includes("verifyS3Fallback(x, fixture.key, fixture.bytes)"),
  "FEED_HLS_S3_MUST_BE_VERIFIED_BEFORE_EDGE_DEGRADATION");
assert(edgeScript.includes("CLOUDRU_YANDEX_CDN_CUTOVER=DEGRADED_S3_FALLBACK"),
  "DEGRADED_CDN_MUST_BE_EXPLICIT_IN_LOGS");
assert(!ci.includes("compose_down; exit 1"), "DEPLOY_FAILURE_MUST_NOT_BRING_PRODUCTION_DOWN");
assert(
  ci.includes("Restore previous application if CDN cutover fails"),
  "CUTOVER_MUST_RECOVER_APP",
);
assert(
  ci.includes("CLOUDRU_S3_PROBE_CONFIRM: synthetic-private-s3-only"),
  "PRIVATE_BUCKET_PREFLIGHT_GUARD",
);
// CI/CD and Deploy Only now call the same reusable production script.
assert(
  ci.includes("uses: ./.github/workflows/production-deploy-reusable.yml"),
  "PRODUCTION_MUST_USE_SHARED_RELEASE",
);
assert(
  deployment.includes("CLOUDRU_MEDIA_JOBS_ENABLED=true"),
  "PRODUCTION_PROCESSORS_MUST_ACTIVATE",
);
assert(ci.includes("cloudru-media-contracts:"), "BUILD_MUST_VALIDATE_MEDIA_CONTRACTS");
assert(
  !ci.includes("production-media-mirror.mjs --apply"),
  "NO_LEGACY_MEDIA_MIGRATION_IN_MAIN_DEPLOY",
);
assert(!ci.includes("CLOUDRU_LEGACY_MEDIA_CONFIRM"), "NO_LEGACY_BUCKET_ACCESS_REQUIRED_FOR_DEPLOY");
for (const flag of [
  "GALLERY_MEDIA_FALLBACK_ENABLED",
  "FEED_MEDIA_FALLBACK_ENABLED",
  "CLOUDRU_USER_MEDIA_ENABLED",
  "CLOUDRU_MEDIA_JOBS_ENABLED",
  "GALLERY_CDN_EDGE_TOKEN_VERIFIED",
  "FEED_CDN_EDGE_TOKEN_VERIFIED",
  "GALLERY_PROCESSOR_READY",
])
  assert(prod.includes(flag + "="), "MISSING_PRODUCTION_COMPOSE_ENV_" + flag);
// Public ECR's Node.js mirror returned HTTP 429 for parallel builds.
for (const file of [
  "Dockerfile-web-optimized",
  "Dockerfile-trainer-panel-optimized",
  "Dockerfile-admin-panel-optimized",
  "Dockerfile-api-optimized",
  "Dockerfile-api",
  "Dockerfile-worker-optimized",
  "Dockerfile-bull-board-optimized",
  "Dockerfile-prisma-optimized",
]) {
  const dockerfile = readFileSync("ci-cd/docker/" + file, "utf8");
  assert.equal(
    dockerfile.split("FROM mirror.gcr.io/library/node:20-alpine").length - 1,
    2,
    "NODE_BASE_MUST_USE_AVAILABLE_MIRROR_" + file,
  );
  assert(
    !dockerfile.includes("public.ecr.aws/docker/library/node"),
    "ECR_NODE_RATE_LIMIT_" + file,
  );
}
console.log(
  "Cloud.ru main-only release guards, compose flags, CI ordering and safe failure handling PASS",
);
