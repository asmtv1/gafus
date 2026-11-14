import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  rows: new Map<string, { id: string; userId: string; endpoint: string; keys: object }>(),
  users: new Map<string, { sessionsRevokedAt: Date | null; registrationPending: boolean }>(),
  logs: vi.fn(),
  nextId: 0,
  pending: Promise.resolve() as Promise<void>,
  holdActor: "" as string,
  hold: Promise.resolve() as Promise<void>,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: data.logs, warn: data.logs, error: data.logs }),
}));
vi.mock("@gafus/prisma", () => ({
  isPrismaUniqueConstraintError: (error: unknown) =>
    !!error && typeof error === "object" && "code" in error && error.code === "P2002",
  prisma: {
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      // One simulated advisory lock across all shared-endpoint attempts.
      if (data.holdActor) {
        const actor = data.holdActor;
        data.holdActor = "";
        if (actor === "A") await data.hold;
      }
      let unlock!: () => void;
      const last = data.pending;
      data.pending = new Promise<void>((done) => { unlock = done; });
      await last;
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...params: unknown[]) => {
          if (String(parts[0]).includes("pg_advisory_xact_lock")) return [];
          const user = data.users.get(String(params[0]));
          return user ? [{ id: params[0], ...user }] : [];
        },
        pushSubscription: {
          findUnique: async ({ where }: { where: { endpoint: string } }) =>
            data.rows.get(where.endpoint) ?? null,
          create: async ({ data: v }: {
            data: { userId: string; endpoint: string; keys: object };
          }) => {
            if (data.rows.has(v.endpoint)) {
              throw Object.assign(new Error("UNIQUE"), { code: "P2002" });
            }
            const result = { id: `row-${++data.nextId}`, ...v };
            data.rows.set(v.endpoint, result);
            return result;
          },
          updateMany: async ({ where, data: update }: {
            where: { id: string; endpoint: string; userId: string };
            data: { userId: string; keys: object };
          }) => {
            const old = data.rows.get(where.endpoint);
            if (!old || old.id !== where.id || old.userId !== where.userId) return { count: 0 };
            data.rows.set(where.endpoint, { ...old, userId: update.userId, keys: update.keys });
            return { count: 1 };
          },
        },
      };
      try { return await cb(tx); } finally { unlock(); }
    },
    pushSubscription: {
      deleteMany: async ({ where }: { where: { userId: string; endpoint?: string } }) => {
        let count = 0;
        for (const [endpoint, record] of data.rows) {
          if (record.userId === where.userId && (!where.endpoint || where.endpoint === endpoint)) {
            data.rows.delete(endpoint); count++;
          }
        }
        return { count };
      },
    },
  },
}));

import {
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
  PushEndpointOwnerConflictError,
  PushSessionStaleError,
} from "./pushSubscriptionService";

const endpoint = "ExponentPushToken[SECRET_NOTIFY_ENDPOINT_1234567890]";
const keys = { p256dh: "P256DH_SECRET_111", auth: "AUTH_SECRET_222" };
const atA = 1_700_000_000_000;
const atB = atA + 10_000;
const register = (userId: string, verifiedSessionAuthenticatedAtMs?: number, override = endpoint) =>
  savePushSubscription({ userId, endpoint: override, keys, verifiedSessionAuthenticatedAtMs });

beforeEach(() => {
  data.rows.clear();
  data.users.clear();
  data.users.set("A", { sessionsRevokedAt: null, registrationPending: false });
  data.users.set("B", { sessionsRevokedAt: null, registrationPending: false });
  data.logs.mockClear();
  data.nextId = 0;
  data.pending = Promise.resolve();
  data.holdActor = "";
  data.hold = Promise.resolve();
});

describe("NOTIF050 fail-closed Core ownership, CAS and signed-session epoch, mocked PG transaction", () => {
  it("N01 same-owner register repeated and keys rotated converges one row", async () => {
    const first = await register("A", atA);
    const second = await register("A", atA);
    expect(second.id).toBe(first.id);
    expect(data.rows.size).toBe(1);
    expect(data.rows.get(endpoint)?.userId).toBe("A");
    expect(data.rows.get(endpoint)?.keys).toEqual(keys);
  });

  it("N02 B cannot silently claim active A endpoint, even with copied keys", async () => {
    await register("A", atA);
    await expect(register("B", atB)).rejects.toBeInstanceOf(PushEndpointOwnerConflictError);
    expect(data.rows.get(endpoint)?.userId).toBe("A");
  });

  it("N03 old A held at start, global A revoked, explicit owner delete, B registered, late A denied", async () => {
    let release!: () => void;
    data.hold = new Promise<void>((done) => { release = done; });
    data.holdActor = "A";
    const lateA = register("A", atA);
    await Promise.resolve();
    data.users.get("A")!.sessionsRevokedAt = new Date(atA + 5000);
    expect(await deletePushSubscriptionByEndpoint("A", endpoint)).toEqual({
      success: true, deletedCount: 0,
    });
    const b = await register("B", atB);
    release();
    await expect(lateA).rejects.toBeInstanceOf(PushSessionStaleError);
    expect(data.rows.size).toBe(1);
    expect(data.rows.get(endpoint)?.userId).toBe("B");
    expect(b.id).toBe(data.rows.get(endpoint)?.id);
  });

  it("N04 concurrent A/B first-registrations never silent last-writer-wins", async () => {
    const attempts = await Promise.allSettled([register("A", atA), register("B", atB)]);
    expect(attempts.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    const denied = attempts.filter((v) => v.status === "rejected");
    expect(denied).toHaveLength(1);
    expect((denied[0] as PromiseRejectedResult).reason)
      .toBeInstanceOf(PushEndpointOwnerConflictError);
    expect(data.rows.size).toBe(1);
  });

  it("N05 B binds after explicit A logout/delete, late A delete cannot remove B", async () => {
    await register("A", atA);
    await deletePushSubscriptionByEndpoint("A", endpoint);
    await register("B", atB);
    expect((await deletePushSubscriptionByEndpoint("A", endpoint)).deletedCount).toBe(0);
    expect((await deleteAllPushSubscriptions("A")).deletedCount).toBe(0);
    expect(data.rows.get(endpoint)?.userId).toBe("B");
  });

  it("N06 session revocation rejects old A; fresh signed reauth and new endpoint allowed", async () => {
    data.users.get("A")!.sessionsRevokedAt = new Date(atA + 1000);
    await expect(register("A", atA)).rejects.toBeInstanceOf(PushSessionStaleError);
    await expect(register("A")).rejects.toBeInstanceOf(PushSessionStaleError);
    expect((await register("A", atA + 2000)).userId).toBe("A");
  });

  it("N07 deleted/registration-pending owners cannot create; later valid B can bind", async () => {
    data.users.delete("A");
    await expect(register("A", atA)).rejects.toBeInstanceOf(PushSessionStaleError);
    data.users.get("B")!.registrationPending = true;
    await expect(register("B", atB)).rejects.toBeInstanceOf(PushSessionStaleError);
    data.users.get("B")!.registrationPending = false;
    expect((await register("B", atB)).userId).toBe("B");
  });

  it("N08 rotating endpoints creates separate owned records and deletes only scoped owner", async () => {
    await register("A", atA);
    await register("A", atA, "ExpoPushToken[ROTATED]" );
    expect(data.rows.size).toBe(2);
    expect((await deleteAllPushSubscriptions("B")).deletedCount).toBe(0);
    expect((await deleteAllPushSubscriptions("A")).deletedCount).toBe(2);
    expect(data.rows.size).toBe(0);
  });

  it("N09 logs never contain endpoint, partial endpoint, push keys or actor identifiers", async () => {
    await register("A", atA);
    await deletePushSubscriptionByEndpoint("A", endpoint);
    const text = JSON.stringify(data.logs.mock.calls);
    for (const secret of [endpoint, endpoint.slice(0, 50), keys.p256dh, keys.auth, '"A"']) {
      expect(text).not.toContain(secret);
    }
  });
});
