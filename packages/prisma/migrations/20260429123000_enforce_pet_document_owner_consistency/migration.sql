-- Удаляем неконсистентные документы, если ownerId не совпадает с владельцем питомца.
DELETE FROM "PetDocument" pd
WHERE NOT EXISTS (
  SELECT 1
  FROM "Pet" p
  WHERE p."id" = pd."petId"
    AND p."ownerId" = pd."ownerId"
);

-- Усиливаем связь: документ должен ссылаться на пару (petId, ownerId) из Pet.
ALTER TABLE "PetDocument" DROP CONSTRAINT "PetDocument_petId_fkey";

ALTER TABLE "Pet"
ADD CONSTRAINT "Pet_id_ownerId_key" UNIQUE ("id", "ownerId");

CREATE INDEX "PetDocument_petId_ownerId_idx" ON "PetDocument"("petId", "ownerId");

ALTER TABLE "PetDocument"
ADD CONSTRAINT "PetDocument_petId_ownerId_fkey"
FOREIGN KEY ("petId", "ownerId")
REFERENCES "Pet"("id", "ownerId")
ON DELETE CASCADE
ON UPDATE CASCADE;
