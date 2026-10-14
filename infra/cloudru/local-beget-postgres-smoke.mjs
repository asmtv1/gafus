/** Read-only to real data: exercise the actual MediaCdnPurge migration and job
 * transitions in a TRANSACTION-LOCAL schema, then ROLLBACK everything.
 * Deliberately DOES NOT touch CDN/S3 or read production secrets.
 * Run: node --env-file=.env.local infra/cloudru/local-beget-postgres-smoke.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const requireWorker = createRequire(new URL('../../packages/worker/package.json', import.meta.url));
const { Client } = requireWorker('pg');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('LOCAL_POSTGRES_URL_MISSING');
const parsed = new URL(connectionString);
if (!['postgresql:', 'postgres:'].includes(parsed.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(parsed.pathname.slice(1)))
  throw new Error('ONLY_LOCAL_POSTGRES_ALLOWED');

const schema = `beget_smoke_${randomUUID().replaceAll('-', '')}`;
const migration = readFileSync(new URL('../../packages/prisma/migrations/20261014222000_beget_media_purge/migration.sql', import.meta.url), 'utf8');
const db = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
let transactionStarted = false;
try {
  await db.connect();
  await db.query('BEGIN');
  transactionStarted = true;
  // Both DDL and test data vanish at ROLLBACK, including on exceptions.
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query(migration);
  const relations = await db.query("SELECT COUNT(*)::integer AS count FROM pg_tables WHERE schemaname = $1 AND tablename = 'MediaCdnPurge'", [schema]);
  assert.equal(relations.rows[0].count, 1, 'Migration must create exactly one outbox table');

  const galleryPath = '/albums/tester/album/photos/photo/thumb.webp';
  const feedPath = '/posts/tester/post/attachments/media/full.webp';
  for (const [id, scope, path] of [
    ['gallery:test-job', 'gallery', galleryPath], ['feed:test-job', 'feed', feedPath],
  ]) {
    await db.query(`INSERT INTO "MediaCdnPurge" ("id", "scope", "paths")
      VALUES ($1,$2,$3::text[]) ON CONFLICT ("id") DO NOTHING`, [id, scope, [path]]);
    await db.query(`INSERT INTO "MediaCdnPurge" ("id", "scope", "paths")
      VALUES ($1,$2,$3::text[]) ON CONFLICT ("id") DO NOTHING`, [id, scope, [path]]);
  }
  const count = await db.query('SELECT COUNT(*)::int AS total FROM "MediaCdnPurge"');
  assert.equal(count.rows[0].total, 2, 'Enqueue must be idempotent');

  const token = randomUUID();
  const claim = await db.query(`UPDATE "MediaCdnPurge"
    SET "status"='processing', "attemptToken"=$1, "attempts"="attempts"+1,
      "leaseUntil"=timezone('UTC', now()) + interval '10 minutes',
      "updatedAt"=timezone('UTC', now())
    WHERE "id"=(SELECT "id" FROM "MediaCdnPurge"
      WHERE ("status"='pending' AND "availableAt" <= timezone('UTC', now()))
         OR ("status"='processing' AND "leaseUntil" < timezone('UTC', now()))
      ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`, [token]);
  assert.equal(claim.rowCount, 1, 'Worker must claim one job');
  const job = claim.rows[0];
  assert.equal(job.attempts, 1);
  assert.equal(job.status, 'processing');

  const stale = await db.query(`UPDATE "MediaCdnPurge" SET "status"='done'
    WHERE "id"=$1 AND "attemptToken"=$2 AND "leaseUntil">timezone('UTC', now())`,
    [job.id, randomUUID()]);
  assert.equal(stale.rowCount, 0, 'Obsolete attempt cannot mark done');

  const acceptedReceipt = 'beget:synthetic-provider-acceptance:not-a-real-cdn-check';
  const checkpoint = await db.query(`UPDATE "MediaCdnPurge"
    SET "purgeOperations"=$1::text[], "updatedAt"=timezone('UTC',now())
    WHERE "id"=$2 AND "attemptToken"=$3 AND "status"='processing'
      AND "leaseUntil">timezone('UTC',now())`, [[acceptedReceipt], job.id, token]);
  assert.equal(checkpoint.rowCount, 1, 'Checkpoint must be stored before retry');

  const retry = await db.query(`UPDATE "MediaCdnPurge" SET
    "status"='pending', "attemptToken"=NULL, "leaseUntil"=NULL,
    "errorCode"='MEDIA_PURGE_PENDING',
    -- A real retry is claimed by a later transaction. This smoke deliberately
    -- uses one frozen transaction and PostgreSQL TIMESTAMP(3), so make the
    -- scheduled retry unambiguously due regardless of millisecond rounding.
    "availableAt"=timezone('UTC', now()) - interval '1 second',
    "updatedAt"=timezone('UTC',now())
    WHERE "id"=$1 AND "attemptToken"=$2 AND "status"='processing'
      AND "leaseUntil">timezone('UTC',now())`, [job.id, token]);
  assert.equal(retry.rowCount, 1, 'Pending job must be re-queued');

  const reClaimToken = randomUUID();
  const reClaim = await db.query(`UPDATE "MediaCdnPurge" SET
    "status"='processing', "attemptToken"=$1, "attempts"="attempts"+1,
    "leaseUntil"=timezone('UTC', now()) + interval '10 minutes'
    WHERE "id"=$2 AND "status"='pending' AND "availableAt"<=timezone('UTC',now())
    RETURNING *`, [reClaimToken, job.id]);
  assert.equal(reClaim.rowCount, 1);
  assert.equal(reClaim.rows[0].attempts, 2);
  assert.deepEqual(reClaim.rows[0].purgeOperations, [acceptedReceipt], 'Retry must preserve submitted operations');
  const complete = await db.query(`UPDATE "MediaCdnPurge" SET "status"='done',
    "paths"=ARRAY[]::text[], "purgeOperations"=ARRAY[]::text[],
    "attemptToken"=NULL, "leaseUntil"=NULL, "errorCode"=NULL
    WHERE "id"=$1 AND "attemptToken"=$2 AND "status"='processing'
      AND "leaseUntil">timezone('UTC',now())`, [job.id, reClaimToken]);
  assert.equal(complete.rowCount, 1);

  const completed = await db.query('SELECT "status", "paths", "purgeOperations" FROM "MediaCdnPurge" WHERE "id"=$1', [job.id]);
  assert.equal(completed.rows[0].status, 'done');
  assert.deepEqual(completed.rows[0].paths, []);
  assert.deepEqual(completed.rows[0].purgeOperations, []);

  console.log(JSON.stringify({ database: parsed.pathname.slice(1), migration: 'PASS',
    idempotentEnqueue: 'PASS', lease: 'PASS', staleWorkerFence: 'PASS',
    durableCheckpointAndRetry: 'PASS', cleanCompletion: 'PASS', testedScopes: ['gallery', 'feed'],
    isolation: 'transaction_rollback', providerLiveRequests: 'NOT_TESTED' }));
} finally {
  if (transactionStarted) {
    try {
      await db.query('ROLLBACK');
      const residual = await db.query('SELECT COUNT(*)::integer AS count FROM pg_namespace WHERE nspname=$1', [schema]);
      assert.equal(residual.rows[0].count, 0, 'Test schema must not survive rollback');
      console.log('POSTGRES_ROLLBACK_CONFIRMED_NO_TEST_SCHEMA_REMAINS');
    } catch {
      console.error('POSTGRES_ROLLBACK_VALIDATION_FAILED');
      throw new Error('POSTGRES_SMOKE_ROLLBACK_UNVERIFIED');
    }
  }
  await db.end().catch(() => undefined);
}
