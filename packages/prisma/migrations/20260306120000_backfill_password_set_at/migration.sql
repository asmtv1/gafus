-- Backfill passwordSetAt для пользователей, зарегистрированных до миграции VK ID.
-- У них был пароль, но passwordSetAt остался NULL — вход по логину/паролю блокировался.
-- Выполняем только для пользователей БЕЗ VK Account (старая регистрация).
UPDATE "User" u
SET "passwordSetAt" = COALESCE(u."updatedAt", u."createdAt")
WHERE u."passwordSetAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = u.id AND a.provider = 'vk'
  );
