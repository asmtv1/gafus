// Типы для работы с пользователями

/** Подсказка в UI, если в учётной записи нет email. */
export const USER_EMAIL_MISSING_HINT = "Email отсутствует, напишите в поддержку";

export interface UpdateUserProfileInput {
  fullName: string;
  city?: string;
  about: string;
  telegram: string;
  instagram: string;
  website: string;
  birthDate: string;
}

export interface UserCourseInfo {
  courseId: string;
  courseName: string;
  startedAt: Date | null;
  completedAt?: Date | null;
  completedDays: number[];
  totalDays: number;
}

export interface UserWithTrainings {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  courses: UserCourseInfo[];
  hasVkLinked?: boolean;
}

/** Only these pet fields may be returned to profile visitors. */
export interface PublicPet {
  id: string;
  name: string;
  type: string;
  breed: string;
  birthDate: Date | null;
  photoUrl: string | null;
}

export interface PublicProfile {
  chatRole?: "admin" | "trainer" | "subscriber" | null;
  username: string;
  role: "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER";
  profile: {
    fullName: string | null;
    city?: string | null;
    birthDate: Date | null;
    about: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    avatarUrl: string | null;
  } | null;
  diplomas: {
    id: string;
    title: string;
    issuedBy: string | null;
    issuedAt: Date;
    url?: string;
  }[];
  pets: PublicPet[];
  courses?: {
    id: string;
    name: string;
    type: string;
    logoImg: string;
    shortDesc: string;
    duration: string;
    isPrivate: boolean;
    isPaid: boolean;
    avgRating: number | null;
    updatedAt: Date;
    trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  }[];
}

export interface BioFormData {
  fullName: string;
  birthDate: string;
  about: string;
  telegram: string;
  instagram: string;
  website: string;
  userId: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  fullName: string | null;
  about: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
  birthDate: Date | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
