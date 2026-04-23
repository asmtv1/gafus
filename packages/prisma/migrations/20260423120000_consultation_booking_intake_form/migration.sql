-- Форма заявки: владелец, телефон, данные питомца, самопомощь (старые брони остаются с NULL)
CREATE TYPE "ConsultationPetGender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "ConsultationBooking" ADD COLUMN "clientOwnerName" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "clientPhone" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "petName" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "petGender" "ConsultationPetGender";
ALTER TABLE "ConsultationBooking" ADD COLUMN "petAge" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "petBreed" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "clientSelfHelpAttempt" TEXT;
