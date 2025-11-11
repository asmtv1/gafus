-- Добавляем поля комментария тренера и информацию о проверке
ALTER TABLE "ExamResult"
  ADD COLUMN "trainerComment" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

-- Обновляем связи на пользователя (тренера)
ALTER TABLE "ExamResult"
  ADD CONSTRAINT "ExamResult_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Индекс для быстрого поиска по тренеру-проверяющему
CREATE INDEX "ExamResult_reviewedById_idx" ON "ExamResult" ("reviewedById");

