/** AG1 P0: actual Hono + signed JWT + both REAL Core CREATE sources.
 * Isolated transactional Prisma mock only; AG4 owns the actual PG retry.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReminderCoreModule from "@gafus/core/services/reminders";
const db = vi.hoisted(() => ({
  rows: new Map<string, { id: string; userId: string; type: string; name: string }>(),
  receipts: new Map<string, { operationKind: string; fingerprint: string; state: string;
    responseJson: unknown; reminderId: string | null; expiresAt: Date }>(),
  serial: Promise.resolve() as Promise<void>, created: 0, ownerLocks: 0,
}));
vi.mock("@gafus/prisma", () => ({
  isPrismaUniqueConstraintError: () => false,
  prisma: {
    user: { findUnique: async () => ({ registrationPending: false,
      sessionsRevokedAt: null, role: "USER" }) },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const pending = db.serial;
      let unlock!: () => void;
      db.serial = new Promise<void>((resolve) => { unlock = resolve; });
      await pending;
      const rows = new Map(db.rows);
      const receipts = new Map(db.receipts);
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...vars: unknown[]) => {
          if (String(parts[0]).includes('SELECT "id" FROM "User"')) {
            if (!String(parts).includes("FOR UPDATE")) throw new Error("OWNER_LOCK_REQUIRED");
            db.ownerLocks++;
            return [{ id: vars[0] }];
          }
          const receipt = receipts.get(`${vars[0]}:${vars[1]}`);
          return receipt ? [receipt] : [];
        },
        reminder: {
          count: async ({ where }: { where: { userId: string; type: string } }) =>
            [...rows.values()].filter((x) =>
              x.userId === where.userId && x.type === where.type).length,
          create: async ({ data }: { data: { userId: string; name: string; type: string } }) => {
            const row = { ...data, id: `synthetic-reminder-${++db.created}` };
            rows.set(row.id, row);
            return row;
          },
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            rows.get(where.id)?.userId === where.userId ? { id: where.id } : null,
        },
        $executeRaw: async (parts: TemplateStringsArray, ...vars: unknown[]) => {
          if (String(parts[0]).includes('INSERT INTO "ReminderMutationReceipt"')) {
            receipts.set(`${vars[0]}:${vars[1]}`, {
              operationKind: "CREATE", fingerprint: String(vars[2]),
              state: "PENDING", reminderId: null, responseJson: null,
              expiresAt: vars[3] as Date,
            });
            return 1;
          }
          const receipt = receipts.get(`${vars[2]}:${vars[3]}`)!;
          receipt.state = "COMMITTED";
          receipt.reminderId = String(vars[0]);
          receipt.responseJson = JSON.parse(String(vars[1])) as unknown;
          return 1;
        },
      };
      try {
        const answer = await cb(tx);
        db.rows = rows;
        db.receipts = receipts;
        return answer;
      } finally { unlock(); }
    },
    $queryRaw: async (_parts: TemplateStringsArray, ...vars: unknown[]) => {
      const receipt = db.receipts.get(`${vars[0]}:${vars[1]}`);
      return receipt ? [receipt] : [];
    },
    reminder: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        db.rows.get(where.id)?.userId === where.userId ? { id: where.id } : null,
    },
  },
}));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
// Keep REAL compiled Core createReminder/createReminderAG4; mock unrelated reads only.
vi.mock("@gafus/core/services/reminders", async (importOriginal) => ({
  ...await importOriginal<typeof ReminderCoreModule>(),
  getReminders: vi.fn(), updateReminder: vi.fn(), deleteReminder: vi.fn(),
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { remindersRoutes } from "./reminders";
let jwt = "";
const key = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const root = "http://local.test/api/v1/reminders";
const app = new Hono();
app.use("/api/v1/reminders/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/reminders/*", authMiddleware);
app.route("/api/v1/reminders", remindersRoutes);
const post = (keyed?: string) => app.request(root, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json",
    ...(keyed ? { "Idempotency-Key": keyed } : {}) },
  body: JSON.stringify({ name: "Synthetic training", reminderTime: "09:30" }),
});
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  jwt = await generateAccessToken({ id: "synthetic-owner-A", username: "synthetic-a", role: "USER" });
});
beforeEach(() => {
  db.rows.clear(); db.receipts.clear(); db.created = 4; db.ownerLocks = 0;
  db.serial = Promise.resolve();
  for (let i = 1; i <= 4; i++) db.rows.set(`preexisting-${i}`, {
    id: `preexisting-${i}`, userId: "synthetic-owner-A", type: "training", name: "Synthetic",
  });
});
const verifyPair = async (pair: (Response | Promise<Response>)[]) => {
  const [a, b] = await Promise.all(pair);
  for (const res of [a, b]) expect(res.headers.get("cache-control")).toContain("no-store");
  expect([a.status, b.status].sort()).toEqual([200, 400]);
  const rejected = a.status === 400 ? a : b;
  const body = await rejected.json() as { code?: string; error?: string };
  expect(body.error).toBe("Максимум 5 напоминаний");
  if (body.code !== undefined) expect(body.code).toBe("REMINDER_LIMIT_REACHED");
  expect(db.rows.size).toBe(5);
  expect(db.receipts.size).toBeGreaterThanOrEqual(0);
  expect(db.receipts.size).toBeLessThanOrEqual(1);
  expect(db.ownerLocks).toBe(2);
};
describe("P0 real Hono + real Core source owner-lock mixed CREATE, fake PG transactions", () => {
  it("M01 four existing: keyed and keyless race -> one success, one business400", async () => {
    await verifyPair([post(key(1)), post()]);
  });
  it("M02 four existing: keyless and keyed reversed call order", async () => {
    await verifyPair([post(), post(key(2))]);
  });
  it("M03 four existing: two keyless concurrent never create sixth", async () => {
    await verifyPair([post(), post()]);
    expect(db.receipts.size).toBe(0);
  });
  it("M04 keyed replay under full cap returns old receipt, not a sixth write", async () => {
    const first = await post(key(4));
    expect(first.status).toBe(200);
    const beforeId = ((await first.json()) as { data: { id: string } }).data.id;
    const again = await post(key(4));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: { id: string } }).data.id).toBe(beforeId);
    expect(db.rows.size).toBe(5);
    expect(db.receipts.size).toBe(1);
    expect(db.ownerLocks).toBe(2);
  });
});
