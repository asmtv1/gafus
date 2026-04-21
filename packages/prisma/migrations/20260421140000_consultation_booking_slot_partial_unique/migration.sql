-- Разрешаем несколько записей ConsultationBooking на один слот в истории (отмена и т.д.),
-- но не более одной «активной» (ожидает подтверждения или подтверждена).
DROP INDEX IF EXISTS "ConsultationBooking_slotId_key";

CREATE UNIQUE INDEX "ConsultationBooking_slotId_active_key"
ON "ConsultationBooking" ("slotId")
WHERE "status" IN ('PENDING_TRAINER_CONFIRMATION', 'CONFIRMED');
