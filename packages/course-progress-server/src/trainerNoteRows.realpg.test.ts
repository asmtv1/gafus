/** Opt-in only: freshly provisioned disposable PostgreSQL 18, never existing user data. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createTrainerNoteRows,
  deleteTrainerNoteRows,
  readStudentNoteRows,
  readTrainerNoteRows,
  readTrainerNoteStudentRoles,
  updateTrainerNoteRows,
} from "./trainerNoteRows";

const enabled = process.env.GAFUS_TRAINER_NOTES_REAL_PG === "enabled";
const qa = describe.runIf(enabled);
const ownerId = "notes-qa-owner";
const secondOwnerId = "notes-qa-other-trainer";
const studentId = "notes-qa-student";

qa("trainer notes SQL isolation and owner-fenced mutations", () => {
  let noteId = "";
  let safeDisposableDatabase = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_trainer_notes_qa");
    const rows = await prisma.$queryRaw<{ database_name: string; server_version: number }[]>`
      SELECT current_database() AS database_name,
             current_setting('server_version_num')::integer AS server_version
    `;
    expect(rows[0]?.database_name).toBe("gafus_trainer_notes_qa");
    expect(rows[0]?.server_version).toBeGreaterThanOrEqual(180000);
    safeDisposableDatabase = true;
    for (const [id, role] of [
      [ownerId, "TRAINER"],
      [secondOwnerId, "TRAINER"],
      [studentId, "USER"],
    ] as const) {
      await prisma.user.create({
        data: { id, username: id, password: "qa-nonsecret", role },
      });
    }
  });

  afterAll(async () => {
    // This test only ever runs on an ephemeral database.
    if (!safeDisposableDatabase) return;
    await prisma.trainerNote.deleteMany({ where: { trainerId: { in: [ownerId, secondOwnerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, secondOwnerId, studentId] } } });
    await prisma.$disconnect();
  });

  it("creates a note and returns only the explicitly visible student entry", async () => {
    const result = await createTrainerNoteRows(
      {
        studentIds: [studentId],
        title: "Private and public",
        tags: ["qa"],
        entries: [
          { content: "visible to student", isVisibleToStudent: true, order: 0 },
          { content: "trainer secret", isVisibleToStudent: false, order: 1 },
        ],
      },
      ownerId,
    );
    noteId = result.id;
    const studentNotes = await readStudentNoteRows(studentId);
    expect(studentNotes).toHaveLength(1);
    expect(studentNotes[0]?.entries.map((entry) => entry.content)).toEqual(["visible to student"]);
    expect(studentNotes[0]?.trainer.id).toBe(ownerId);
    expect(await readStudentNoteRows(secondOwnerId)).toEqual([]);
    const roleRows = await readTrainerNoteStudentRoles([studentId]);
    expect(roleRows).toEqual([{ id: studentId, role: "USER" }]);
  });

  it("filters staff listing and rejects cross-trainer update after a stale read", async () => {
    const own = await readTrainerNoteRows({ page: 0, pageSize: 20, trainerId: ownerId });
    const foreign = await readTrainerNoteRows({ page: 0, pageSize: 20, trainerId: secondOwnerId });
    expect(own.total).toBe(1);
    expect(foreign.total).toBe(0);
    await expect(
      updateTrainerNoteRows(noteId, { title: "corrupt" }, secondOwnerId, false),
    ).rejects.toMatchObject({ code: "P2025" });
    await updateTrainerNoteRows(noteId, { title: "updated" }, ownerId, false);
    const now = await prisma.trainerNote.findUnique({ where: { id: noteId } });
    expect(now?.title).toBe("updated");
  });

  it("rejects cross-trainer deletion but allows explicit privileged deletion", async () => {
    await expect(deleteTrainerNoteRows(noteId, secondOwnerId, false)).rejects.toMatchObject({
      code: "P2025",
    });
    expect(await prisma.trainerNote.count({ where: { id: noteId } })).toBe(1);
    await deleteTrainerNoteRows(noteId, secondOwnerId, true);
    expect(await prisma.trainerNote.count({ where: { id: noteId } })).toBe(0);
  });
});
