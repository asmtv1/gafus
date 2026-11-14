/** Compile-time check: Prisma schema cannot diverge from public consultation DTO enum values. */
import type {
  ConsultationBookingStatus as DbBookingStatus,
  ConsultationPetGender as DbPetGender,
  ConsultationSlotStatus as DbSlotStatus,
} from "@gafus/prisma";
import type {
  ConsultationBookingStatus as SharedBookingStatus,
  ConsultationPetGender as SharedPetGender,
  ConsultationSlotStatus as SharedSlotStatus,
} from "@gafus/consultation-shared/types";
type Equal<A,B> = (<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2) ? true:false;
type Assert<T extends true> = T;
type _DbBookingParity=Assert<Equal<DbBookingStatus,SharedBookingStatus>>;
type _DbPetParity=Assert<Equal<DbPetGender,SharedPetGender>>;
type _DbSlotParity=Assert<Equal<DbSlotStatus,SharedSlotStatus>>;
