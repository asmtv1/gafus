import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTrainerNoteMock,
  deleteTrainerNoteMock,
  getServerSessionMock,
  revalidatePathMock,
  revalidateTagMock,
  updateTrainerNoteMock,
} = vi.hoisted(() => ({
  createTrainerNoteMock: vi.fn(),
  deleteTrainerNoteMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  updateTrainerNoteMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/notes", async () => {
  const { z } = await import("zod");
  const noteEntrySchema = z.object({
    content: z
      .string()
      .min(1, "Текст записи обязателен")
      .max(10000, "Максимум 10000 символов")
      .refine((val) => val.trim().length > 0, {
        message: "Текст записи не может состоять только из пробелов",
      })
      .transform((val) => val.trim()),
    order: z.number().int().min(0).default(0),
    isVisibleToStudent: z.boolean().default(false),
  });

  return {
    createTrainerNote: createTrainerNoteMock,
    createTrainerNoteSchema: z.object({
      title: z
        .string()
        .max(200, "Максимум 200 символов")
        .transform((val) => val.trim() || undefined)
        .optional()
        .nullable(),
      entries: z.array(noteEntrySchema).min(1, "Добавьте хотя бы одну текстовую запись"),
      studentIds: z
        .array(z.string().cuid("Некорректный ID ученика"))
        .min(1, "Выберите хотя бы одного ученика"),
      tags: z
        .array(z.string())
        .default([])
        .transform((val) =>
          val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50),
        ),
    }),
    deleteTrainerNote: deleteTrainerNoteMock,
    deleteTrainerNoteSchema: z.object({
      id: z.string().cuid("Некорректный ID заметки"),
    }),
    noteEntrySchema,
    updateTrainerNote: updateTrainerNoteMock,
    updateTrainerNoteSchema: z.object({
      id: z.string().cuid("Некорректный ID заметки"),
      title: z
        .string()
        .max(200, "Максимум 200 символов")
        .transform((val) => val.trim() || undefined)
        .optional()
        .nullable(),
      entries: z.array(noteEntrySchema).min(1, "Добавьте хотя бы одну текстовую запись").optional(),
      studentIds: z
        .array(z.string().cuid("Некорректный ID ученика"))
        .min(1, "Выберите хотя бы одного ученика")
        .optional(),
      tags: z
        .array(z.string())
        .transform((val) =>
          val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50),
        )
        .optional(),
    }),
  };
});

vi.mock("@gafus/core/services/cache", () => ({
  CACHE_TAGS: {
    TRAINER_NOTES: "trainer-notes",
    TRAINER_NOTES_BY_TRAINER: (trainerId: string) => `trainer-notes:${trainerId}`,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));

vi.mock("@gafus/logger", () => ({
  createTrainerPanelLogger: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import { createNote } from "./createNote";
import { deleteNote } from "./deleteNote";
import { updateNote } from "./updateNote";

const trainerSession = {
  user: { id: "clwtrainer0000000000000001", role: "TRAINER" },
};

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

function validCreateFormData(): FormData {
  return buildFormData({
    title: "Plan",
    entries: JSON.stringify([{ content: " Practice sit ", order: 0, isVisibleToStudent: true }]),
    studentIds: JSON.stringify(["clwstudent0000000000000001"]),
    tags: JSON.stringify([" obedience ", "", "home"]),
  });
}

describe("trainer note actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated create requests", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    await expect(createNote({ success: false }, validCreateFormData())).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(createTrainerNoteMock).not.toHaveBeenCalled();
  });

  it("rejects users without trainer panel permissions", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "clwuser000000000000000001", role: "USER" },
    });

    await expect(createNote({ success: false }, validCreateFormData())).resolves.toEqual({
      success: false,
      error: "Недостаточно прав доступа",
    });
    expect(createTrainerNoteMock).not.toHaveBeenCalled();
  });

  it("validates create entries JSON before calling the service", async () => {
    getServerSessionMock.mockResolvedValueOnce(trainerSession);

    await expect(
      createNote(
        { success: false },
        buildFormData({
          entries: "{",
          studentIds: JSON.stringify(["clwstudent0000000000000001"]),
        }),
      ),
    ).resolves.toEqual({ success: false, error: "Некорректный формат записей" });
    expect(createTrainerNoteMock).not.toHaveBeenCalled();
  });

  it("creates a note, trims schema-backed fields, and revalidates note caches", async () => {
    getServerSessionMock.mockResolvedValueOnce(trainerSession);
    createTrainerNoteMock.mockResolvedValueOnce({ success: true });

    await expect(createNote({ success: false }, validCreateFormData())).resolves.toEqual({
      success: true,
    });
    expect(createTrainerNoteMock).toHaveBeenCalledWith(
      {
        title: "Plan",
        entries: [{ content: "Practice sit", order: 0, isVisibleToStudent: true }],
        studentIds: ["clwstudent0000000000000001"],
        tags: ["obedience", "home"],
      },
      "clwtrainer0000000000000001",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/main-panel/notes");
    expect(revalidateTagMock).toHaveBeenCalledWith("trainer-notes");
    expect(revalidateTagMock).toHaveBeenCalledWith("trainer-notes:clwtrainer0000000000000001");
  });

  it("updates a note with admin privileges and revalidates note caches", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "clwadmin000000000000000001", role: "ADMIN" },
    });
    updateTrainerNoteMock.mockResolvedValueOnce({ success: true });

    await expect(
      updateNote(
        { success: false },
        buildFormData({
          id: "clwnote000000000000000001",
          title: "Updated",
          entries: JSON.stringify([{ content: "New entry", order: 1 }]),
          studentIds: "clwstudent0000000000000001",
          tags: "home, focus",
        }),
      ),
    ).resolves.toEqual({ success: true });
    expect(updateTrainerNoteMock).toHaveBeenCalledWith(
      {
        id: "clwnote000000000000000001",
        title: "Updated",
        entries: [{ content: "New entry", order: 1, isVisibleToStudent: false }],
        studentIds: ["clwstudent0000000000000001"],
        tags: ["home", "focus"],
      },
      "clwadmin000000000000000001",
      true,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/main-panel/notes");
    expect(revalidateTagMock).toHaveBeenCalledWith("trainer-notes:clwadmin000000000000000001");
  });

  it("validates update entries JSON before calling the service", async () => {
    getServerSessionMock.mockResolvedValueOnce(trainerSession);

    await expect(
      updateNote(
        { success: false },
        buildFormData({ id: "clwnote000000000000000001", entries: "not json" }),
      ),
    ).resolves.toEqual({ success: false, error: "Некорректный формат записей" });
    expect(updateTrainerNoteMock).not.toHaveBeenCalled();
  });

  it("deletes a note with the current trainer id and admin flag", async () => {
    getServerSessionMock.mockResolvedValueOnce(trainerSession);
    deleteTrainerNoteMock.mockResolvedValueOnce({ success: true });

    await expect(
      deleteNote({ success: false }, buildFormData({ id: "clwnote000000000000000001" })),
    ).resolves.toEqual({ success: true });
    expect(deleteTrainerNoteMock).toHaveBeenCalledWith(
      { id: "clwnote000000000000000001" },
      "clwtrainer0000000000000001",
      false,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/main-panel/notes");
  });

  it("validates delete ids before calling the service", async () => {
    getServerSessionMock.mockResolvedValueOnce(trainerSession);

    const result = await deleteNote({ success: false }, buildFormData({ id: "not-a-cuid" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Некорректный ID заметки");
    expect(deleteTrainerNoteMock).not.toHaveBeenCalled();
  });
});
