-- Делаем письма по консультациям идемпотентными: одно письмо каждого типа на бронь.
-- Если до миграции успели появиться дубли, оставляем самый ранний лог.

DELETE FROM "ConsultationEmailLog" old
USING "ConsultationEmailLog" keep
WHERE old."bookingId" = keep."bookingId"
  AND old."type" = keep."type"
  AND (
    old."createdAt" > keep."createdAt"
    OR (old."createdAt" = keep."createdAt" AND old."id" > keep."id")
  );

CREATE UNIQUE INDEX "ConsultationEmailLog_bookingId_type_key"
  ON "ConsultationEmailLog"("bookingId", "type");
