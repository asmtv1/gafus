-- Нормализация email (toLowerCase().trim()) применяется только в application layer (@gafus/core), не триггером в БД.
-- Колонка telegramId сохранена; удаление — отдельная миграция после вычищения кода.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
