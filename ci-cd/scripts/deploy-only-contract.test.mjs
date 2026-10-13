import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const main = read("../../.github/workflows/ci-cd.yml");
const manual = read("../../.github/workflows/deploy-only.yml");
const shared = read("../../.github/workflows/production-deploy-reusable.yml");

test("both workflows invoke one production cutover and serialize releases", () => {
  const path = "uses: ./.github/workflows/production-deploy-reusable.yml";
  assert.equal(main.split(path).length - 1, 1);
  assert.equal(manual.split(path).length - 1, 1);
  assert.match(main, /group:.*gafus-production-deploy/);
  assert.match(manual, /group: gafus-production-deploy/);
  assert.match(shared, /production-schema-cutover\.sh/);
  assert.match(shared, /migration-started/);
  assert.match(shared, /database-backup-path/);
});

test("manual deploy never builds, stops the database or uses the legacy env builder", () => {
  assert.match(manual, /workflow_dispatch/);
  assert.match(manual, /github\.ref == 'refs\/heads\/main'/);
  assert.match(manual, /sha="\$GITHUB_SHA"/);
  assert.match(manual, /cloudru-prepare-media\\tsuccess|cloudru-prepare-media/);
  assert.match(manual, /build-images/);
  assert.doesNotMatch(manual, /docker (pull|build|compose)|docker-compose|migrate deploy|\.env\s*$/m);
  assert.doesNotMatch(manual, /secrets\.POSTGRES_PASSWORD|secrets\.CLOUDRU_S3_SECRET_ACCESS_KEY/);
});

test("every image is release-SHA tagged and rollback stays available during cutover", () => {
  assert.match(main, /\$\{\{ matrix\.image\.tag \}\}:sha-\$\{\{ github\.sha \}\}/);
  assert.match(shared, /\$image:sha-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(shared, /RELEASE_SUPERSEDED/);
  assert.match(shared, /PREFLIGHT_IMAGE_RESTORE_FAILED/);
  assert.match(shared, /ROLLBACK_IMAGE_TAG_FAILED/);
  assert.match(shared, /GALLERY_S3_ENDPOINT/);
  assert.match(shared, /FEED_S3_ENDPOINT/);
  assert.match(shared, /VOXIMPLANT_ADMISSION_SECRET/);
});

test("old Docker release images are pruned without removing live images or volumes", () => {
  assert.match(shared, /cleanup_obsolete_gafus_images\(\) \{/);
  assert.match(shared, /ghcr\.io\/asmtv1\/gafus-\*:rollback-\*\|ghcr\.io\/asmtv1\/gafus-\*:sha-\*/);
  assert.match(shared, /docker image rm "\$image_reference"/);
  assert.doesNotMatch(shared, /docker (volume prune|system prune|image rm -f)/);
  const beforePull = shared.indexOf('cleanup_obsolete_gafus_images\n\n            : >');
  assert.notEqual(beforePull, -1, "stale images must be removed before pulling a new release");
  const healthy = shared.indexOf('Deployment completed and readiness checks passed!');
  const onSuccess = shared.indexOf('cleanup_obsolete_gafus_images', healthy);
  assert.ok(onSuccess > healthy, "temporary rollback and SHA tags must be removed after readiness");
  assert.match(shared, /if \[ "\$restore_ok" = true \]; then\s+cleanup_obsolete_gafus_images/);
  assert.match(shared, /SCHEMA_MIGRATION_STARTED: retaining maintenance mode/);
});
