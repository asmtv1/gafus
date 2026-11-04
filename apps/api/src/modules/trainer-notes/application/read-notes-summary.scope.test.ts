/** Explicit proof that empty trainerId is an ADMIN-only intentional read.
 * HTTP grants isAdmin only for the principal with role ADMIN; this application
 * must never broaden the filter for a trainer or moderator, nor expose bodies.
 */
import { describe, expect, it, vi } from "vitest";
import { createReadTrainerNotesSummaryApplication } from "./read-notes-summary";
const createdAt = new Date("2026-11-04T12:00:00.000Z");
const sourceNote = {
  id: "synthetic-note-id", title: "Synthetic note", tags: ["internal"],
  createdAt, trainerId: "other-owner", body: "PRIVATE_NOTE_BODY_NEVER_RETURN",
  studentId: "PRIVATE_STUDENT_ID_NEVER_RETURN",
};

describe("Trainer notes summary application: principal-scoped adapter invocation", () => {
  it.each([
    { label: "trainer", isAdmin: false },
    { label: "moderator", isAdmin: false },
  ])("$label always requests only principal-owned notes and a bounded projection", async ({ isAdmin }) => {
    const snapshot = vi.fn().mockResolvedValue({ notes: [sourceNote], total: 1 });
    const app = createReadTrainerNotesSummaryApplication({ readSnapshot: snapshot });
    const result = await app.execute({ actorUserId: "current-actor", isAdmin, page: 1, pageSize: 3 });
    expect(snapshot).toHaveBeenCalledExactlyOnceWith({ trainerId: "current-actor" }, 1, 3);
    expect(result).toEqual({ notes: [
      { id: sourceNote.id, title: sourceNote.title, tags: ["internal"],
        createdAt: "2026-11-04T12:00:00.000Z" },
    ], total: 1, page: 1, pageSize: 3 });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NOTE_BODY_NEVER_RETURN");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STUDENT_ID_NEVER_RETURN");
  });
  it("ADMIN-only mode intentionally permits all-trainer metadata projection, not student entries", async () => {
    const snapshot = vi.fn().mockResolvedValue({ notes: [sourceNote], total: 1 });
    const result = await createReadTrainerNotesSummaryApplication({ readSnapshot: snapshot })
      .execute({ actorUserId: "admin-principal", isAdmin: true, page: 0, pageSize: 50 });
    expect(snapshot).toHaveBeenCalledExactlyOnceWith({}, 0, 50);
    expect(Object.keys(result.notes[0]!).sort()).toEqual(["createdAt", "id", "tags", "title"]);
  });
  it("rejects malformed source rows rather than silently leaking unknown data", async () => {
    const snapshot = vi.fn().mockResolvedValue({ notes: [{ ...sourceNote, createdAt: "2026-11-04" }], total: 1 });
    await expect(createReadTrainerNotesSummaryApplication({ readSnapshot: snapshot }).execute({
      actorUserId: "current-actor", isAdmin: false, page: 0, pageSize: 50,
    })).rejects.toThrow("INVALID_NOTES_SUMMARY_SOURCE");
  });
  it("rejects overfilled pages, bogus totals, and out-of-contract projections", async () => {
    for (const payload of [
      { notes: [sourceNote, sourceNote], total: 2 },
      { notes: [sourceNote], total: 0 },
      { notes: [sourceNote], total: Number.NaN },
    ]) {
      const app = createReadTrainerNotesSummaryApplication({
        readSnapshot: vi.fn().mockResolvedValue(payload),
      });
      await expect(app.execute({
        actorUserId: "current-actor", isAdmin: false, page: 0, pageSize: 1,
      })).rejects.toThrow("INVALID_NOTES_SUMMARY_SOURCE");
    }
  });
});
