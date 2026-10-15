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
  "beget-readonly-preflight:",
  "cloudru-build-media-images:",
  "cloudru-prepare-media:",
  "beget-verify-after-deploy:",
  "production-media-release.mjs --prepare",
  "beget-release-readiness.mjs --check",
  "beget-production-smoke.mjs",
])
  assert(ci.includes(gate), "MISSING_CI_GATE_" + gate);
assert(
  ci.indexOf("  beget-readonly-preflight:") < ci.indexOf("  cloudru-build-media-images:") &&
  ci.indexOf("  cloudru-build-media-images:") < ci.indexOf("  cloudru-prepare-media:") &&
  ci.indexOf("  cloudru-prepare-media:") < ci.indexOf("  deploy-production:") &&
  ci.indexOf("  deploy-production:") < ci.indexOf("  beget-verify-after-deploy:"),
  "BEGET_MUST_VERIFY_BEFORE_ANY_MEDIA_PRODUCTION_PREPARATION_AND_AFTER_DEPLOY",
);
assert(/cloudru-build-media-images:\s+needs: \[security, build-apps, cloudru-media-contracts, beget-readonly-preflight\]/.test(ci),
  "NO_PRODUCTION_IMAGE_PUBLICATION_BEFORE_BEGET_APPROVAL");
assert(/beget-verify-after-deploy:\s+needs: \[beget-readonly-preflight, cloudru-prepare-media, deploy-production\]/.test(ci),
  "NO_POSTDEPLOY_BEGET_VERIFY_BEFORE_HEALTHY_APP");
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
// A missing flag on Web/API silently turns off the fast Feed wake-up path.
for (const section of ["web", "api"]) {
  const start = prod.indexOf("  " + section + ":\n");
  assert(start >= 0, "MISSING_PRODUCTION_COMPOSE_SERVICE_" + section);
  const next = prod.indexOf("\n  #", start + 2);
  const service = prod.slice(start, next < 0 ? undefined : next);
  assert(service.includes("- CLOUDRU_MEDIA_JOBS_ENABLED=${CLOUDRU_MEDIA_JOBS_ENABLED:-false}"),
    "FEED_FAST_TRIGGER_DISABLED_ON_" + section);
}
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
