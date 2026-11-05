/** Run ONLY against a disposable loopback PostgreSQL instance; never production. */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import {
  assertWalkHistoryAccess, listCompletedDogWalks, syncCompletedDogWalks,
} from "../../packages/core/src/services/walks/index.js";

const address = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (address.protocol !== "postgresql:" || address.hostname !== "127.0.0.1" || !address.port) {
  throw new Error("Refusing non-loopback PostgreSQL for walk smoke tests");
}

const clientId = "25a7961a-f21d-47ba-9710-1c1f3cd38dbe";
const sample = {
  clientId,
  startedAt: "2026-11-05T09:00:00.000Z",
  finishedAt: "2026-11-05T10:00:00.000Z",
  durationSeconds: 1800,
  steps: 2500,
  estimatedMeters: 2000,
  timerMode: "stopwatch" as const,
  incompleteSteps: false,
};

async function main() {
  await assertWalkHistoryAccess("person-a");
  await assertWalkHistoryAccess("person-b");
  await assert.rejects(assertWalkHistoryAccess("person-c"), /WALKS_FORBIDDEN/);
  await syncCompletedDogWalks("person-a", [sample]);
  await syncCompletedDogWalks("person-a", [{ ...sample, steps: 2900, estimatedMeters: 2320 }]);
  await syncCompletedDogWalks("person-b", [{ ...sample, steps: 400, estimatedMeters: 320 }]);
  const first = await listCompletedDogWalks("person-a");
  const second = await listCompletedDogWalks("person-b");
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0]?.steps, 2900);
  assert.equal(second[0]?.steps, 400);
  const total = await prisma.dogWalkRecord.count({ where: { clientId } });
  assert.equal(total, 2, "shared client UUID must remain isolated between owners");
  console.log("DOG_WALK_REAL_PG_PASS: owner ACL, idempotent upsert, owner isolation, 2 rows");
}
main().then(async () => prisma.$disconnect())
  .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
