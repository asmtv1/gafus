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
  "cloudru-media-contracts:", "beget-readonly-preflight:",
  "cutover-preflight:", "cloudru-jobs-preflight:", "cloudru-jobs-sync:", "cloudru-jobs-verify:", "beget-verify-after-deploy:",
  "beget-release-readiness.mjs --check", "beget-production-smoke.mjs",
]) assert(ci.includes(gate), "MISSING_CI_GATE_" + gate);
assert(ci.indexOf("  beget-readonly-preflight:") < ci.indexOf("  deploy-production:") &&
  ci.indexOf("  deploy-production:") < ci.indexOf("  beget-verify-after-deploy:"),
  "CDN_READONLY_BEFORE_AND_AFTER_APP_DEPLOY");
assert(ci.includes("needs: [beget-readonly-preflight, cloudru-jobs-verify]"),
  "POSTDEPLOY_BEGET_VERIFY_AFTER_HEALTHY_APP");
assert(!/cloudru-jobs-cutover:|cloudru-media-activate:/.test(ci),
  "APP_RELEASE_MUST_NOT_MODIFY_CLOUDRU_JOBS");
for (const forbidden of ["cloudru-build-media-images:", "cloudru-jobs-update:", "cloudru-prepare-media:",
  "production-media-release.mjs --prepare", "publish-cloudru-image.sh", "production-s3-preflight.mjs --verify"]) {
  assert(!ci.includes(forbidden), "NO_CLOUDRU_MUTATION_IN_PRODUCTION_CI_" + forbidden);
}
for (const unsafe of [
  /run:\s+node infra\/cloudru\/production-cdn-release\.mjs --(?:preflight|prepare|activate)/,
  /cloudru-activate-cdn:/,
  /YC_CDN_FOLDER_ID:/,
  /YC_CDN_SA_KEY:/,
  /CDN_EDGE_DEGRADED_OK:/,
  /Install Yandex Cloud CLI/,
  /Restore previous application if CDN cutover fails/,
]) assert.doesNotMatch(ci, unsafe, "NO_ACTIVE_YANDEX_CDN_RELEASE_OR_ROLLBACK");
const sharedReadiness = deployment.indexOf('Validate Beget-only production readiness before SSH');
const sshAction = deployment.indexOf('uses: appleboy/ssh-action@v1.0.3');
assert(sharedReadiness >= 0 && sharedReadiness < sshAction,
  'MANUAL_AND_AUTOMATED_DEPLOY_MUST_CHECK_BEGET_BEFORE_SSH');
assert(deployment.includes('node infra/cloudru/beget-production-smoke.mjs'),
  'SHARED_DEPLOY_MUST_PROVE_LIVE_BEGET_SIGNING_BEFORE_SSH');
assert(!ci.includes("compose_down; exit 1"), "DEPLOY_FAILURE_MUST_NOT_BRING_PRODUCTION_DOWN");
assert(!ci.includes("CLOUDRU_S3_PROBE_CONFIRM"), "NO_PRODUCTION_STORAGE_MUTATION");
// CI/CD and Deploy Only now call the same reusable production script.
assert(
  ci.includes("uses: ./.github/workflows/production-deploy-reusable.yml"),
  "PRODUCTION_MUST_USE_SHARED_RELEASE",
);
assert(
  readFileSync("docs/operations/workflow-archive/production-media-activate-reusable.yml", "utf8").includes("CLOUDRU_MEDIA_JOBS_ENABLED':'true'"),
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
// Static Vite Web has no server credentials; only Hono API enqueues Jobs.
for (const section of ["web", "api"]) {
  const start = prod.indexOf("  " + section + ":\n");
  assert(start >= 0, "MISSING_PRODUCTION_COMPOSE_SERVICE_" + section);
  const next = prod.indexOf("\n  #", start + 2);
  const service = prod.slice(start, next < 0 ? undefined : next);
  if (section === "api") {
    assert(service.includes("- CLOUDRU_MEDIA_JOBS_ENABLED=\u0024{CLOUDRU_MEDIA_JOBS_ENABLED:-false}"),
      "FEED_FAST_TRIGGER_DISABLED_ON_API");
  } else {
    assert(!service.includes("CLOUDRU_KEY_ID=") && !service.includes("CLOUDRU_KEY_SECRET="),
      "CLOUDRU_CONTROL_PLANE_KEYS_LEAKED_TO_STATIC_WEB");
  }
}
// Static Vite frontends legitimately use nginx rather than Node build layers.
for (const file of [
  "Dockerfile-web-optimized",
  "Dockerfile-trainer-panel-optimized",
  "Dockerfile-admin-panel-optimized",
]) {
  const dockerfile = readFileSync("ci-cd/docker/" + file, "utf8");
  assert(dockerfile.includes("FROM nginx:1.27-alpine"), "VITE_STATIC_NGINX_IMAGE_" + file);
  assert(!dockerfile.includes("public.ecr.aws"), "NO_ECR_RATE_LIMIT_" + file);
}
// Backend images still use the reachable Node mirror to avoid ECR 429.
for (const file of [
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
  assert(!dockerfile.includes("public.ecr.aws/docker/library/node"),
    "ECR_NODE_RATE_LIMIT_" + file);
}
console.log(
  "Cloud.ru main-only release guards, compose flags, CI ordering and safe failure handling PASS",
);
