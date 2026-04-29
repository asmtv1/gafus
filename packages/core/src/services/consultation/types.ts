import type {
  BookSlotResult,
  ConsultationAvailabilityRuleDto,
  ConsultationBookingDto,
  ConsultationBookingStatus as SharedConsultationBookingStatus,
  ConsultationPetGender as SharedConsultationPetGender,
  ConsultationSlotDto,
  ConsultationSlotStatus as SharedConsultationSlotStatus,
  DayOffDto,
  ListedCynologistCardDto,
  SlotExceptionDto,
} from "@gafus/consultation-shared";
import type {
  ConsultationBookingStatus,
  ConsultationPetGender,
  ConsultationSlotStatus,
} from "@gafus/prisma";

export type {
  BookSlotResult,
  ConsultationAvailabilityRuleDto,
  ConsultationBookingDto,
  ConsultationSlotDto,
  DayOffDto,
  ListedCynologistCardDto,
  SlotExceptionDto,
};

type IsExactlyEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type AssertTrue<T extends true> = T;

type _AssertBookingStatusSync = AssertTrue<
  IsExactlyEqual<ConsultationBookingStatus, SharedConsultationBookingStatus>
>;
type _AssertPetGenderSync = AssertTrue<
  IsExactlyEqual<ConsultationPetGender, SharedConsultationPetGender>
>;
type _AssertSlotStatusSync = AssertTrue<
  IsExactlyEqual<ConsultationSlotStatus, SharedConsultationSlotStatus>
>;
