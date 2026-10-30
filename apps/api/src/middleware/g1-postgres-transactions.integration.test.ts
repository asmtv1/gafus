/** Opt-in G1 isolated PostgreSQL transaction characterization, without Prisma
 * generation/migrations. Raw SQL only against newly bootstrapped dedicated server.
 * This is NOT equivalent to real GAFUS Core/Prisma integration.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = process.env.G1_LOCAL_PG_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;
let admin: Client;
const url = "postgresql://g1@127.0.0.1:55441/g1_ag1_tests";

suite("G1 isolated PostgreSQL: actual locks, uniqueness and replay primitives", () => {
  beforeAll(async () => {
    if (process.env.G1_LOCAL_PG_URL !== url) {
      throw new Error("G1 PostgreSQL tests require exact isolated 127.0.0.1:55441 database");
    }
    admin = new Client({ connectionString: url, connectionTimeoutMillis: 2_000 });
    await admin.connect();
    await admin.query(`
      CREATE TABLE g1_owned_slots (id text PRIMARY KEY, status text NOT NULL DEFAULT 'FREE');
      CREATE TABLE g1_owned_requests (
        actor_id text NOT NULL, request_id text NOT NULL,
        slot_id text NOT NULL, amount integer NOT NULL,
        PRIMARY KEY (actor_id, request_id), UNIQUE (slot_id)
      );
    `);
  });

  beforeEach(async () => {
    await admin.query("TRUNCATE g1_owned_requests, g1_owned_slots");
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query("DROP TABLE IF EXISTS g1_owned_requests, g1_owned_slots");
    } finally { await admin.end(); }
  });

  it("only one transaction can atomically claim a free slot", async () => {
    const slot = randomUUID();
    await admin.query("INSERT INTO g1_owned_slots(id) VALUES($1)", [slot]);
    const one = new Client({ connectionString: url });
    const two = new Client({ connectionString: url });
    await Promise.all([one.connect(), two.connect()]);
    try {
      await one.query("BEGIN");
      await one.query("SET LOCAL lock_timeout = '5s'");
      const first = await one.query(
        "UPDATE g1_owned_slots SET status='BOOKED' WHERE id=$1 AND status='FREE' RETURNING id", [slot],
      );
      expect(first.rowCount).toBe(1);
      const pending = two.query(
        "UPDATE g1_owned_slots SET status='BOOKED' WHERE id=$1 AND status='FREE' RETURNING id", [slot],
      );
      await one.query("COMMIT");
      const second = await pending;
      expect(second.rowCount).toBe(0);
      const state = await admin.query("SELECT status FROM g1_owned_slots WHERE id=$1", [slot]);
      expect(state.rows[0].status).toBe("BOOKED");
    } finally {
      await one.query("ROLLBACK").catch(() => undefined);
      await Promise.all([one.end(), two.end()]);
    }
  });

  it("same actor + requestId returns same stored operation without duplicate insert", async () => {
    const actor = randomUUID(), requestId = randomUUID(), slot = randomUUID();
    const first = await admin.query(
      `INSERT INTO g1_owned_requests(actor_id,request_id,slot_id,amount)
       VALUES ($1,$2,$3,10) ON CONFLICT DO NOTHING RETURNING slot_id`,
      [actor, requestId, slot],
    );
    const replay = await admin.query(
      `INSERT INTO g1_owned_requests(actor_id,request_id,slot_id,amount)
       VALUES ($1,$2,$3,10) ON CONFLICT DO NOTHING RETURNING slot_id`,
      [actor, requestId, slot],
    );
    expect(first.rowCount).toBe(1);
    expect(replay.rowCount).toBe(0);
    const rows = await admin.query(
      "SELECT slot_id,amount FROM g1_owned_requests WHERE actor_id=$1 AND request_id=$2",
      [actor, requestId],
    );
    expect(rows.rows).toEqual([{ slot_id: slot, amount: 10 }]);
  });

  it("unique slot conflict returns PostgreSQL 23505 without changing first actor", async () => {
    const slot = randomUUID(), actor = randomUUID();
    await admin.query(
      "INSERT INTO g1_owned_requests(actor_id,request_id,slot_id,amount) VALUES($1,$2,$3,10)",
      [actor, randomUUID(), slot],
    );
    await expect(admin.query(
      "INSERT INTO g1_owned_requests(actor_id,request_id,slot_id,amount) VALUES($1,$2,$3,10)",
      [randomUUID(), randomUUID(), slot],
    )).rejects.toMatchObject({ code: "23505" });
    const persisted = await admin.query("SELECT actor_id FROM g1_owned_requests WHERE slot_id=$1", [slot]);
    expect(persisted.rows).toEqual([{ actor_id: actor }]);
  });
});
