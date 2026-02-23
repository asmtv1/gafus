-- 1. Добавляем dayId (nullable)
ALTER TABLE "DiaryEntry" ADD COLUMN "dayId" TEXT;

-- 2. Заполняем dayId из DayOnCourse
UPDATE "DiaryEntry" de
SET "dayId" = doc."dayId"
FROM "DayOnCourse" doc
WHERE de."dayOnCourseId" = doc.id;

-- 3. Дедупликация: оставляем строку с max(updatedAt) для каждой пары (userId, dayId)
DELETE FROM "DiaryEntry"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "userId", "dayId"
             ORDER BY "updatedAt" DESC
           ) AS rn
    FROM "DiaryEntry"
    WHERE "dayId" IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- 4. NOT NULL
ALTER TABLE "DiaryEntry" ALTER COLUMN "dayId" SET NOT NULL;

-- 5. Добавляем FK с CASCADE
ALTER TABLE "DiaryEntry"
  ADD CONSTRAINT "DiaryEntry_dayId_fkey"
  FOREIGN KEY ("dayId")
  REFERENCES "TrainingDay"(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Удаляем старый уникальный индекс
DROP INDEX IF EXISTS "DiaryEntry_userId_dayOnCourseId_key";

-- 7. Добавляем новый уникальный индекс
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_dayId_key" UNIQUE ("userId", "dayId");

-- 8. Удаляем старый индекс по dayOnCourseId
DROP INDEX IF EXISTS "DiaryEntry_dayOnCourseId_idx";

-- 9. Новый индекс по dayId
CREATE INDEX "DiaryEntry_dayId_idx" ON "DiaryEntry"("dayId");

-- 10. Удаляем старый FK и колонку dayOnCourseId
ALTER TABLE "DiaryEntry" DROP CONSTRAINT "DiaryEntry_dayOnCourseId_fkey";
ALTER TABLE "DiaryEntry" DROP COLUMN "dayOnCourseId";
