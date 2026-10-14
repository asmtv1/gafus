import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const compose = read("ci-cd/docker/docker-compose.prod.yml");
const deploy = read(".github/workflows/production-deploy-reusable.yml");
const cutover = read("ci-cd/scripts/production-schema-cutover.sh");
const migration = read(
  "packages/prisma/migrations/20261015020000_course_content_revision/migration.sql",
);
const fresh = read("packages/prisma/scripts/fresh-db-extras.sql");
const count = (str, text) => str.split(text).length - 1;
test("Web, Trainer and API have automatic cache on by default", () => {
  assert.equal(count(compose, "COURSE_CACHE_SYNC_ENABLED=${COURSE_CACHE_SYNC_ENABLED:-true}"), 3);
  assert.equal(count(compose, "ENABLE_COURSE_CACHE=${ENABLE_COURSE_CACHE:-true}"), 3);
});
test("production deployment writes both flags automatically", () => {
  assert.equal(count(deploy, 'echo "COURSE_CACHE_SYNC_ENABLED=true"'), 1);
  assert.equal(count(deploy, 'echo "ENABLE_COURSE_CACHE=true"'), 1);
  assert.ok(deploy.includes("> ci-cd/docker/.env"));
});
test("migration precedes new application container startup", () => {
  const migrate = cutover.indexOf("compose_call run --rm --no-deps prisma");
  const start = cutover.indexOf("compose_call up -d --no-deps --force-recreate worker api");
  assert.ok(migrate > 0 && start > migrate);
  assert.ok(cutover.includes('test -f "$migration_done"'));
});
test("durable migration and fresh bootstrap include all five invalidation triggers", () => {
  assert.match(read("packages/prisma/schema.prisma"), /model CourseContentRevision \{/);
  assert.match(migration, /UPDATE "CourseContentRevision"/);
  assert.match(migration, /INSERT INTO "CourseContentRevision"/);
  assert.match(
    read("packages/prisma/scripts/bootstrap-fresh-postgres.sh"),
    /INSERT INTO "CourseContentRevision"/,
  );
  assert.match(fresh, /CREATE FUNCTION gafus_bump_course_content_revision/);
  for (const name of ["course", "day_on_course", "training_day", "step_on_day", "step"]) {
    assert.ok(migration.includes(`CREATE TRIGGER "course_content_revision_${name}"`));
    assert.ok(fresh.includes(`CREATE TRIGGER "course_content_revision_${name}"`));
  }
});
