export interface UserCourse {
  courseId: number;
  courseName: string;
  startedAt: Date | null;
  completedAt?: Date | null;
  completedDays: number[];
}

export interface UserWithTrainings {
  id: string;
  username: string;
  phone: string;
  courses: UserCourse[];
}
export interface PublicProfile {
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  profile: {
    fullName: string | null;
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
  pets: {
    id: string;
    name: string;
    type: string;
    breed: string;
    birthDate: Date | null;
    heightCm: number | null;
    weightKg: number | null;
    photoUrl: string | null;
    notes: string | null;
    ownerId: string;
    awards: {
      id: string;
      title: string;
      event: string | null;
      date: Date;
      rank: string | null;
    }[];
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
