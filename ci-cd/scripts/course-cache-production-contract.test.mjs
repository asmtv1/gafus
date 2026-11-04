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
const freshBootstrap = read("ci-cd/bootstrap/prisma-fresh/fresh-only-bootstrap.candidate.sql");
const freshInvariants = read("ci-cd/bootstrap/prisma-fresh/010-live-historical-invariants.candidate.sql");
const freshSeeds = read("ci-cd/bootstrap/prisma-fresh/020-synthetic-singletons.candidate.sql");
const count = (str, text) => str.split(text).length - 1;
function composeService(name) {
  const marker = `\n  ${name}:\n`;
  const start = compose.indexOf(marker);
  assert.ok(start >= 0, `Compose service ${name} must exist`);
  const body = compose.slice(start + marker.length);
  const end = body.search(/\n  [a-z0-9-]+:/);
  return end < 0 ? body : body.slice(0, end);
}

test("Hono API enables course cache; static Vite UIs do not need server cache flags", () => {
  const api = composeService("api");
  for (const flag of ["COURSE_CACHE_SYNC_ENABLED", "ENABLE_COURSE_CACHE"]) {
    assert.equal(count(api, `${flag}=\${${flag}:-true}`), 1);
    for (const ui of ["web", "trainer-panel", "admin-panel"]) {
      assert.doesNotMatch(composeService(ui), new RegExp(`${flag}=`));
    }
  }
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
  // Option A moved SQL out of the Bash entrypoint into a SHA-locked candidate.
  // Check the executed path and real bootstrap SQL, not a retired inline seed.
  const entry = read("packages/prisma/scripts/bootstrap-fresh-postgres.sh");
  const apply = read("ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs");
  assert.match(entry, /exec node "\$root\/ci-cd\/bootstrap\/prisma-fresh\/apply-new-empty-db\.mjs" --apply/);
  assert.match(apply, /run\(process\.execPath, \[reviewGate\]/);
  assert.match(apply, /join\(here, 'fresh-only-precondition\.sql'\)/);
  assert.match(apply, /join\(here, 'fresh-only-bootstrap\.candidate\.sql'\)/);
  assert.match(freshSeeds, /INSERT INTO "CourseContentRevision"/);
  assert.match(freshBootstrap, /INSERT INTO "CourseContentRevision"/);
  for (const sql of [freshInvariants, freshBootstrap]) {
    assert.match(sql, /CREATE FUNCTION gafus_bump_course_content_revision/);
    assert.match(sql, /UPDATE "CourseContentRevision"/);
  }
  for (const name of ["course", "day_on_course", "training_day", "step_on_day", "step"]) {
    const trigger = `CREATE TRIGGER "course_content_revision_${name}"`;
    assert.ok(migration.includes(trigger));
    assert.ok(freshInvariants.includes(trigger));
    assert.ok(freshBootstrap.includes(trigger));
  }
});
