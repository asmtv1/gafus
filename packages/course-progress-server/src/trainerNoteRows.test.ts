import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTrainerNoteRows,
  deleteTrainerNoteRows,
  readStudentNoteRows,
  readTrainerNoteForDelete,
  readTrainerNoteForUpdate,
  readTrainerNoteRows,
  readTrainerNoteStudentRoles,
  updateTrainerNoteRows,
} from "./trainerNoteRows";

const db = vi.hoisted(() => ({
  noteList: vi.fn(),
  noteUnique: vi.fn(),
  noteCount: vi.fn(),
  noteCreate: vi.fn(),
  noteUpdate: vi.fn(),
  noteDelete: vi.fn(),
  userList: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findMany: db.userList },
    trainerNote: {
      findMany: db.noteList,
      findUnique: db.noteUnique,
      count: db.noteCount,
      create: db.noteCreate,
      update: db.noteUpdate,
      delete: db.noteDelete,
    },
    $transaction: db.transaction,
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.noteList.mockResolvedValue([]);
  db.noteCount.mockResolvedValue(0);
  db.userList.mockResolvedValue([]);
  db.transaction.mockImplementation(async (cb) =>
    cb({ trainerNote: { create: db.noteCreate, update: db.noteUpdate } }),
  );
});

describe("trainer note infrastructure boundary", () => {
  it("student reads require BOTH own membership and a visible entry, projecting only visible entries", async () => {
    await readStudentNoteRows("own-student");
    const { where, select } = db.noteList.mock.calls[0]![0];
    expect(where).toEqual({
      students: { some: { studentId: "own-student" } },
      entries: { some: { isVisibleToStudent: true } },
    });
    expect(select.entries.where).toEqual({ isVisibleToStudent: true });
    expect(select.trainer.select.profile.select).toEqual({
      fullName: true,
      avatarUrl: true,
    });
    expect(select.students).toBeUndefined();
  });

  it("actor roles are read with bounded id/role projection only", async () => {
    await readTrainerNoteStudentRoles(["s1", "s2"]);
    expect(db.userList).toHaveBeenCalledWith({
      where: { id: { in: ["s1", "s2"] } },
      select: { id: true, role: true },
    });
  });

  it("create persists students and visible entries in a single transaction", async () => {
    db.noteCreate.mockResolvedValue({ id: "note-1" });
    await createTrainerNoteRows(
      {
        studentIds: ["s1"],
        title: "t",
        entries: [{ content: "public", isVisibleToStudent: true }],
      },
      "trainer-1",
    );
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.noteCreate).toHaveBeenCalledWith({
      data: {
        trainerId: "trainer-1",
        title: "t",
        tags: [],
        students: { create: [{ studentId: "s1" }] },
        entries: { create: [{ content: "public", order: 0, isVisibleToStudent: true }] },
      },
    });
  });

  it("read-for-update returns owner and private content only for Core authorization and notification comparison", async () => {
    await readTrainerNoteForUpdate("note-1");
    expect(db.noteUnique).toHaveBeenCalledWith({
      where: { id: "note-1" },
      select: {
        id: true,
        trainerId: true,
        students: { select: { studentId: true } },
        entries: { select: { content: true, isVisibleToStudent: true } },
      },
    });
  });

  it("owner is fenced inside the UPDATE, not only by a prior SELECT", async () => {
    await updateTrainerNoteRows("note-1", { title: "new" }, "trainer-1", false);
    expect(db.noteUpdate).toHaveBeenCalledWith({
      where: { id: "note-1", trainerId: "trainer-1" },
      data: { title: "new" },
    });
    await updateTrainerNoteRows("note-1", { title: "new" }, "moderator", true);
    expect(db.noteUpdate).toHaveBeenLastCalledWith({
      where: { id: "note-1" },
      data: { title: "new" },
    });
  });

  it("DELETE is owner-fenced and explicit admin bypass requires true", async () => {
    await readTrainerNoteForDelete("note-1");
    expect(db.noteUnique).toHaveBeenCalledWith({
      where: { id: "note-1" },
      select: { id: true, trainerId: true },
    });
    await deleteTrainerNoteRows("note-1", "trainer-1", false);
    expect(db.noteDelete).toHaveBeenCalledWith({
      where: { id: "note-1", trainerId: "trainer-1" },
    });
    await deleteTrainerNoteRows("note-1", "admin", true);
    expect(db.noteDelete).toHaveBeenLastCalledWith({ where: { id: "note-1" } });
  });

  it("staff list uses exact trainer, student, tag filters and bounded pagination", async () => {
    await readTrainerNoteRows({
      page: 2,
      pageSize: 8,
      trainerId: "trainer-1",
      studentId: "s1",
      tags: ["tag"],
    });
    const { where, skip, take } = db.noteList.mock.calls[0]![0];
    expect(where).toEqual({
      trainerId: "trainer-1",
      students: { some: { studentId: "s1" } },
      tags: { hasSome: ["tag"] },
    });
    expect(skip).toBe(16);
    expect(take).toBe(8);
    expect(db.noteCount).toHaveBeenCalledWith({ where });
  });
});
