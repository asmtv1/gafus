-- Удаление сценария смены телефона (код по email): таблица токенов и поле throttle.
DROP TABLE IF EXISTS "PhoneChangeToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneChangeRequestedAt";
