-- Создаем промежуточную таблицу для связи многие-ко-многим
CREATE TABLE "TrainerNoteStudent" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerNoteStudent_pkey" PRIMARY KEY ("id")
);

-- Включаем расширение для UUID (если еще не включено)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Переносим существующие данные из studentId в новую таблицу
INSERT INTO "TrainerNoteStudent" ("id", "noteId", "studentId", "createdAt")
SELECT 
    uuid_generate_v4()::text as "id",
    "id" as "noteId",
    "studentId",
    "createdAt"
FROM "TrainerNote"
WHERE "studentId" IS NOT NULL;

-- Создаем индексы
CREATE INDEX "TrainerNoteStudent_noteId_idx" ON "TrainerNoteStudent"("noteId");
CREATE INDEX "TrainerNoteStudent_studentId_idx" ON "TrainerNoteStudent"("studentId");
CREATE INDEX "TrainerNoteStudent_studentId_createdAt_idx" ON "TrainerNoteStudent"("studentId", "createdAt" DESC);
CREATE UNIQUE INDEX "TrainerNoteStudent_noteId_studentId_key" ON "TrainerNoteStudent"("noteId", "studentId");

-- Добавляем внешние ключи
ALTER TABLE "TrainerNoteStudent" ADD CONSTRAINT "TrainerNoteStudent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "TrainerNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerNoteStudent" ADD CONSTRAINT "TrainerNoteStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Удаляем старые индексы и колонку studentId
DROP INDEX IF EXISTS "TrainerNote_studentId_idx";
DROP INDEX IF EXISTS "TrainerNote_trainerId_studentId_createdAt_idx";
ALTER TABLE "TrainerNote" DROP COLUMN "studentId";
ALTER TABLE "TrainerNote" DROP CONSTRAINT IF EXISTS "TrainerNote_studentId_fkey";
