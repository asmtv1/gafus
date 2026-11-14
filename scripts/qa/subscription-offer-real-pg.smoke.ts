/** Disposable loopback-only verification of GET snapshot + POST CAS under real PG. */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import { getSubscriptionOfferDbSnapshot } from "@gafus/subscription-read-server";
import { initializeAppleTokenForAuthenticatedOwner } from "@gafus/subscription-write-server";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    process.env.GAFUS_SUBSCRIPTION_OFFER_REAL_PG !== "1" ||
    url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
    url.pathname !== "/gafus_refactor_subscription_offer") {
  throw new Error("REFUSING_NON_DISPOSABLE_SUBSCRIPTION_OFFER_DB");
}

async function main() {
  const a = await prisma.user.create({ data: { username: "offer_pg_a", password: "synthetic-disposable" } });
  const b = await prisma.user.create({ data: { username: "offer_pg_b", password: "synthetic-disposable" } });
  const initial = await getSubscriptionOfferDbSnapshot(a.id);
  assert.equal(initial.appleAppAccountToken, null);
  assert.equal((await getSubscriptionOfferDbSnapshot(b.id)).appleAppAccountToken, null);
  const before = (await prisma.user.findUniqueOrThrow({where:{id:a.id},select:{updatedAt:true}})).updatedAt;
  const firstGroup = await Promise.all(Array.from({length:12},()=>initializeAppleTokenForAuthenticatedOwner(a.id)));
  const tokens = new Set(firstGroup.map(x=>x.appleAppAccountToken));
  assert.equal(tokens.size, 1, "CAS must select a single unique persisted winner");
  const winner = firstGroup[0]!.appleAppAccountToken;
  assert.match(winner,/^[0-9a-f-]{36}$/);
  assert.equal((await getSubscriptionOfferDbSnapshot(a.id)).appleAppAccountToken,winner);
  assert.equal((await initializeAppleTokenForAuthenticatedOwner(a.id)).appleAppAccountToken,winner);
  assert.equal((await getSubscriptionOfferDbSnapshot(b.id)).appleAppAccountToken,null);
  const other = (await initializeAppleTokenForAuthenticatedOwner(b.id)).appleAppAccountToken;
  assert.notEqual(other,winner, "owner scope must keep Apple identities isolated");
  assert.equal((await getSubscriptionOfferDbSnapshot(b.id)).appleAppAccountToken,other);
  const afterPost = (await prisma.user.findUniqueOrThrow({where:{id:a.id},select:{updatedAt:true}})).updatedAt;
  await Promise.all(Array.from({length:16},()=>getSubscriptionOfferDbSnapshot(a.id)));
  const afterReads = (await prisma.user.findUniqueOrThrow({where:{id:a.id},select:{updatedAt:true}})).updatedAt;
  assert.equal(afterReads.getTime(),afterPost.getTime(),"GET snapshots must not mutate account timestamp");
  assert.ok(afterPost>=before);
  await assert.rejects(initializeAppleTokenForAuthenticatedOwner("missing-actor"),/Требуется повторная авторизация/);
  console.log("SUBSCRIPTION_OFFER_REAL_PG_PASS: GET read-only, 12 concurrent first POSTs one winner, owner isolation, unchanged updatedAt after 16 GETs");
}
main().then(async()=>prisma.$disconnect())
  .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
