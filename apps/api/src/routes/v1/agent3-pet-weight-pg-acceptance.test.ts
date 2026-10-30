/**
 * Agent3 acceptance: actual Hono HTTP socket + actual JWT verification + Core
 * getPetWeightHistory + actual Prisma/ephemeral PostgreSQL. No mocks.
 * FAIL CLOSED unless AG3-owned throwaway PG cluster is explicitly provided.
 * Fixture writes stay in this one disposable cluster, never through HTTP.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { parseOwnedPetWeightHistoryData } from "@gafus/types";
import { authMiddleware } from "../../middleware/auth.js";
import { petsRoutes } from "./pets";

const enabled = process.env.AG3_WEIGHT_REAL_PG === "1";
const ownRoot = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/agent3-weight-accept-";
const ownedDir = process.env.AG3_WEIGHT_OWNED_DIR ?? "";
const dbUrl = process.env.DATABASE_URL ?? "";

function assertOnlyDisposableDb() {
  if (!enabled || !ownedDir.startsWith(ownRoot) || !existsSync(ownedDir + "/AG3_OWNED")) {
    throw new Error("AG3_DISPOSABLE_PG_OWNERSHIP_REQUIRED");
  }
  if (realpathSync(ownedDir) !== ownedDir || readFileSync(ownedDir + "/AG3_OWNED", "utf8") !== "agent3-weight-disposable-only\n") {
    throw new Error("AG3_DISPOSABLE_PG_MARKER_MISMATCH");
  }
  if (!/^postgresql:\/\/ag3_local@127\.0\.0\.1:5\d{4}\/agent3_weight_accept\?schema=public$/.test(dbUrl)) {
    throw new Error("AG3_DISPOSABLE_PG_URL_REQUIRED");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("AG3_EPHEMERAL_JWT_SECRET_REQUIRED");
  }
}

type TokenKey = "A" | "B" | "OUTSIDER" | "FORGED_ROLE";
const ids = {
  A: "ag3a" + randomUUID().replaceAll("-", "").slice(0, 17),
  B: "ag3b" + randomUUID().replaceAll("-", "").slice(0, 17),
  OUTSIDER: "ag3c" + randomUUID().replaceAll("-", "").slice(0, 17),
  PET_A: "ag3pa" + randomUUID().replaceAll("-", "").slice(0, 17),
  PET_B: "ag3pb" + randomUUID().replaceAll("-", "").slice(0, 17),
  PET_EMPTY: "ag3pe" + randomUUID().replaceAll("-", "").slice(0, 17),
  PET_CORRUPT: "ag3pc" + randomUUID().replaceAll("-", "").slice(0, 17),
  PET_CORRUPT_DATE: "ag3pd" + randomUUID().replaceAll("-", "").slice(0, 17),
  ENTRY_CORRUPT: "ag3ec" + randomUUID().replaceAll("-", "").slice(0, 17),
  ENTRY_CORRUPT_DATE: "ag3ed" + randomUUID().replaceAll("-", "").slice(0, 17),
};
const users = {
  A: { id: ids.A, username: ids.A, role: "USER" as const },
  B: { id: ids.B, username: ids.B, role: "USER" as const },
  OUTSIDER: { id: ids.OUTSIDER, username: ids.OUTSIDER, role: "USER" as const },
};
const tokens = {} as Record<TokenKey, string>;
const httpApp = new Hono();
httpApp.use("/api/v1/pets/*", authMiddleware);
httpApp.route("/api/v1/pets", petsRoutes);
httpApp.onError((_error, c) => c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500));
let server: ReturnType<typeof serve> | undefined;
let base = "";
let initialCount = 0;

async function get(petId: string, who?: TokenKey | "INVALID") {
  const authorization: Record<string, string> = who
    ? { authorization: "Bearer " + (who === "INVALID" ? "bad.token" : tokens[who]) }
    : {};
  const res = await fetch(base + "/api/v1/pets/" + encodeURIComponent(petId) + "/weight", { headers: authorization });
  const raw = await res.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = { raw }; }
  return { res, body };
}

(enabled ? describe : describe.skip)("AG3 real Hono/JWT/Core/Prisma isolated PG weight GET", () => {
  beforeAll(async () => {
    assertOnlyDisposableDb();
    // Additional SQL proof: both target address and name belong to fresh cluster.
    const [{ name, server_address, server_port }] = await prisma.$queryRawUnsafe<{
      name: string; server_address: string; server_port: number;
    }[]>(`SELECT current_database() AS name, host(inet_server_addr()) AS server_address, inet_server_port() AS server_port`);
    expect(name).toBe("agent3_weight_accept");
    expect(server_address).toBe("127.0.0.1");
    expect(dbUrl).toContain(":" + server_port + "/agent3_weight_accept");

    for (const actor of Object.values(users)) {
      await prisma.user.create({ data: { id: actor.id, username: actor.username, password: "synthetic-no-login", role: actor.role, registrationPending: false } });
    }
    const petSpecs = [
      { id: ids.PET_A, ownerId: ids.A, name: "A", weightKg: 12.5, targetWeightKg: 11.2 },
      { id: ids.PET_B, ownerId: ids.B, name: "B", weightKg: 21.5, targetWeightKg: null },
      { id: ids.PET_EMPTY, ownerId: ids.A, name: "Empty", weightKg: null, targetWeightKg: null },
      { id: ids.PET_CORRUPT, ownerId: ids.A, name: "InvalidFloat", weightKg: null, targetWeightKg: null },
      { id: ids.PET_CORRUPT_DATE, ownerId: ids.A, name: "InvalidDate", weightKg: null, targetWeightKg: null },
    ];
    for (const spec of petSpecs) {
      await prisma.pet.create({ data: { ...spec, type: "DOG", breed: "fixture", birthDate: new Date("2020-01-01T00:00:00.000Z") } });
    }
    for (const item of [
      { id: "ag3-ea-late", petId: ids.PET_A, ownerId: ids.A, weightKg: 12.5, measuredAt: new Date("2026-10-05T10:00:00.000Z"), createdAt: new Date("2026-10-07T10:00:00.000Z") },
      { id: "ag3-ea-first", petId: ids.PET_A, ownerId: ids.A, weightKg: 13.2, measuredAt: new Date("2026-09-01T10:00:00.000Z"), createdAt: new Date("2026-09-02T10:00:00.000Z") },
      { id: "ag3-eb-only", petId: ids.PET_B, ownerId: ids.B, weightKg: 21.5, measuredAt: new Date("2026-10-04T10:00:00.000Z"), createdAt: new Date("2026-10-05T10:00:00.000Z") },
      { id: ids.ENTRY_CORRUPT, petId: ids.PET_CORRUPT, ownerId: ids.A, weightKg: 1, measuredAt: new Date("2026-10-05T10:00:00.000Z") },
      { id: ids.ENTRY_CORRUPT_DATE, petId: ids.PET_CORRUPT_DATE, ownerId: ids.A, weightKg: 1, measuredAt: new Date("2026-10-05T10:00:00.000Z") },
    ]) await prisma.petWeightEntry.create({ data: item });
    await prisma.$executeRaw`UPDATE "PetWeightEntry" SET "weightKg" = 'NaN'::float8 WHERE "id" = ${ids.ENTRY_CORRUPT}`;
    await prisma.$executeRaw`UPDATE "PetWeightEntry" SET "measuredAt" = 'infinity'::timestamp WHERE "id" = ${ids.ENTRY_CORRUPT_DATE}`;
    initialCount = await prisma.petWeightEntry.count();
    for (const [key, actor] of Object.entries(users)) tokens[key as TokenKey] = await generateAccessToken(actor);
    tokens.FORGED_ROLE = await generateAccessToken({ ...users.A, role: "ADMIN" });
    server = serve({ fetch: httpApp.fetch, hostname: "127.0.0.1", port: 0 });
    await new Promise<void>(resolve => server!.listening ? resolve() : server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw Error("AG3_NON_LOOPBACK_SERVER_DENIED");
    base = "http://127.0.0.1:" + address.port;
  }, 45000);

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await prisma.$disconnect();
  });

  it("real SQL A own history: order, ISO dates, target, strict parser; no B row", async () => {
    const { res, body } = await get(ids.PET_A, "A");
    expect(res.status).toBe(200);
    const data = (body as {data:unknown}).data;
    const parsed = parseOwnedPetWeightHistoryData(data, ids.PET_A);
    expect(parsed).not.toBeNull();
    expect(parsed?.currentWeightKg).toBe(12.5);
    expect(parsed?.targetWeightKg).toBe(11.2);
    expect(parsed?.entries.map(x => x.id)).toEqual(["ag3-ea-first", "ag3-ea-late"]);
    expect(parsed?.entries[0]?.measuredAt).toBe("2026-09-01T10:00:00.000Z");
    expect(JSON.stringify(body)).not.toContain("ag3-eb-only");
  });
  it("real SQL B own history only", async () => {
    const { res, body } = await get(ids.PET_B, "B");
    expect(res.status).toBe(200);
    expect(parseOwnedPetWeightHistoryData((body as {data:unknown}).data, ids.PET_B)?.entries.map(x => x.id))
      .toEqual(["ag3-eb-only"]);
    expect(JSON.stringify(body)).not.toContain("ag3-ea-first");
  });
  it.each([
    ["A", "PET_B"], ["B", "PET_A"], ["OUTSIDER", "PET_A"], ["OUTSIDER", "PET_B"],
  ] as const)("real JWT %s cannot see %s (404, no data leak)", async (actor, pet) => {
    const { res, body } = await get(ids[pet], actor);
    expect(res.status).toBe(404);
    expect(body).toEqual({ success: false, error: "Питомец не найден" });
  });
  it("valid owner with empty history gets 200/null weights/[]", async () => {
    const { res, body } = await get(ids.PET_EMPTY, "A");
    expect(res.status).toBe(200);
    expect(parseOwnedPetWeightHistoryData((body as {data:unknown}).data, ids.PET_EMPTY)).toEqual({
      currentWeightKg:null, targetWeightKg:null, entries:[],
    });
  });
  it("missing, bogus JWT and forged role fail real JWT/PG session check", async () => {
    for (const actor of [undefined, "INVALID", "FORGED_ROLE"] as const) {
      const { res } = await get(ids.PET_A, actor);
      expect(res.status).toBe(401);
    }
  });
  it("malformed pet ID preserves owner-obscuring 404", async () => {
    const { res, body } = await get("malformed.pet", "A");
    expect(res.status).toBe(404);
    expect(body).toEqual({ success:false, error:"Питомец не найден" });
  });
  it("DB float NaN is rejected by real Core: HTTP500 without row data", async () => {
    const { res, body } = await get(ids.PET_CORRUPT, "A");
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(ids.ENTRY_CORRUPT);
  });
  it("DB timestamp infinity is rejected by real Prisma/Core: HTTP500", async () => {
    const { res, body } = await get(ids.PET_CORRUPT_DATE, "A");
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(ids.ENTRY_CORRUPT_DATE);
  });
  it("readback after invalid rows: good A still 200; GET never mutates SQL fixtures", async () => {
    const { res, body } = await get(ids.PET_A, "A");
    expect(res.status).toBe(200);
    expect(parseOwnedPetWeightHistoryData((body as {data:unknown}).data, ids.PET_A)?.entries).toHaveLength(2);
    expect(await prisma.petWeightEntry.count()).toBe(initialCount);
    expect(await prisma.pet.findUnique({where:{id:ids.PET_A},select:{weightKg:true}})).toEqual({weightKg:12.5});
  });
});
