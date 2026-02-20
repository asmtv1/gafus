import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createTrainerNote,
  updateTrainerNote,
  deleteTrainerNote,
  getStudentNotes,
  getTrainerNotes,
} from "./notesService";

const mockHandlePrismaError = vi.fn(() => {
  throw new Error("Prisma mock error");
});

vi.mock("@gafus/core/errors", () => ({
  handlePrismaError: (...args: unknown[]) => mockHandlePrismaError(...args),
}));

const mockUserFindMany = vi.fn();
const mockTrainerNoteFindUnique = vi.fn();
const mockTrainerNoteFindMany = vi.fn();
const mockTrainerNoteCount = vi.fn();
const mockTrainerNoteCreate = vi.fn();
const mockTrainerNoteUpdate = vi.fn();
const mockTrainerNoteDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    trainerNote: {
      findUnique: (...args: unknown[]) => mockTrainerNoteFindUnique(...args),
      findMany: (...args: unknown[]) => mockTrainerNoteFindMany(...args),
      count: (...args: unknown[]) => mockTrainerNoteCount(...args),
      create: (...args: unknown[]) => mockTrainerNoteCreate(...args),
      update: (...args: unknown[]) => mockTrainerNoteUpdate(...args),
      delete: (...args: unknown[]) => mockTrainerNoteDelete(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("createTrainerNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = { trainerNote: { create: mockTrainerNoteCreate } };
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it("returns error when students not found", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);

    const result = await createTrainerNote(
      {
        studentIds: ["s1", "s2"],
        entries: [{ content: "text", order: 0, isVisibleToStudent: false }],
      },
      "trainer-1",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найдены");
  });

  it("returns error when studentIds includes trainer", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "s1", role: "USER" },
      { id: "trainer-1", role: "USER" },
    ]);

    const result = await createTrainerNote(
      {
        studentIds: ["s1", "trainer-1"],
        entries: [{ content: "text", order: 0, isVisibleToStudent: false }],
      },
      "trainer-1",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("самому себе");
  });

  it("returns success when valid input", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);
    mockTrainerNoteCreate.mockResolvedValue({});

    const result = await createTrainerNote(
      {
        studentIds: ["s1"],
        entries: [{ content: "Заметка", order: 0, isVisibleToStudent: false }],
      },
      "trainer-1",
    );

    expect(result.success).toBe(true);
  });

  it("returns handlePrismaError message when create throws Prisma error", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);
    mockTrainerNoteCreate.mockRejectedValue(
      Object.assign(new Error("P2002"), { code: "P2002" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new Error("Заметка с таким названием уже существует");
    });

    const result = await createTrainerNote(
      {
        studentIds: ["s1"],
        entries: [{ content: "text", order: 0, isVisibleToStudent: false }],
      },
      "trainer-1",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("уже существует");
  });

  it("returns error when any student has non-USER role", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "TRAINER" }]);

    const result = await createTrainerNote(
      {
        studentIds: ["s1"],
        entries: [{ content: "text", order: 0, isVisibleToStudent: false }],
      },
      "trainer-1",
    );

    expect(result).toEqual({
      success: false,
      error: "Можно создавать заметки только для учеников",
    });
  });
});

describe("updateTrainerNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = { trainerNote: { update: mockTrainerNoteUpdate } };
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it("returns error when note not found", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue(null);

    const result = await updateTrainerNote(
      { id: "note-1", title: "New" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найдена");
  });

  it("returns error when not owner and not admin", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "other-trainer",
    });

    const result = await updateTrainerNote(
      { id: "note-1", title: "New" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Недостаточно прав");
  });

  it("returns success when owner updates", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockTrainerNoteUpdate.mockResolvedValue({});

    const result = await updateTrainerNote(
      { id: "note-1", title: "Updated" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(true);
  });

  it("returns error when studentIds length mismatches found students", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);

    const result = await updateTrainerNote(
      { id: "note-1", studentIds: ["s1", "s2"] },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найдены");
  });

  it("returns error when updated studentIds includes non-USER role", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "ADMIN" }]);

    const result = await updateTrainerNote(
      { id: "note-1", studentIds: ["s1"] },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("только для учеников");
  });

  it("returns error when updated studentIds includes trainerId itself", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockUserFindMany.mockResolvedValue([{ id: "trainer-1", role: "USER" }]);

    const result = await updateTrainerNote(
      { id: "note-1", studentIds: ["trainer-1"] },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("самому себе");
  });

  it("returns handlePrismaError message when update throws Prisma error", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);
    mockTrainerNoteUpdate.mockRejectedValue(
      Object.assign(new Error("P2002"), { code: "P2002" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new Error("Конфликт при обновлении");
    });

    const result = await updateTrainerNote(
      { id: "note-1", studentIds: ["s1"] },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("updates with studentIds and entries when all valid", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockUserFindMany.mockResolvedValue([{ id: "s1", role: "USER" }]);
    mockTrainerNoteUpdate.mockResolvedValue({});

    const result = await updateTrainerNote(
      {
        id: "note-1",
        studentIds: ["s1"],
        entries: [
          { content: "x", order: 0, isVisibleToStudent: true },
        ],
      },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(true);
  });
});

describe("deleteTrainerNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when note not found", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue(null);

    const result = await deleteTrainerNote(
      { id: "note-1" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("уже удалена");
  });

  it("returns success and deletes when owner", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockTrainerNoteDelete.mockResolvedValue({});

    const result = await deleteTrainerNote(
      { id: "note-1" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(true);
    expect(mockTrainerNoteDelete).toHaveBeenCalledWith({ where: { id: "note-1" } });
  });

  it("allows admin to delete note owned by other trainer", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "other-trainer",
    });
    mockTrainerNoteDelete.mockResolvedValue({});

    const result = await deleteTrainerNote(
      { id: "note-1" },
      "trainer-1",
      true,
    );

    expect(result.success).toBe(true);
    expect(mockTrainerNoteDelete).toHaveBeenCalled();
  });

  it("returns handlePrismaError message when delete throws Prisma error", async () => {
    mockTrainerNoteFindUnique.mockResolvedValue({
      id: "note-1",
      trainerId: "trainer-1",
    });
    mockTrainerNoteDelete.mockRejectedValue(
      Object.assign(new Error("P2025"), { code: "P2025" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new Error("Запись связана с другими данными");
    });

    const result = await deleteTrainerNote(
      { id: "note-1" },
      "trainer-1",
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("связана");
  });
});

describe("getStudentNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array on error", async () => {
    mockTrainerNoteFindMany.mockRejectedValue(new Error("DB error"));

    const result = await getStudentNotes("student-1");

    expect(result).toEqual([]);
  });

  it("returns notes from prisma", async () => {
    mockTrainerNoteFindMany.mockResolvedValue([]);

    const result = await getStudentNotes("student-1");

    expect(result).toEqual([]);
    expect(mockTrainerNoteFindMany).toHaveBeenCalled();
  });
});

describe("getTrainerNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrainerNoteFindMany.mockResolvedValue([]);
    mockTrainerNoteCount.mockResolvedValue(0);
  });

  it("returns pager result", async () => {
    const result = await getTrainerNotes({
      page: 0,
      pageSize: 10,
    });

    expect(result).toEqual({
      notes: [],
      total: 0,
      page: 0,
      pageSize: 10,
    });
  });

  it("passes filters (tags, studentId, trainerId) to findMany", async () => {
    await getTrainerNotes({
      page: 0,
      pageSize: 10,
      tags: ["tag1"],
      studentId: "s1",
      trainerId: "t1",
    });

    expect(mockTrainerNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trainerId: "t1",
          students: { some: { studentId: "s1" } },
          tags: { hasSome: ["tag1"] },
        }),
      }),
    );
  });

  it("transforms students from nested student.id/username/profile to flat shape", async () => {
    mockTrainerNoteFindMany.mockResolvedValue([
      {
        id: "n-1",
        trainerId: "t-1",
        title: "Note",
        tags: [],
        createdAt: new Date("2024-01-01"),
        entries: [],
        students: [
          {
            student: {
              id: "s-1",
              username: "john",
              profile: { fullName: "John", avatarUrl: null },
            },
          },
          {
            student: {
              id: "s-2",
              username: "jane",
              profile: null,
            },
          },
        ],
      },
    ]);
    mockTrainerNoteCount.mockResolvedValue(1);

    const result = await getTrainerNotes({ page: 0, pageSize: 10 });

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].students[0]).toEqual({
      id: "s-1",
      username: "john",
      profile: { fullName: "John", avatarUrl: null },
    });
    expect(result.notes[0].students[1].profile).toBeNull();
  });
});
