import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
function cli(name, flag, extra = {}) {
  return spawnSync(process.execPath, ["infra/cloudru/" + name, flag], {
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
const prod = readFileSync("ci-cd/docker/docker-compose.prod.yml", "utf8");
for (const gate of [
  "production-s3-preflight.mjs --verify",
  "cloudru-media-contracts:",
  "cloudru-build-media-images:",
  "cloudru-prepare-media:",
  "cloudru-activate-cdn:",
  "production-media-release.mjs --prepare",
  "production-cdn-release.mjs --activate",
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
assert(!ci.includes("compose_down; exit 1"), "DEPLOY_FAILURE_MUST_NOT_BRING_PRODUCTION_DOWN");
assert(
  ci.includes("Restore previous application if CDN cutover fails"),
  "CUTOVER_MUST_RECOVER_APP",
);
assert(
  ci.includes("CLOUDRU_S3_PROBE_CONFIRM: synthetic-private-s3-only"),
  "PRIVATE_BUCKET_PREFLIGHT_GUARD",
);
assert(ci.includes("CLOUDRU_MEDIA_JOBS_ENABLED=true"), "PRODUCTION_PROCESSORS_MUST_ACTIVATE");
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
console.log(
  "Cloud.ru main-only release guards, compose flags, CI ordering and safe failure handling PASS",
);
