/** Compile-time check of DB enum exhaustiveness without bringing Prisma into Core. */
import type {UserRole,RegistrationChannel} from "@gafus/prisma";
import type {GafusUserRole,GafusRegistrationChannel} from "@gafus/types";
type Equal<A,B> = (<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2) ? true:false;
type Assert<T extends true> = T;
type _UserRoleParity=Assert<Equal<UserRole,GafusUserRole>>;
type _RegistrationChannelParity=Assert<Equal<RegistrationChannel,GafusRegistrationChannel>>;
