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

test("every image is release-SHA tagged and old image rollback is preserved", () => {
  assert.match(main, /\$\{\{ matrix\.image\.tag \}\}:sha-\$\{\{ github\.sha \}\}/);
  assert.match(shared, /\$image:sha-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(shared, /RELEASE_SUPERSEDED/);
  assert.match(shared, /PREFLIGHT_IMAGE_RESTORE_FAILED/);
  assert.match(shared, /ROLLBACK_IMAGE_TAG_FAILED/);
  assert.match(shared, /GALLERY_S3_ENDPOINT/);
  assert.match(shared, /FEED_S3_ENDPOINT/);
  assert.match(shared, /VOXIMPLANT_ADMISSION_SECRET/);
});
