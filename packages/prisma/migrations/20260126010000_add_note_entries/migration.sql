-- Создаем таблицу для текстовых записей внутри заметок
CREATE TABLE "TrainerNoteEntry" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerNoteEntry_pkey" PRIMARY KEY ("id")
);

-- Включаем расширение для UUID (если еще не включено)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Переносим существующие данные из content в новую таблицу
INSERT INTO "TrainerNoteEntry" ("id", "noteId", "content", "order", "createdAt", "updatedAt")
SELECT 
    uuid_generate_v4()::text as "id",
    "id" as "noteId",
    "content",
    0 as "order",
    "createdAt",
    "updatedAt"
FROM "TrainerNote"
WHERE "content" IS NOT NULL AND "content" != '';

-- Создаем индекс для сортировки
CREATE INDEX "TrainerNoteEntry_noteId_order_idx" ON "TrainerNoteEntry"("noteId", "order");

-- Добавляем внешний ключ
ALTER TABLE "TrainerNoteEntry" ADD CONSTRAINT "TrainerNoteEntry_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "TrainerNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Удаляем колонку content из TrainerNote (оставляем для обратной совместимости, но не используем)
-- ALTER TABLE "TrainerNote" DROP COLUMN "content";
