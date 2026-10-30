-- AG4 test-only VetVisits exact isolated scratch database, never production.
DO $$ BEGIN
 IF current_database()<>'gafus_ag1_vet_20261018_selectonly' THEN RAISE EXCEPTION 'VET_WRONG_DB'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ag1_vet_ro_20261018_selectonly') THEN RAISE EXCEPTION 'VET_READ_ROLE_ALREADY_EXISTS'; END IF;
END $$;
CREATE ROLE ag1_vet_ro_20261018_selectonly LOGIN NOINHERIT;
REVOKE CREATE,TEMP ON DATABASE gafus_ag1_vet_20261018_selectonly FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE gafus_ag1_vet_20261018_selectonly TO ag1_vet_ro_20261018_selectonly;
GRANT USAGE ON SCHEMA public TO ag1_vet_ro_20261018_selectonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ag1_vet_ro_20261018_selectonly;
ALTER ROLE ag1_vet_ro_20261018_selectonly IN DATABASE gafus_ag1_vet_20261018_selectonly SET default_transaction_read_only=on;
ALTER ROLE ag1_vet_ro_20261018_selectonly IN DATABASE gafus_ag1_vet_20261018_selectonly SET statement_timeout='5000ms';
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10000ms';
DO $$ BEGIN
 IF (SELECT count(*) FROM "_prisma_migrations")<>140 OR (SELECT count(*) FROM "User")<>0
 OR (SELECT count(*) FROM "Pet")<>0 OR (SELECT count(*) FROM "PetVetVisit")<>0
 OR (SELECT count(*) FROM "PetVetAttachment")<>0 OR (SELECT count(*) FROM "GalleryStorageJob")<>0
 THEN RAISE EXCEPTION 'VET_SCRATCH_NOT_EMPTY'; END IF;
END $$;
INSERT INTO "User" (id,username,password,role,"registrationPending") VALUES
 ('ag1vet_owner_a_20261018','ag1vetowner_a_20261018','SYNTHETIC_TEST_ONLY','USER',false),
 ('ag1vet_owner_b_20261018','ag1vetowner_b_20261018','SYNTHETIC_TEST_ONLY','USER',false);
INSERT INTO "Pet" (id,"ownerId",name,type,breed,"birthDate") VALUES
 ('ag1vet_pet_a_20261018','ag1vet_owner_a_20261018','Synthetic A','DOG','TEST', '2023-01-01T00:00:00Z'),
 ('ag1vet_pet_empty_a_20261018','ag1vet_owner_a_20261018','Synthetic Empty A','DOG','TEST','2023-01-01T00:00:00Z'),
 ('ag1vet_pet_b_20261018','ag1vet_owner_b_20261018','Synthetic B','DOG','TEST','2023-01-01T00:00:00Z');
INSERT INTO "PetVetVisit" (id,"petId","ownerId","visitedOn",specialty,"doctorName",clinic,diagnosis,conclusion,notes,"updatedAt") VALUES
 ('ag1vet_visit_a_20261018','ag1vet_pet_a_20261018','ag1vet_owner_a_20261018','2026-10-01','SYNTHETIC_VET','SYNTHETIC_DOCTOR','SYNTHETIC_CLINIC','SYNTHETIC_DIAG_A','SYNTHETIC_CONCLUSION_A','SYNTHETIC_NOTES_A',now()),
 ('ag1vet_visit_b_20261018','ag1vet_pet_b_20261018','ag1vet_owner_b_20261018','2026-10-02','SYNTHETIC_VET','SYNTHETIC_DOCTOR','SYNTHETIC_CLINIC','SYNTHETIC_DIAG_B','SYNTHETIC_CONCLUSION_B','SYNTHETIC_NOTES_B',now());
DO $$ BEGIN
 IF (SELECT count(*) FROM "User")<>2 OR (SELECT count(*) FROM "Pet")<>3
 OR (SELECT count(*) FROM "PetVetVisit")<>2 OR (SELECT count(*) FROM "PetVetAttachment")<>0
 OR (SELECT count(*) FROM "GalleryStorageJob")<>0 OR (SELECT count(*) FROM "_prisma_migrations")<>140
 THEN RAISE EXCEPTION 'VET_SYNTHETIC_SEED_MISMATCH'; END IF;
END $$;
COMMIT;
