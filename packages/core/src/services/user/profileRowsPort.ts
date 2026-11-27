import type { PublicProfile } from "@gafus/types";

/** Owner-scoped profile persistence port. Core owns all public DTO filtering,
 * birthDate normalization, avatar CDN upload/compensation and chat badge
 * policy; the identity-write adapter owns exact row selects and the avatar
 * owner lock + URL upsert in one PostgreSQL transaction.
 */
export type ProfileEditFields = Partial<
  Record<"fullName" | "city" | "about" | "telegram" | "instagram" | "website", string | null>
> & { birthDate?: Date | null };
export type ProfileEditCreateFields = ProfileEditFields & {
  user: { connect: { id: string } };
};
export type ProfileDbRow = {
  id: string; userId: string;
  fullName: string | null; city: string | null; cityKey: string | null;
  birthDate: Date | null; about: string | null;
  telegram: string | null; instagram: string | null; website: string | null;
  avatarUrl: string | null; createdAt: Date; updatedAt: Date;
};
export type PublicProfileDbRow = {
  id: string; username: string; role: PublicProfile["role"];
  profile: {
    fullName: string | null; city: string | null; birthDate: Date | null;
    about: string | null; telegram: string | null;
    instagram: string | null; website: string | null; avatarUrl: string | null;
  } | null;
  diplomas: {
    id: string; title: string; issuedBy: string | null;
    issuedAt: Date | null; url: string | null;
  }[];
  pets: {
    id: string; name: string; type: string; breed: string | null;
    birthDate: Date | null; photoUrl: string | null;
  }[];
  authoredCourses: {
    id: string; name: string; type: string; logoImg: string;
    shortDesc: string; duration: string; isPrivate: boolean; isPaid: boolean;
    avgRating: number | null; updatedAt: Date;
    trainingLevel: NonNullable<PublicProfile["courses"]>[number]["trainingLevel"];
  }[];
};
export type UserTrainingProfileRow = {
  id: string; username: string; phone: string | null; email: string | null;
  accounts: {id:string}[];
  userCourses: {
    courseId: string; startedAt: Date | null; completedAt: Date | null;
    course: {id:string;name:string;dayLinks:{id:string}[]};
  }[];
  userTrainings: {
    status: string;
    dayOnCourse: {
      order: number;
      day: {id:string;title:string;type:string};
      course: {id:string;name:string};
    };
  }[];
};
export type ProfileForApiDbRow = {
  id: string; username: string; phone: string | null; email: string | null;
  role: string; passwordSetAt: Date | null;
  onboardingTourCompletedAt: Date | null; accounts: {id:string}[];
  profile: {
    fullName: string | null; city: string | null; about: string | null;
    telegram: string | null; instagram: string | null; website: string | null;
    birthDate: Date | null; avatarUrl: string | null;
  } | null;
};
export interface ProfileRowsPort {
  readUserProfileRow(userId: string): Promise<ProfileDbRow | null>;
  upsertProfileFields(userId: string, fields: ProfileEditFields, create: ProfileEditCreateFields): Promise<ProfileDbRow>;
  readProfileActorExists(userId: string): Promise<{id:string} | null>;
  readUserIdByUsernameRow(username: string): Promise<{id:string} | null>;
  readPublicProfileRow(username: string): Promise<PublicProfileDbRow | null>;
  replaceProfileAvatarRow(userId: string, avatarUrl: string): Promise<string | null>;
  readUserWithTrainingsRow(userId: string): Promise<UserTrainingProfileRow | null>;
  readUserProfileForApiRow(userId: string): Promise<ProfileForApiDbRow | null>;
  readOnboardingTourStatusRow(userId: string): Promise<{onboardingTourCompletedAt:Date|null} | null>;
  markOnboardingTourSeenRow(userId: string): Promise<{onboardingTourCompletedAt:Date|null}>;
  readPaidChatDisplayEntitlement(userId: string, now: Date): Promise<boolean>;
}
export function requireProfileRowsPort(port: ProfileRowsPort | undefined): Readonly<ProfileRowsPort> {
  if (!port) throw new Error("PROFILE_ROWS_PORT_UNBOUND");
  return port;
}
