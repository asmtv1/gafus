import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrainerDailyImportRoutes, type DailyImportPorts } from "./trainer-daily-import";

const actor = { id: "trainer_a", role: "TRAINER" as const };
const preview = {
  days: [{ date: "2099-01-02", bundleTitle: "Урок", description: "Описание",
    type: "daily_course", equipment: "",
    isPast: false, isEmpty: false, errors: [], steps: [], canImport: true,
    conflict: null, canReplaceConflict: false }],
  hasErrors: false, summary: { totalDays: 1, emptyDays: 0,
    importableDays: 1, conflictDays: 0, errorDays: 0 },
};
let who: { id: string; username: string; role: "TRAINER" | "USER" } =
  { ...actor, username: "trainer" };
const ports = {
  preview: vi.fn(async () => preview),
  confirm: vi.fn(async () => ({ preview, importedDates: ["2099-01-02"], skippedDates: [] })),
} as unknown as DailyImportPorts;
function app() {
  const hono = new Hono();
  hono.use("*", async (c, next) => { c.set("user", who); await next(); });
  hono.route("/import", createTrainerDailyImportRoutes(ports));
  return hono;
}
const send = (url: string, body: unknown) => app().request(url, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); who = { ...actor, username: "trainer" }; });
describe("daily-course safe file import", () => {
  it("shows actual preview and requires same review before confirm", async () => {
    const first = await send("/import/preview", { content: "## 2099-01-02" });
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("private, no-store");
    const response = await first.json();
    expect(response.data.preview.summary.importableDays).toBe(1);
    expect(response.data.previewDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(ports.confirm).not.toHaveBeenCalled();
    const confirm = await send("/import/confirm", {
      content: "## 2099-01-02", previewDigest: response.data.previewDigest,
      confirmation: "ИМПОРТИРОВАТЬ",
    });
    expect(confirm.status).toBe(200);
    expect(ports.confirm).toHaveBeenCalledWith(actor, {
      content: "## 2099-01-02", replaceConflicts: false,
    });
  });
  it("rejects blind mutations, stale preview, occupied dates, wrong content type", async () => {
    expect((await send("/import/confirm", { content: "hello" })).status).toBe(400);
    expect((await send("/import/confirm", { content: "hello",
      previewDigest: "a".repeat(64), confirmation: "ИМПОРТИРОВАТЬ" })).status).toBe(409);
    vi.mocked(ports.preview).mockResolvedValueOnce({ ...preview,
      summary: { ...preview.summary, importableDays: 0 } });
    const noNewDates = await send("/import/preview", { content: "hello" });
    const digest = (await noNewDates.json()).data.previewDigest;
    vi.mocked(ports.preview).mockResolvedValueOnce({ ...preview,
      summary: { ...preview.summary, importableDays: 0 } });
    expect((await send("/import/confirm", { content: "hello", previewDigest: digest,
      confirmation: "ИМПОРТИРОВАТЬ" })).status).toBe(409);
    expect((await send("/import/preview?user=other", { content: "hello" })).status).toBe(400);
    expect(ports.confirm).not.toHaveBeenCalled();
  });
  it("fails closed for nonstaff, and enforces 1 MB", async () => {
    who = { id: "guest", username: "guest", role: "USER" };
    expect((await send("/import/preview", { content: "hello" })).status).toBe(403);
    who = { ...actor, username: "trainer" };
    expect((await send("/import/preview", { content: "x".repeat(1_048_577) })).status).toBe(400);
    expect(ports.preview).not.toHaveBeenCalled();
  });
});
