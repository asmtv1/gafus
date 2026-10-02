/**
 * Pets Routes
 * Endpoints для работы с питомцами: список, создание, обновление, удаление
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getUserPets,
  getPetById,
  createPet,
  updatePet,
  deletePet,
  deletePetDocument,
  listPetDocuments,
  preparePetDocumentDownload,
  renamePetDocument,
  uploadPetDocument,
  updatePetPhoto,
  getPetWeightHistory,
  addPetWeightEntry,
  deletePetWeightEntry,
  setPetTargetWeight,
} from "@gafus/core/services/pets";
import { createWebLogger } from "@gafus/logger";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  PET_DOCUMENTS_MAX_PER_PET,
} from "@gafus/types";

const MAX_PET_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-pets");

function mapPetDocumentError(error: unknown): { status: number; error: string; code: string } {
  const message = error instanceof Error ? error.message : "";
  if (message === "Питомец не найден") {
    return { status: 404, error: "Питомец не найден", code: "PET_NOT_FOUND" };
  }
  if (message === "Недопустимый тип документа") {
    return {
      status: 400,
      error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
      code: "INVALID_DOCUMENT_TYPE",
    };
  }
  if (message === "Размер документа превышает 10 МБ") {
    return {
      status: 400,
      error: "Размер документа превышает 10 МБ",
      code: "DOCUMENT_TOO_LARGE",
    };
  }
  if (message === "Достигнут лимит документов питомца") {
    return {
      status: 400,
      error: `Достигнут лимит документов: ${PET_DOCUMENTS_MAX_PER_PET}`,
      code: "DOCUMENT_LIMIT_REACHED",
    };
  }
  if (message === "Название документа не может быть пустым") {
    return {
      status: 400,
      error: "Название документа не может быть пустым",
      code: "INVALID_NAME",
    };
  }
  return { status: 500, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" };
}

export const petsRoutes = new Hono();

// Schemas
const createPetSchema = z.object({
  name: z.string().min(1, "Имя питомца обязательно"),
  type: z.string().min(1, "Тип питомца обязателен"),
  breed: z.string().min(1, "Порода обязательна"),
  birthDate: z.string().min(1, "Дата рождения обязательна"),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  neckGirthCm: z.number().optional(),
  muzzleGirthCm: z.number().optional(),
  bellyGirthCm: z.number().optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

const updatePetSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  breed: z.string().optional(),
  birthDate: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  neckGirthCm: z.number().optional(),
  muzzleGirthCm: z.number().optional(),
  bellyGirthCm: z.number().optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

const weightValueSchema = z.number().finite().min(0.1).max(200);
const weightEntrySchema = z.object({
  weightKg: weightValueSchema,
  measuredAt: z.string().datetime({ offset: true }),
});
const targetWeightSchema = z.object({ targetWeightKg: weightValueSchema.nullable() });

function validMeasurementDate(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now() + 60_000;
}

const renamePetDocumentSchema = z.object({
  name: z.string().trim().min(1, "Название документа не может быть пустым"),
});

type RenamePetDocumentContext = Context & {
  req: Context["req"] & {
    valid: (target: "json") => z.infer<typeof renamePetDocumentSchema>;
    param: (name: "petId" | "documentId") => string;
  };
};

async function handleRenamePetDocument(c: RenamePetDocumentContext) {
  try {
    const user = c.get("user") as { id: string };
    const petId = String(c.req.param("petId"));
    const documentId = String(c.req.param("documentId"));
    const { name } = c.req.valid("json");

    const updated = await renamePetDocument(documentId, user.id, name, petId);
    if (!updated) {
      return c.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    const mappedError = mapPetDocumentError(error);
    if (mappedError.status >= 500) {
      logger.error("Error renaming pet document", error as Error);
    }
    return c.json(
      { success: false, error: mappedError.error, code: mappedError.code },
      mappedError.status as 400 | 404 | 500,
    );
  }
}

// ==================== GET /pets ====================
// Получить список питомцев пользователя
petsRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const pets = await getUserPets(user.id);
    return c.json({ success: true, data: pets });
  } catch (error) {
    logger.error("Error fetching pets", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /pets ====================
// Создать питомца
petsRoutes.post("/", zValidator("json", createPetSchema), async (c) => {
  try {
    const user = c.get("user");
    const data = c.req.valid("json");
    const pet = await createPet(user.id, data);
    return c.json({ success: true, data: pet }, 201);
  } catch (error) {
    logger.error("Error creating pet", error as Error);
    return c.json({ success: false, error: "Не удалось создать питомца" }, 500);
  }
});

// ==================== GET /pets/:petId ====================
// История веса и цель доступны только владельцу питомца.
petsRoutes.get("/:petId/weight", async (c) => {
  const user = c.get("user") as { id: string };
  const data = await getPetWeightHistory(c.req.param("petId"), user.id);
  return data
    ? c.json({ success: true, data })
    : c.json({ success: false, error: "Питомец не найден" }, 404);
});

petsRoutes.post("/:petId/weight", zValidator("json", weightEntrySchema), async (c) => {
  const user = c.get("user") as { id: string };
  const { weightKg, measuredAt } = c.req.valid("json");
  if (!validMeasurementDate(measuredAt)) {
    return c.json({ success: false, error: "Укажите прошедшую дату измерения" }, 400);
  }
  const data = await addPetWeightEntry(
    c.req.param("petId"),
    user.id,
    weightKg,
    new Date(measuredAt),
  );
  return data
    ? c.json({ success: true, data }, 201)
    : c.json({ success: false, error: "Питомец не найден" }, 404);
});

petsRoutes.delete("/:petId/weight/:entryId", async (c) => {
  const user = c.get("user") as { id: string };
  const deleted = await deletePetWeightEntry(c.req.param("petId"), user.id, c.req.param("entryId"));
  return deleted
    ? c.json({ success: true })
    : c.json({ success: false, error: "Измерение не найдено" }, 404);
});

petsRoutes.put("/:petId/weight/target", zValidator("json", targetWeightSchema), async (c) => {
  const user = c.get("user") as { id: string };
  const saved = await setPetTargetWeight(
    c.req.param("petId"),
    user.id,
    c.req.valid("json").targetWeightKg,
  );
  return saved
    ? c.json({ success: true })
    : c.json({ success: false, error: "Питомец не найден" }, 404);
});

// Получить питомца по ID
petsRoutes.get("/:petId", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const pet = await getPetById(petId, user.id);

    if (!pet) {
      return c.json({ success: false, error: "Питомец не найден" }, 404);
    }

    return c.json({ success: true, data: pet });
  } catch (error) {
    logger.error("Error fetching pet", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /pets/:petId/photo ====================
// Загрузить фото питомца (multipart/form-data, поле "file")
petsRoutes.post("/:petId/photo", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string") {
      return c.json({ success: false, error: "Файл не найден" }, 400);
    }

    const f = file as File;
    if (!ALLOWED_PHOTO_TYPES.includes(f.type)) {
      return c.json(
        {
          success: false,
          error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF",
        },
        400,
      );
    }

    if (f.size > MAX_PET_PHOTO_SIZE) {
      return c.json({ success: false, error: "Файл слишком большой. Максимум 2 МБ" }, 400);
    }

    const photoUrl = await updatePetPhoto(petId, user.id, f);
    return c.json({ success: true, data: { photoUrl } });
  } catch (error) {
    logger.error("Error uploading pet photo", error as Error);
    return c.json({ success: false, error: "Ошибка загрузки фото питомца" }, 500);
  }
});

// ==================== GET /pets/:petId/documents ====================
// Получить список документов питомца
petsRoutes.get("/:petId/documents", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const documents = await listPetDocuments(petId, user.id);
    return c.json({ success: true, data: documents });
  } catch (error) {
    const mappedError = mapPetDocumentError(error);
    if (mappedError.status >= 500) {
      logger.error("Error fetching pet documents", error as Error);
    }
    return c.json(
      { success: false, error: mappedError.error, code: mappedError.code },
      mappedError.status as 400 | 404 | 500,
    );
  }
});

// ==================== POST /pets/:petId/documents ====================
// Загрузить документ питомца (multipart/form-data, поле "file")
petsRoutes.post("/:petId/documents", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || typeof file === "string") {
      return c.json({ success: false, error: "Файл не найден", code: "FILE_REQUIRED" }, 400);
    }

    const uploadedFile = file as File;
    if (
      !PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(
        uploadedFile.type as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      return c.json(
        {
          success: false,
          error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
          code: "INVALID_DOCUMENT_TYPE",
        },
        400,
      );
    }
    if (uploadedFile.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
      return c.json(
        { success: false, error: "Размер документа превышает 10 МБ", code: "DOCUMENT_TOO_LARGE" },
        400,
      );
    }

    const document = await uploadPetDocument(petId, user.id, uploadedFile);
    return c.json({ success: true, data: document }, 201);
  } catch (error) {
    const mappedError = mapPetDocumentError(error);
    if (mappedError.status >= 500) {
      logger.error("Error uploading pet document", error as Error);
    }
    return c.json(
      { success: false, error: mappedError.error, code: mappedError.code },
      mappedError.status as 400 | 404 | 500,
    );
  }
});

// ==================== DELETE /pets/:petId/documents/:documentId ====================
// Удалить документ питомца
petsRoutes.delete("/:petId/documents/:documentId", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const documentId = c.req.param("documentId");
    const deleted = await deletePetDocument(documentId, user.id, petId);
    if (!deleted) {
      return c.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        404,
      );
    }
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error deleting pet document", error as Error);
    return c.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      500,
    );
  }
});

// ==================== PUT /pets/:petId/documents/:documentId ====================
// Переименовать документ питомца
petsRoutes.put(
  "/:petId/documents/:documentId",
  zValidator("json", renamePetDocumentSchema),
  async (c) => handleRenamePetDocument(c as unknown as RenamePetDocumentContext),
);

// ==================== GET /pets/:petId/documents/:documentId/download ====================
// Подготовить ссылку для скачивания документа питомца
petsRoutes.get("/:petId/documents/:documentId/download", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const documentId = c.req.param("documentId");
    const downloadPayload = await preparePetDocumentDownload(documentId, user.id, petId);
    if (!downloadPayload) {
      return c.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        404,
      );
    }
    return c.json({ success: true, data: downloadPayload });
  } catch (error) {
    logger.error("Error preparing pet document download", error as Error);
    return c.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      500,
    );
  }
});

// ==================== PUT /pets/:petId ====================
// Обновить питомца
petsRoutes.put("/:petId", zValidator("json", updatePetSchema), async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const data = c.req.valid("json");
    const pet = await updatePet(petId, user.id, data);

    if (!pet) {
      return c.json({ success: false, error: "Питомец не найден" }, 404);
    }

    return c.json({ success: true, data: pet });
  } catch (error) {
    logger.error("Error updating pet", error as Error);
    return c.json({ success: false, error: "Не удалось обновить питомца" }, 500);
  }
});

// ==================== DELETE /pets/:petId ====================
// Удалить питомца
petsRoutes.delete("/:petId", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const deleted = await deletePet(petId, user.id);

    if (!deleted) {
      return c.json({ success: false, error: "Питомец не найден" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error deleting pet", error as Error);
    return c.json({ success: false, error: "Не удалось удалить питомца" }, 500);
  }
});
