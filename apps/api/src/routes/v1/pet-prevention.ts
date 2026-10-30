/**
 * Pet Prevention Routes
 * API для журнала профилактики питомца (прививки, глистогонка, клещи/блохи)
 */
import { ZodError } from "zod";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createEntrySchema,
  updateEntrySchema,
  batchRequestSchema,
} from "@gafus/core/services/petPrevention";
import { preventionJournalApplication } from "../../modules/pet-prevention/composition/journal.js";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-pet-prevention");

export const petPreventionRoutes = new Hono();

// GET /:petId/prevention — список записей
petPreventionRoutes.get("/:petId/prevention", async (c) => {
  try {
    const user = c.get("user");
    const petId = c.req.param("petId");
    const result = await preventionJournalApplication.list(user.id, petId);
    if (!result.success) {
      return c.json(result, 404);
    }
    return c.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json({ success: false, error: "Неверные данные" }, 400);
    }
    logger.error("getEntriesByPet failed", new Error("PET_PREVENTION_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// POST /:petId/prevention — одна запись
petPreventionRoutes.post(
  "/:petId/prevention",
  zValidator("json", createEntrySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const petId = c.req.param("petId");
      const data = c.req.valid("json");
      const result = await preventionJournalApplication.create(user.id, petId, data);
      if (!result.success) {
        return c.json(result, 404);
      }
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ success: false, error: "Неверные данные" }, 400);
      }
      logger.error("createEntry failed", new Error("PET_PREVENTION_CREATE_FAILED"));
      return c.json({ success: false, error: "Не удалось создать запись" }, 500);
    }
  },
);

// POST /:petId/prevention/batch — batch upsert (идемпотентность по clientId)
petPreventionRoutes.post(
  "/:petId/prevention/batch",
  zValidator("json", batchRequestSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const petId = c.req.param("petId");
      const { entries } = c.req.valid("json");
      const result = await preventionJournalApplication.batch(user.id, petId, entries);
      if (!result.success) {
        return c.json(result, 404);
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ success: false, error: "Неверные данные" }, 400);
      }
      logger.error("upsertPreventionEntriesBatch failed", new Error("PET_PREVENTION_BATCH_FAILED"));
      return c.json(
        { success: false, error: "Не удалось синхронизировать записи" },
        500,
      );
    }
  },
);

// PUT /:petId/prevention/:entryId — обновление
petPreventionRoutes.put(
  "/:petId/prevention/:entryId",
  zValidator("json", updateEntrySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const entryId = c.req.param("entryId");
      const data = c.req.valid("json");
      const petId = c.req.param("petId");
      const result = await preventionJournalApplication.update(user.id, petId, entryId, data);
      if (!result.success) {
        return c.json(result, 404);
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ success: false, error: "Неверные данные" }, 400);
      }
      logger.error("updateEntry failed", new Error("PET_PREVENTION_UPDATE_FAILED"));
      return c.json({ success: false, error: "Не удалось обновить запись" }, 500);
    }
  },
);

// DELETE /:petId/prevention/:entryId — удаление
petPreventionRoutes.delete("/:petId/prevention/:entryId", async (c) => {
  try {
    const user = c.get("user");
    const entryId = c.req.param("entryId");
    const petId = c.req.param("petId");
    const result = await preventionJournalApplication.remove(user.id, petId, entryId);
    if (!result.success) {
      return c.json(result, 404);
    }
    return c.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json({ success: false, error: "Неверные данные" }, 400);
    }
    logger.error("deleteEntry failed", new Error("PET_PREVENTION_DELETE_FAILED"));
    return c.json({ success: false, error: "Не удалось удалить запись" }, 500);
  }
});
