export interface UserProfile {
  id: string;
  userId: string;
  fullName: string | null; // опционально, вместо nullable
  birthDate: Date | null; // ISO строка, опционально
  about: string | null;
  telegram?: string | null;
  instagram?: string | null;
  website?: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
