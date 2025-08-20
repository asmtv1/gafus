-- Добавляем поле equipment в таблицу TrainingDay
ALTER TABLE "TrainingDay" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '';

-- Добавляем поле equipment в таблицу Course
ALTER TABLE "Course" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '';

-- Добавляем поле trainingLevel в таблицу Course
ALTER TABLE "Course" ADD COLUMN "trainingLevel" "TrainingLevel" NOT NULL DEFAULT 'BEGINNER';

-- Создаем enum TrainingLevel если его нет
DO $$ BEGIN
    CREATE TYPE "TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
