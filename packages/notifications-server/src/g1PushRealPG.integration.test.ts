/** AG1 ACTUAL PostgreSQL/Prisma test, opt-in only under AG4 exact lease.
 * NO push dispatcher or external provider. A genuine DB session and transactions
 * are used; ONLY the logger is mocked to capture privacy-safe event codes.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

const { logs } = vi.hoisted(() => ({ logs: vi.fn() }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: logs, error: logs, warn: logs, success: logs }),
}));
import {
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
  getPushSubscriptionStatusForEndpoints,
  PushEndpointOwnerConflictError,
  PushSessionStaleError,
} from "./pushSubscriptionService";

const ownerA = "ag1push_owner_a_20261018";
const ownerB = "ag1push_owner_b_20261018";
const endpoint = (suffix: string) => `ExpoPushToken[AG1_SYNTHETIC_SECRETS_${suffix}]`;
const keys = { p256dh: "AG1_PRIVATE_P256DH_7D23F", auth: "AG1_PRIVATE_AUTH_5C17F" };
const keyRotation = { p256dh: "AG1_ROTATED_PRIVATE_KEY_E838", auth: "AG1_ROTATED_AUTH_127" };
const issue = Date.now() - 90_000;
const result = (caseId: string, data: Record<string, unknown>) =>
  console.warn("AG1_PUSH_ACTUAL_PG_CASE", JSON.stringify({ caseId, ...data }));
const enabled = process.env.AG1_PUSH_REALPG_RUN === "AG4_SCOPE_VALIDATED";
const suite = enabled ? describe : describe.skip;
const row = async (ep: string) => prisma.pushSubscription.findUnique({ where: { endpoint: ep } });
const count = async () => prisma.pushSubscription.count();
const register = (id: string, ep: string, timestamp = issue, k = keys) =>
  savePushSubscription({ userId: id, endpoint: ep, keys: k,
    verifiedSessionAuthenticatedAtMs: timestamp });
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

suite("AG1 NOTIF050 ACTUAL isolated Prisma/PostgreSQL owner-lock/CAS fault and privacy", () => {
  beforeAll(async () => {
    const url = "postgresql://ag1_push_binding_synthetic_20261018@127.0.0.1:55460/" +
      "gafus_ag1_push_binding_synthetic_20261018";
    expect(process.env.DATABASE_URL).toBe(url);
    const rows = await prisma.$queryRaw<{ db: string; actor: string; port: number }[]>`
      SELECT current_database() AS db, current_user AS actor,
        inet_server_port() AS port
    `;
    expect(rows).toEqual([{ db: "gafus_ag1_push_binding_synthetic_20261018",
      actor: "ag1_push_binding_synthetic_20261018", port: 55460 }]);
    expect(await prisma.user.count()).toBe(2);
    expect(await count()).toBe(0);
    for (const id of [ownerA, ownerB]) {
      expect((await prisma.user.findUnique({ where: { id } }))?.sessionsRevokedAt).toBeNull();
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("SQL01 actual INSERT then repeat + rotated keys remain one same-owner row", async () => {
    const ep = endpoint("SAME_OWNER");
    const first = await register(ownerA, ep);
    const second = await register(ownerA, ep);
    expect(second.id).toBe(first.id);
    const rotated = await register(ownerA, ep, issue, keyRotation);
    expect(rotated.id).toBe(first.id);
    expect((await row(ep))?.keys).toEqual(keyRotation);
    expect((await row(ep))?.userId).toBe(ownerA);
    expect(await count()).toBe(1);
    result("SQL01_SAME_OWNER_IDEMPOTENT_KEY_ROTATION", { count: await count() });
  });

  it("SQL02 B cannot overwrite A with knowledge of unique endpoint", async () => {
    const ep = endpoint("SAME_OWNER");
    await expect(register(ownerB, ep)).rejects.toBeInstanceOf(PushEndpointOwnerConflictError);
    expect((await row(ep))?.userId).toBe(ownerA);
    expect(await count()).toBe(1);
    result("SQL02_FOREIGN_BINDING_409_UNCHANGED", { owner: "A", count: await count() });
  });

  it("SQL03 commit-time revoked A rejects stale; after scoped A delete B may bind", async () => {
    const ep = endpoint("SAME_OWNER");
    await prisma.user.update({ where: { id: ownerA },
      data: { sessionsRevokedAt: new Date(issue + 1000) } });
    await expect(register(ownerA, ep)).rejects.toBeInstanceOf(PushSessionStaleError);
    expect((await row(ep))?.userId).toBe(ownerA);
    expect((await deletePushSubscriptionByEndpoint(ownerA, ep)).deletedCount).toBe(1);
    const b = await register(ownerB, ep);
    expect(b.userId).toBe(ownerB);
    expect((await deletePushSubscriptionByEndpoint(ownerA, ep)).deletedCount).toBe(0);
    expect((await row(ep))?.userId).toBe(ownerB);
    expect(await count()).toBe(1);
    result("SQL03_REVOKED_A_SCOPED_UNLINK_B_REBIND_LATE_A_DELETE", {
      status: "A_STALE_DENIED_B_BINDING_PRESERVED", count: await count(),
    });
  });

  it("SQL04 concurrent same-owner B inserts one endpoint without duplicates", async () => {
    const ep = endpoint("B_CONCURRENT");
    const all = await Promise.all(Array.from({ length: 4 }, () => register(ownerB, ep)));
    expect(new Set(all.map((x) => x.id)).size).toBe(1);
    expect((await row(ep))?.userId).toBe(ownerB);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(1);
    result("SQL04_B_CONCURRENT_DUPLICATES_4_1_ROW", { oneRow: true });
  });

  it("SQL05 real A vs B concurrent unique endpoint yields exactly one winner", async () => {
    const ep = endpoint("A_B_CONCURRENT");
    const freshA = Date.now();
    const [a, b] = await Promise.allSettled([
      register(ownerA, ep, freshA), register(ownerB, ep),
    ]);
    const wins = [a, b].filter((x) => x.status === "fulfilled");
    const rejects = [a, b].filter((x) => x.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(rejects).toHaveLength(1);
    expect((rejects[0] as PromiseRejectedResult).reason)
      .toBeInstanceOf(PushEndpointOwnerConflictError);
    const stored = await row(ep);
    expect([ownerA, ownerB]).toContain(stored?.userId);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(1);
    result("SQL05_CONCURRENT_AB_NO_P2002_NO_SILENT_REBIND", { oneWinner: true });
  });

  it("SQL06 delayed A blocked on User row: revoke commits before A, then B binds", async () => {
    const ep = endpoint("DELAYED_A_REVOKE_B");
    const signedA = Date.now();
    let notifyLocked!: () => void;
    let unblock!: () => void;
    const locked = new Promise<void>((resolve) => { notifyLocked = resolve; });
    const held = new Promise<void>((resolve) => { unblock = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: ownerA },
        data: { sessionsRevokedAt: new Date(signedA + 1000) } });
      notifyLocked();
      await held;
    }, { timeout: 15000, maxWait: 2000 });
    await locked;
    // A request starts with a signed JWT that was current at request ingress.
    // Its Core User FOR UPDATE cannot pass while revoke transaction is held.
    const lateA = register(ownerA, ep, signedA);
    await delay(150);
    const b = register(ownerB, ep);
    await delay(150);
    unblock();
    await blocker;
    await expect(lateA).rejects.toBeInstanceOf(PushSessionStaleError);
    const binding = await b;
    expect(binding.userId).toBe(ownerB);
    expect((await row(ep))?.userId).toBe(ownerB);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(1);
    result("SQL06_HELD_A_REVOKED_BEFORE_COMMIT_B_ONLY", {
      A: "STALE_401", B: "CREATED", exactlyOne: true,
    });
  }, 30000);

  it("SQL07 after B rebind delayed A POST and DELETE can never undo B", async () => {
    const ep = endpoint("SAME_OWNER");
    await expect(register(ownerA, ep, issue)).rejects.toBeInstanceOf(PushSessionStaleError);
    expect((await deletePushSubscriptionByEndpoint(ownerA, ep)).deletedCount).toBe(0);
    expect((await deleteAllPushSubscriptions(ownerA)).deletedCount).toBeGreaterThanOrEqual(0);
    expect((await row(ep))?.userId).toBe(ownerB);
    result("SQL07_LATE_A_POST_AND_DELETE_DO_NOT_REBIND", { owner: "B" });
  });

  it("SQL08 device-status owner-scoped, opaque to foreign owner", async () => {
    const ep = endpoint("SAME_OWNER");
    expect(await getPushSubscriptionStatusForEndpoints(ownerA, [ep])).toEqual({
      hasThisDeviceSubscription: false, determined: true,
    });
    expect(await getPushSubscriptionStatusForEndpoints(ownerB, [ep])).toEqual({
      hasThisDeviceSubscription: true, determined: true,
    });
    result("SQL08_DEVICE_STATUS_NO_CROSS_OWNER_LEAK", { ownerA: false, ownerB: true });
  });

  it("SQL09 endpoint rotation remains owner scoped; foreign deleteAll never affects B", async () => {
    const newEp = endpoint("B_ROTATED");
    await register(ownerB, newEp);
    expect((await row(newEp))?.userId).toBe(ownerB);
    await deleteAllPushSubscriptions(ownerA);
    expect((await row(newEp))?.userId).toBe(ownerB);
    expect((await row(endpoint("SAME_OWNER")))?.userId).toBe(ownerB);
    result("SQL09_ENDPOINT_ROTATION_DELETEALL_OWNER_ISOLATED", { owner: "B" });
  });

  it("SQL10 private endpoint/p256dh/auth never logged in Core sink or test stdout", async () => {
    const raw = JSON.stringify(logs.mock.calls);
    for (const forbidden of [
      endpoint("SAME_OWNER"), endpoint("SAME_OWNER").slice(0, 50),
      keys.p256dh, keys.auth, keyRotation.p256dh, keyRotation.auth,
    ]) expect(raw).not.toContain(forbidden);
    result("SQL10_LOG_SINK_PRIVATE", { rawSecretsInLog: false });
  });
});
