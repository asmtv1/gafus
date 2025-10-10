-- AddNotificationType
-- Добавляем поле type в StepNotification для различения типов уведомлений

-- Добавляем новое поле type с дефолтным значением "step"
ALTER TABLE "StepNotification" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'step';

-- Создаем индекс для быстрого поиска по типу
CREATE INDEX "StepNotification_type_idx" ON "StepNotification"("type");

-- Обновляем существующие записи с stepIndex = -1 на тип "immediate"
UPDATE "StepNotification" SET "type" = 'immediate' WHERE "stepIndex" = -1;
