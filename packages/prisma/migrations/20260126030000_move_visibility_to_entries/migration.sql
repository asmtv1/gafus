-- Удаляем updatedAt из TrainerNote
ALTER TABLE "TrainerNote" DROP COLUMN IF EXISTS "updatedAt";

-- Удаляем isVisibleToStudent из TrainerNote (если существует)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'TrainerNote' AND column_name = 'isVisibleToStudent') THEN
    ALTER TABLE "TrainerNote" DROP COLUMN "isVisibleToStudent";
  END IF;
END $$;

-- Добавляем isVisibleToStudent в TrainerNoteEntry
ALTER TABLE "TrainerNoteEntry" ADD COLUMN IF NOT EXISTS "isVisibleToStudent" BOOLEAN NOT NULL DEFAULT false;

-- Переносим значение isVisibleToStudent из TrainerNote в TrainerNoteEntry (если колонка еще существует)
DO $$ 
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'TrainerNote' AND column_name = 'isVisibleToStudent'
  ) INTO col_exists;
  
  IF col_exists THEN
    UPDATE "TrainerNoteEntry" e
    SET "isVisibleToStudent" = COALESCE(
      (SELECT n."isVisibleToStudent" FROM "TrainerNote" n WHERE n."id" = e."noteId"),
      false
    )
    WHERE EXISTS (SELECT 1 FROM "TrainerNote" n WHERE n."id" = e."noteId");
  END IF;
END $$;
