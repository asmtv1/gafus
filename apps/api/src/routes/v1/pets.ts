/**
 * Pets Routes
 * Endpoints для работы с питомцами: список, создание, обновление, удаление
 */
import { Hono, type Context } from "hono";
import type { TypedResponse } from "hono";
import type { PetListRead, PetDetailRead } from "../../../../../packages/types/src/data/pet";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";
import { petEditValidationError } from "./g1-field-validation";

import {
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
import { presentOwnedPetPhoto } from "./present-pet-photo";
import { prepareHonoPetPhoto } from "./pet-photo-file";
import { readPetsApplication } from "../../modules/pets/composition/read-pets.js";
import { isValidCreatePetBirthDate, isValidBirthDateEditWire } from "./petCreateBirthDate";
import {
  isValidOwnedPetWeightId, type OwnedPetWeightHistoryResponse,
} from "@gafus/types";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  PET_DOCUMENTS_MAX_PER_PET,
} from "@gafus/types";

const MAX_PET_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-pets");

// Only a structured Core code is trusted; never interpolate a supplied URL,
// provider marker, Core message, stack or credentials into a client response.
const DIRECT_PHOTO_URL_DENIED = {
  success: false as const,
  code: "PET_MEDIA_DIRECT_PHOTO_URL_DENIED" as const,
  error: "Загрузите фото питомца отдельным запросом",
};
function isDirectPhotoUrlDenied(error: unknown): boolean {
  return error instanceof Error &&
    (error as Error & { code?: unknown }).code === DIRECT_PHOTO_URL_DENIED.code;
}

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
  birthDate: z.string().min(1, "Дата рождения обязательна").refine(isValidCreatePetBirthDate, {
    message: "Дата рождения должна быть существующей датой ГГГГ-ММ-ДД и не позже текущей даты UTC",
  }),
  heightCm: z.number().finite().positive().optional(),
  weightKg: z.number().finite().min(0.1).max(200).optional(),
  neckGirthCm: z.number().finite().positive().optional(),
  muzzleGirthCm: z.number().finite().positive().optional(),
  bellyGirthCm: z.number().finite().positive().optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
  // AG4 G05: optional JSON UUID-v4 per logical create intent (not HTTP attempt).
  clientRequestId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    .transform((value) => value.toLowerCase())
    .optional(),
});

const nullablePetMeasurement = z.number().finite().positive().nullable().optional();
const updatePetSchema = z.object({
  showInProfile: z.boolean().optional(),
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  breed: z.string().min(1).optional(),
  // Birth date is required/non-null in Prisma; allow existing ISO clients.
  birthDate: z
    .string()
    .min(1)
    .refine(isValidBirthDateEditWire, {
      message: "Некорректная дата рождения",
    })
    .optional(),
  heightCm: nullablePetMeasurement,
  // Weight is managed separately; explicit 400 is safer than silently ignoring PUT.
  weightKg: z
    .any()
    .transform((value, ctx): undefined => {
      if (value !== undefined) ctx.addIssue({ code: "custom", message: "UNSUPPORTED_FIELD" });
      return undefined;
    })
    .optional(),
  neckGirthCm: nullablePetMeasurement,
  muzzleGirthCm: nullablePetMeasurement,
  bellyGirthCm: nullablePetMeasurement,
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
      logger.error("Error renaming pet document", new Error("PET_DOCUMENT_RENAME_FAILED"));
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
    const pets = await readPetsApplication.list({ actorUserId: user.id });
    const presented = await Promise.all(pets.map(presentOwnedPetPhoto));
    return c.json({ success: true, data: presented }, 200, {
      "Cache-Control": "private, no-store",
    }) satisfies Response & TypedResponse<PetListRead, 200, "json">;
  } catch {
    // The Core already masks the original failure; avoid a synthetic stack.
    logger.error("PET_LIST_FAILED");
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /pets ====================
// Создать питомца
petsRoutes.post(
  "/",
  async (c, next) => {
    // Explicitly reject misleading unsupported transport instead of silently
    // creating an unprotected Pet. AG4 accepts only optional JSON UUIDv4.
    if (c.req.header("Idempotency-Key") !== undefined) {
      return c.json(
        {
          success: false,
          code: "UNSUPPORTED_IDEMPOTENCY_TRANSPORT",
          error: "Используйте clientRequestId в JSON запроса",
        },
        400,
      );
    }
    await next();
  },
  zValidator("json", createPetSchema, (result, c) => {
    if (
      !result.success &&
      result.error.issues.some((issue) => issue.path[0] === "clientRequestId")
    ) {
      return c.json(
        {
          success: false,
          code: "INVALID_CLIENT_REQUEST_ID",
          error: "clientRequestId должен быть UUID версии 4",
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const user = c.get("user");
      const data = c.req.valid("json");
      const pet = await createPet(user.id, data);
      // Symbol is non-enumerable and never enters JSON, preserving Pet DTO.
      const replayed =
        (pet as unknown as Record<symbol, unknown>)[Symbol.for("gafus.pet.create.replayed")] ===
        true;
      return c.json(
        { success: true, data: pet },
        201,
        replayed ? { "Idempotent-Replayed": "true" } : undefined,
      );
    } catch (error) {
      if (isDirectPhotoUrlDenied(error))
        return c.json(DIRECT_PHOTO_URL_DENIED, 400);
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === "PET_CREATE_REQUEST_CONFLICT") {
        return c.json({ success: false, code, error: "Повтор запроса с другим содержимым" }, 409);
      }
      if (code === "PET_CREATE_RESULT_UNAVAILABLE") {
        return c.json(
          { success: false, code, error: "Ранее созданный питомец больше не существует" },
          409,
        );
      }
      if (code === "PET_CREATE_RESULT_UNCONFIRMED") {
        return c.json(
          { success: false, code, error: "Не удалось подтвердить результат создания" },
          503,
        );
      }
      if (code === "INVALID_CLIENT_REQUEST_ID") {
        return c.json({ success: false, code, error: "Недопустимый clientRequestId" }, 400);
      }
      logger.error("Error creating pet", new Error("PET_CREATE_FAILED"));
      return c.json({ success: false, error: "Не удалось создать питомца" }, 500);
    }
  },
);

// ==================== GET /pets/:petId ====================
// История веса и цель доступны только владельцу питомца.
petsRoutes.get("/:petId/weight", async (c) => {
  const user = c.get("user") as { id: string };
  const petId = c.req.param("petId");
  // Preserve the existing owner-obscuring 404 for invalid/missing identifiers.
  const missing: OwnedPetWeightHistoryResponse = {
    success: false, error: "Питомец не найден",
  };
  if (!isValidOwnedPetWeightId(petId)) return c.json(missing, 404);
  const data = await getPetWeightHistory(petId, user.id);
  if (!data) return c.json(missing, 404);
  // Core keeps Date values; the existing JSON route serializes them as ISO.
  // Make that wire conversion explicit while retaining the original row fields
  // and owner-controlled query/order semantics.
  const found: OwnedPetWeightHistoryResponse = {
    success: true,
    data: {
      currentWeightKg: data.currentWeightKg,
      targetWeightKg: data.targetWeightKg,
      entries: data.entries.map(entry => ({
        ...entry,
        measuredAt: entry.measuredAt instanceof Date
          ? entry.measuredAt.toISOString() : entry.measuredAt,
        createdAt: entry.createdAt instanceof Date
          ? entry.createdAt.toISOString() : entry.createdAt,
      })),
    },
  };
  return c.json(found);
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
    const pet = await readPetsApplication.detail({ petId, actorUserId: user.id });

    if (!pet) {
      return c.json({ success: false, error: "Питомец не найден" }, 404, {
        "Cache-Control": "private, no-store",
      });
    }

    return c.json({ success: true, data: await presentOwnedPetPhoto(pet) }, 200, {
      "Cache-Control": "private, no-store",
    }) satisfies Response & TypedResponse<PetDetailRead, 200, "json">;
  } catch {
    logger.error("Error fetching pet", new Error("PET_DETAIL_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500, {
      "Cache-Control": "private, no-store",
    });
  }
});

// ==================== POST /pets/:petId/photo ====================
// Загрузить фото питомца (multipart/form-data, поле "file")
petsRoutes.post("/:petId/photo", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    // Deny foreign or deleted pets before multipart parsing and S3 IO.
    // Core repeats the owner check before its locked SQL mutation.
    if (!await readPetsApplication.detail({ petId, actorUserId: user.id })) {
      return c.json({success:false,error:"Питомец не найден",code:"PET_NOT_FOUND"},404,
        {"Cache-Control":"private, no-store"});
    }
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

    let normalized: File;
    try {
      normalized = await prepareHonoPetPhoto(f);
    } catch {
      return c.json({ success:false, code:"INVALID_PET_IMAGE",
        error:"Некорректное изображение питомца" },400,
        {"Cache-Control":"private, no-store"});
    }
    const stored = await updatePetPhoto(petId, user.id, normalized);
    // Core persists a provider marker; only the authenticated HTTP response
    // may expose the short-lived signed URL, never the storage marker.
    const { photoUrl } = await presentOwnedPetPhoto({ photoUrl: stored });
    return c.json({ success: true, data: { photoUrl } }, 200,
      { "Cache-Control": "private, no-store" });
  } catch {
    logger.error("Error uploading pet photo", new Error("PET_PHOTO_UPLOAD_FAILED"));
    return c.json({ success: false, error: "Ошибка загрузки фото питомца" }, 500);
  }
});

// Pet-document metadata and ephemeral download links must never enter a shared
// or persistent HTTP cache. This applies to validation and error branches too.
// Gallery/Moments image caching is a separate contract and remains unchanged.
petsRoutes.use("/:petId/documents", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Pragma", "no-cache");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
petsRoutes.use("/:petId/documents/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Pragma", "no-cache");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
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
      logger.error("Error fetching pet documents", new Error("PET_DOCUMENT_LIST_FAILED"));
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
      logger.error("Error uploading pet document", new Error("PET_DOCUMENT_UPLOAD_FAILED"));
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
  } catch {
    logger.error("Error deleting pet document", new Error("PET_DOCUMENT_DELETE_FAILED"));
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
  } catch {
    logger.error(
      "Error preparing pet document download",
      new Error("PET_DOCUMENT_DOWNLOAD_FAILED"),
    );
    return c.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      500,
    );
  }
});

// ==================== PUT /pets/:petId ====================
// Обновить питомца
petsRoutes.put(
  "/:petId",
  zValidator("json", updatePetSchema, petEditValidationError),
  async (c) => {
    try {
      const user = c.get("user");
      const petId = c.req.param("petId");
      if (!petId)
        return c.json({ success: false, code: "PET_NOT_FOUND", error: "Питомец не найден" }, 404);
      const data = c.req.valid("json");
      const pet = await updatePet(petId, user.id, data);

      if (!pet) {
        return c.json({ success: false, code: "PET_NOT_FOUND", error: "Питомец не найден" }, 404);
      }

      return c.json({ success: true, data: pet });
    } catch (error) {
      if (isDirectPhotoUrlDenied(error))
        return c.json(DIRECT_PHOTO_URL_DENIED, 400);
      logger.error("Error updating pet", new Error("PET_UPDATE_FAILED"));
      return c.json({ success: false, error: "Не удалось обновить питомца" }, 500);
    }
  },
);

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
  } catch {
    logger.error("Error deleting pet", new Error("PET_DELETE_FAILED"));
    return c.json({ success: false, error: "Не удалось удалить питомца" }, 500);
  }
});
