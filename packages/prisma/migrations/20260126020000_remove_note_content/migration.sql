-- Удаляем колонку content из TrainerNote, так как теперь используем TrainerNoteEntry
ALTER TABLE "TrainerNote" DROP COLUMN IF EXISTS "content";
