-- Добавление полей resolvedAt и resolvedBy в таблицу ErrorLog
-- Эта миграция соответствует: 20251221120000_add_resolved_fields_to_error_log

ALTER TABLE "ErrorLog" 
ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;

