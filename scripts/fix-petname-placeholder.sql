-- Замена "Подзовите {{petName}} по рабочей кличке" на "Подзовите {{petNameAcc}} по рабочей кличке"
-- в таблицах Step, StepTemplate, TrainingDay

BEGIN;

-- Step: description
UPDATE "Step"
SET description = REPLACE(description, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE description LIKE '%Подзовите {{petName}} по рабочей кличке%';

-- Step: title
UPDATE "Step"
SET title = REPLACE(title, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE title LIKE '%Подзовите {{petName}} по рабочей кличке%';

-- StepTemplate: description
UPDATE "StepTemplate"
SET description = REPLACE(description, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE description LIKE '%Подзовите {{petName}} по рабочей кличке%';

-- StepTemplate: title
UPDATE "StepTemplate"
SET title = REPLACE(title, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE title LIKE '%Подзовите {{petName}} по рабочей кличке%';

-- TrainingDay: description
UPDATE "TrainingDay"
SET description = REPLACE(description, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE description LIKE '%Подзовите {{petName}} по рабочей кличке%';

-- TrainingDay: title
UPDATE "TrainingDay"
SET title = REPLACE(title, 'Подзовите {{petName}} по рабочей кличке', 'Подзовите {{petNameAcc}} по рабочей кличке')
WHERE title LIKE '%Подзовите {{petName}} по рабочей кличке%';

COMMIT;
