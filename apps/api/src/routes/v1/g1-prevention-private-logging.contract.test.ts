/** Private prevention journal: the actual route must not log Core medical error content. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  get: vi.fn(), create: vi.fn(), batch: vi.fn(), update: vi.fn(), remove: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@gafus/core/services/petPrevention", async () => {
  const schemas = await import("../../../../../packages/core/src/services/petPrevention/schemas");
  return {
    ...schemas,
    getEntriesByPet: m.get, createEntry: m.create,
    upsertPreventionEntriesBatch: m.batch, updateEntry: m.update,
    deleteEntry: m.remove,
  };
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logError }),
}));

import { petPreventionRoutes } from "./pet-prevention";

const CANARY = "SYNTHETIC_VET_PRIVATE_MEDICAL_ERROR_DO_NOT_LOG";
const pet = "synthetic-pet-A";
const base = `/api/v1/pets/${pet}/prevention`;
const entry = `${base}/entry-1`;
const single = {
  type: "VACCINATION", performedAt: "2026-10-15T00:00:00.000Z",
  notes: "SYNTHETIC_PRIVATE_RECORD", reminderEnabled: false,
};
const batch = { entries: [{
  clientId: "f8212ead-7fcb-4477-b555-171692349232",
  ...single,
}] };

function app() {
  const server = new Hono();
  server.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", { id: "synthetic-owner", username: "fixture", role: "USER" });
    await next();
  });
  server.route("/api/v1/pets", petPreventionRoutes);
  return server;
}
function req(path: string, method = "GET", payload?: unknown) {
  return app().request(path, {
    method,
    ...(payload === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  });
}
function assertNoCanaryInLogs() {
  expect(m.logError).toHaveBeenCalledTimes(1);
  // Includes the logged Error object, stack and metadata, not only the label.
  const args = m.logError.mock.calls.flat();
  const serialized = args.map(x => x instanceof Error
    ? [x.message, x.stack, String(x.cause)].join(" ")
    : JSON.stringify(x)).join(" ");
  expect(serialized).not.toContain(CANARY);
  expect(serialized).not.toContain("SYNTHETIC_PRIVATE_RECORD");
}

beforeEach(() => vi.resetAllMocks());

describe("AG1 actual prevention journal route: private error logging (mock Core; no SQL)", () => {
  const failing = [
    { name: "GET list", fn: m.get, path: base, method: "GET" },
    { name: "POST create", fn: m.create, path: base, method: "POST", payload: single },
    { name: "POST batch", fn: m.batch, path: `${base}/batch`, method: "POST", payload: batch },
    { name: "PUT update", fn: m.update, path: entry, method: "PUT", payload: { notes: "SYNTHETIC_PRIVATE_RECORD" } },
    { name: "DELETE", fn: m.remove, path: entry, method: "DELETE" },
  ] as const;

  for (const { name, fn, path, method, ...other } of failing) {
    it(`${name} yields unchanged 500 DTO but logs no raw exception`, async () => {
      fn.mockRejectedValueOnce(new Error(CANARY));
      const response = await req(path, method, "payload" in other ? other.payload : undefined);
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).not.toContain(CANARY);
      expect(JSON.parse(body)).toMatchObject({ success: false });
      assertNoCanaryInLogs();
    });
  }

  it("business 404 and 201 remain unchanged, logger silent", async () => {
    m.get.mockResolvedValueOnce({ success: false, error: "Питомец не найден" });
    let response = await req(base);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Питомец не найден" });

    m.create.mockResolvedValueOnce({ success: true, data: { id: "entry-ok" } });
    response = await req(base, "POST", single);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { id: "entry-ok" } });
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("invalid create JSON stays 400 and does not dispatch to Core", async () => {
    const response = await req(base, "POST", { ...single, performedAt: "invalid" });
    expect(response.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.logError).not.toHaveBeenCalled();
  });
  // PREVENTION_JOURNAL_NEW_PORT_FORWARDING: preserve all five existing routes.
  it("GET journal forwards only owner/pet and returns original 200 entry list", async () => {
    const data = [{ id: "journal-1", notes: "SYNTHETIC_RECORD", type: "VACCINATION" }];
    m.get.mockResolvedValueOnce({ success: true, data });
    const response = await req(base);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data });
    expect(m.get).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.batch).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("POST journal uses original Zod date/default semantics and exact Core create port", async () => {
    m.create.mockResolvedValueOnce({ success: true, data: { id: "journal-created" } });
    const response = await req(base, "POST", single);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, data: { id: "journal-created" } });
    expect(m.create).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet, {
      type: "VACCINATION",
      performedAt: new Date("2026-10-15T00:00:00.000Z"),
      notes: "SYNTHETIC_PRIVATE_RECORD",
      reminderEnabled: false,
      reminderKind: "AFTER_DAYS",
      reminderTimes: ["09:00"],
    });
    expect(m.batch).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("POST batch forwards stable clientId, owner and parsed date with unchanged aggregate ACK", async () => {
    const data = { created: 1, updated: 0, errors: [] };
    m.batch.mockResolvedValueOnce({ success: true, data });
    const response = await req(`${base}/batch`, "POST", batch);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data });
    expect(m.batch).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet, [{
      clientId: "f8212ead-7fcb-4477-b555-171692349232",
      type: "VACCINATION",
      performedAt: new Date("2026-10-15T00:00:00.000Z"),
      notes: "SYNTHETIC_PRIVATE_RECORD",
      reminderEnabled: false,
    }]);
    expect(m.get).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("POST same batch twice delegates exactly twice; no invented transport-level deduplication", async () => {
    const created = { success: true, data: { created: 1, updated: 0, errors: [] } };
    const updated = { success: true, data: { created: 0, updated: 1, errors: [] } };
    m.batch.mockResolvedValueOnce(created).mockResolvedValueOnce(updated);
    const first = await req(`${base}/batch`, "POST", batch);
    const second = await req(`${base}/batch`, "POST", batch);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual(created);
    await expect(second.json()).resolves.toEqual(updated);
    expect(m.batch.mock.calls).toHaveLength(2);
    expect(m.batch.mock.calls[0]).toEqual(m.batch.mock.calls[1]);
    expect(m.batch.mock.calls[0][0]).toBe("synthetic-owner");
    expect(m.batch.mock.calls[0][1]).toBe(pet);
    expect(m.batch.mock.calls[0][2][0].clientId).toBe("f8212ead-7fcb-4477-b555-171692349232");
    expect(m.get).not.toHaveBeenCalled();
  });

  it("PUT entry forwards exact owner/pet/entry and optional fields without defaulting", async () => {
    const data = { id: "entry-1", notes: "synthetic-edited" };
    m.update.mockResolvedValueOnce({ success: true, data });
    const response = await req(entry, "PUT", { notes: "synthetic-edited" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data });
    expect(m.update).toHaveBeenCalledExactlyOnceWith(
      "synthetic-owner", pet, "entry-1", { notes: "synthetic-edited" },
    );
    expect(m.get).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.batch).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("DELETE entry forwards exact owner/pet/entry without invoking another command", async () => {
    m.remove.mockResolvedValueOnce({ success: true });
    const response = await req(entry, "DELETE");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.remove).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet, "entry-1");
    expect(m.get).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.batch).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("PUT, DELETE and batch retain existing 404 business responses", async () => {
    m.update.mockResolvedValueOnce({ success: false, error: "Запись не найдена" });
    m.remove.mockResolvedValueOnce({ success: false, error: "Запись не найдена" });
    m.batch.mockResolvedValueOnce({ success: false, error: "Питомец не найден" });
    const update = await req(entry, "PUT", { notes: "synthetic-edited" });
    const remove = await req(entry, "DELETE");
    const sync = await req(`${base}/batch`, "POST", batch);
    expect([update.status, remove.status, sync.status]).toEqual([404, 404, 404]);
    await expect(update.json()).resolves.toEqual({ success: false, error: "Запись не найдена" });
    await expect(remove.json()).resolves.toEqual({ success: false, error: "Запись не найдена" });
    await expect(sync.json()).resolves.toEqual({ success: false, error: "Питомец не найден" });
    expect(m.update).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet, "entry-1", {
      notes: "synthetic-edited",
    });
    expect(m.remove).toHaveBeenCalledExactlyOnceWith("synthetic-owner", pet, "entry-1");
    expect(m.batch).toHaveBeenCalledOnce();
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("invalid batch clientId rejects with original 400 before any Core command", async () => {
    const response = await req(`${base}/batch`, "POST", {
      entries: [{ ...batch.entries[0], clientId: "invalid-client-id" }],
    });
    expect(response.status).toBe(400);
    expect(m.batch).not.toHaveBeenCalled();
    expect(m.logError).not.toHaveBeenCalled();
  });

});
