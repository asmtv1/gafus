-- Добавляем оценочное время прохождения шага для теории и экзаменов

-- Оценочное время для реальных шагов
ALTER TABLE "Step"
ADD COLUMN "estimatedDurationSec" INTEGER;

-- Оценочное время для шаблонов шагов
ALTER TABLE "StepTemplate"
ADD COLUMN "estimatedDurationSec" INTEGER;


