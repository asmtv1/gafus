-- Восстановление колонки passwordSetAt для окружений с дрейфом схемы.
DO $$
BEGIN
  IF to_regclass('"User"') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'passwordSetAt'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "passwordSetAt" TIMESTAMP(3);
  END IF;
END $$;

-- Для уже существующих пользователей с паролем заполняем значение даты.
UPDATE "User" u
SET "passwordSetAt" = COALESCE(u."updatedAt", u."createdAt")
WHERE u."passwordSetAt" IS NULL
  AND COALESCE(u."password", '') <> '';
