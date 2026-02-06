/**
 * Pets Routes
 * Endpoints для работы с питомцами: список, создание, обновление, удаление
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getUserPets,
  getPetById,
  createPet,
  updatePet,
  deletePet,
  updatePetPhoto,
} from "@gafus/core/services/pets";
import { createWebLogger } from "@gafus/logger";

const MAX_PET_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-pets");

export const petsRoutes = new Hono();

// Schemas
const createPetSchema = z.object({
  name: z.string().min(1, "Имя питомца обязательно"),
  type: z.string().min(1, "Тип питомца обязателен"),
  breed: z.string().min(1, "Порода обязательна"),
  birthDate: z.string().min(1, "Дата рождения обязательна"),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
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
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

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
      return c.json(
        { success: false, error: "Файл слишком большой. Максимум 2 МБ" },
        400,
      );
    }

    const photoUrl = await updatePetPhoto(petId, user.id, f);
    return c.json({ success: true, data: { photoUrl } });
  } catch (error) {
    logger.error("Error uploading pet photo", error as Error);
    return c.json(
      { success: false, error: "Ошибка загрузки фото питомца" },
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
